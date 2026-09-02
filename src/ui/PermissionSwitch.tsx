/**
 * Permission-switch: pick one of the three DSH sandbox/permission levels for
 * the current session (read-only / workspace-write / danger-full-access).
 * Pi-style plain selector below the input. Selecting applies the sandbox
 * mode + the matching approval policy.
 * @module dsh-tui/ui/PermissionSwitch
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import { PERMISSION_LEVELS, type PermissionMode } from '../permission.js'
import { MenuList, type MenuRow } from './MenuList.js'
import { SELECTOR_MAX_VISIBLE } from './SessionBrowser.js'

/** Selector for switching the session's permission level. */
export function PermissionSwitch(props: {
  current: PermissionMode
  onSelect: (mode: PermissionMode) => void
  onClose: () => void
}): JSX.Element {
  const { current, onSelect, onClose } = props
  const { columns } = useWindowSize()
  const [index, setIndex] = useState(Math.max(0, PERMISSION_LEVELS.findIndex(level => level.mode === current)))
  const clamped = PERMISSION_LEVELS.length === 0 ? 0 : index % PERMISSION_LEVELS.length

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onClose()
      return
    }
    if (key.return) {
      const picked = PERMISSION_LEVELS[clamped]
      if (picked !== undefined) onSelect(picked.mode)
      return
    }
    if (key.upArrow) setIndex(i => (i - 1 + PERMISSION_LEVELS.length) % Math.max(1, PERMISSION_LEVELS.length))
    if (key.downArrow) setIndex(i => (i + 1) % Math.max(1, PERMISSION_LEVELS.length))
  })

  const rows: MenuRow[] = PERMISSION_LEVELS.map(level => ({
    label: level.label,
    meta: `${level.description}${level.mode === current ? ' · (current)' : ''}`,
  }))

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text dimColor>permission — 影响本会话沙箱 + 确认策略 · ↑/↓ 选择 · Enter 应用 · Esc 关闭</Text>
      <MenuList rows={rows} selected={clamped} width={columns} maxVisible={SELECTOR_MAX_VISIBLE} />
    </Box>
  )
}
