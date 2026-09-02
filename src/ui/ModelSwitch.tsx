/**
 * W7 — model switch: pick a model from the configured list (from dsh's
 * settings document). Rendered as a pi-style plain selector BELOW the input
 * (no border, windowed). Applies to subsequently created sessions
 * (protocol-level `initialize` re-send).
 * @module dsh-tui/ui/ModelSwitch
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import type { ModelOption } from '../config.js'
import { MenuList, type MenuRow } from './MenuList.js'
import { SELECTOR_MAX_VISIBLE } from './SessionBrowser.js'

/** Selector for switching the model for new sessions. */
export function ModelSwitch(props: {
  options: ModelOption[]
  current: string
  onSelect: (option: ModelOption) => void
  onClose: () => void
}): JSX.Element {
  const { options, current, onSelect, onClose } = props
  const { columns } = useWindowSize()
  const [index, setIndex] = useState(Math.max(0, options.findIndex(option => option.id === current)))
  const clamped = options.length === 0 ? 0 : index % options.length

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onClose()
      return
    }
    if (key.return) {
      const picked = options[clamped]
      if (picked !== undefined) onSelect(picked)
      return
    }
    if (key.upArrow) setIndex(i => (i - 1 + options.length) % Math.max(1, options.length))
    if (key.downArrow) setIndex(i => (i + 1) % Math.max(1, options.length))
  })

  const rows: MenuRow[] = options.map(option => ({
    label: `${option.provider} · ${option.name}`,
    meta: option.id === current ? '(current)' : undefined,
  }))

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text dimColor>model switch — applies to new sessions (/new) · ↑/↓ 选择 · Enter 应用 · Esc 关闭</Text>
      <MenuList rows={rows} selected={clamped} width={columns} maxVisible={SELECTOR_MAX_VISIBLE} />
    </Box>
  )
}
