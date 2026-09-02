/**
 * Agent-preset switch: pick a preset from the LIVE agent-presets roster
 * (shipped four + user presets from `~/.dsh/.agent-presets`, e.g. `hevin`).
 * Pi-style plain selector below the input. The choice is passed to the agent
 * factory (`meta.agentPreset`) on the next `/new`.
 * @module dsh-tui/ui/PresetSwitch
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import type { PresetInfo } from '../presets.js'
import { MenuList, type MenuRow } from './MenuList.js'
import { SELECTOR_MAX_VISIBLE } from './SessionBrowser.js'

/** Selector for choosing the agent preset for new sessions. */
export function PresetSwitch(props: {
  presets: readonly PresetInfo[]
  current: string
  onSelect: (preset: string) => void
  onClose: () => void
}): JSX.Element {
  const { presets, current, onSelect, onClose } = props
  const { columns } = useWindowSize()
  const count = presets.length
  const [index, setIndex] = useState(Math.max(0, presets.findIndex(preset => preset.id === current)))
  const clamped = count === 0 ? 0 : index % count

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onClose()
      return
    }
    if (key.return) {
      const picked = presets[clamped]
      if (picked !== undefined) onSelect(picked.id)
      return
    }
    if (key.upArrow) setIndex(i => (i - 1 + count) % Math.max(1, count))
    if (key.downArrow) setIndex(i => (i + 1) % Math.max(1, count))
  })

  const rows: MenuRow[] = presets.map(preset => ({
    label: preset.id,
    meta: `${preset.description ?? ''}${preset.id === current ? ' · (current)' : ''}`.trim() || undefined,
  }))

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text dimColor>preset — 新会话组合的 agent 预设 · ↑/↓ 选择 · Enter 应用 · Esc 关闭</Text>
      {count === 0
        ? <Text dimColor>no presets discovered</Text>
        : <MenuList rows={rows} selected={clamped} width={columns} maxVisible={SELECTOR_MAX_VISIBLE} />}
      <Text dimColor>/new 后生效 · 用户预设目录 ~/.dsh/.agent-presets（改动即时可见，无需重启）</Text>
    </Box>
  )
}
