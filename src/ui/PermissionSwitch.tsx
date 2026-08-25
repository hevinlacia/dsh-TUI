/**
 * Permission-switch modal: pick one of the three DSH sandbox/permission levels
 * for the current session (read-only / workspace-write / danger-full-access).
 * Selecting applies the sandbox mode + the matching approval policy.
 * @module dsh-tui/ui/PermissionSwitch
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput } from 'ink'
import { PERMISSION_LEVELS, type PermissionMode } from '../permission.js'

/** Modal overlay for switching the session's permission level. */
export function PermissionSwitch(props: {
  current: PermissionMode
  onSelect: (mode: PermissionMode) => void
  onClose: () => void
}): JSX.Element {
  const { current, onSelect, onClose } = props
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

  return (
    <Box
      position="absolute"
      top={6}
      left={0}
      right={0}
      borderStyle="double"
      borderColor="magenta"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      <Box>
        <Text bold color="magenta">permission — 影响本会话沙箱 + 确认策略</Text>
      </Box>
      {PERMISSION_LEVELS.map((level, row) => (
        <Box key={level.mode}>
          <Text color={row === clamped ? 'magenta' : 'gray'}>{row === clamped ? '› ' : '  '}</Text>
          <Text color={row === clamped ? 'magenta' : undefined}>{`${level.label} · ${level.description}`}</Text>
          {level.mode === current && <Text dimColor> (current)</Text>}
        </Box>
      ))}
    </Box>
  )
}
