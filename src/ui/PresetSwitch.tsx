/**
 * Agent-preset switch: pick one of the shipped agent presets (standard /
 * code / minimal / cordis) used to compose new sessions. Pi-style plain
 * selector below the input. The choice is passed to the agent factory
 * (`meta.agentPreset`) on the next `/new`; a preset roster must be mounted
 * for it to change the tool world.
 * @module dsh-tui/ui/PresetSwitch
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import { AGENT_PRESETS, type AgentPreset } from '../presets.js'
import { MenuList, type MenuRow } from './MenuList.js'
import { SELECTOR_MAX_VISIBLE } from './SessionBrowser.js'

/** Selector for choosing the agent preset for new sessions. */
export function PresetSwitch(props: {
  current: AgentPreset
  onSelect: (preset: AgentPreset) => void
  onClose: () => void
}): JSX.Element {
  const { current, onSelect, onClose } = props
  const { columns } = useWindowSize()
  const count = AGENT_PRESETS.length as number
  const [index, setIndex] = useState(Math.max(0, AGENT_PRESETS.findIndex(preset => preset === current)))
  const clamped = count === 0 ? 0 : index % count

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onClose()
      return
    }
    if (key.return) {
      const picked = AGENT_PRESETS[clamped]
      if (picked !== undefined) onSelect(picked)
      return
    }
    if (key.upArrow) setIndex(i => (i - 1 + count) % Math.max(1, count))
    if (key.downArrow) setIndex(i => (i + 1) % Math.max(1, count))
  })

  const rows: MenuRow[] = AGENT_PRESETS.map(preset => ({
    label: preset,
    meta: preset === current ? '(current)' : undefined,
  }))

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text dimColor>preset — 新会话组合的 agent 预设 · ↑/↓ 选择 · Enter 应用 · Esc 关闭</Text>
      <MenuList rows={rows} selected={clamped} width={columns} maxVisible={SELECTOR_MAX_VISIBLE} />
      <Text dimColor>/new 后生效 · 默认 patch 未挂 agent-presets roster（需刻意启用）</Text>
    </Box>
  )
}
