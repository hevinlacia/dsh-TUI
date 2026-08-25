/**
 * Agent-preset switch modal: pick one of the shipped agent presets
 * (standard / code / minimal / cordis) used to compose new sessions. The
 * choice is passed to the agent factory (`meta.agentPreset`) on the next
 * `/new`; a preset roster must be mounted for it to change the tool world.
 * @module dsh-tui/ui/PresetSwitch
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput } from 'ink'
import { AGENT_PRESETS, type AgentPreset } from '../presets.js'

/** Modal overlay for choosing the agent preset for new sessions. */
export function PresetSwitch(props: {
  current: AgentPreset
  onSelect: (preset: AgentPreset) => void
  onClose: () => void
}): JSX.Element {
  const { current, onSelect, onClose } = props
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

  return (
    <Box
      position="absolute"
      top={6}
      left={0}
      right={0}
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      <Box>
        <Text bold color="cyan">preset — 新会话组合的 agent 预设</Text>
      </Box>
      {AGENT_PRESETS.map((preset, row) => (
        <Box key={preset}>
          <Text color={row === clamped ? 'cyan' : 'gray'}>{row === clamped ? '› ' : '  '}</Text>
          <Text color={row === clamped ? 'cyan' : undefined}>{preset}</Text>
          {preset === current && <Text dimColor> (current)</Text>}
        </Box>
      ))}
      <Text dimColor>/new 后生效 · 默认 patch 未挂 agent-presets roster（需刻意启用）</Text>
    </Box>
  )
}
