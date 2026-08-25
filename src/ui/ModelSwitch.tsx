/**
 * W7 — model switch modal: pick a model from the configured list (from dsh's
 * settings document). Applies to subsequently created sessions
 * (protocol-level `initialize` re-send).
 * @module dsh-tui/ui/ModelSwitch
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ModelOption } from '../config.js'

/** Modal overlay for switching the model for new sessions. */
export function ModelSwitch(props: {
  options: ModelOption[]
  current: string
  onSelect: (option: ModelOption) => void
  onClose: () => void
}): JSX.Element {
  const { options, current, onSelect, onClose } = props
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

  return (
    <Box
      position="absolute"
      top={6}
      left={0}
      right={0}
      borderStyle="double"
      borderColor="green"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      <Box>
        <Text bold color="green">model switch — applies to new sessions (/new)</Text>
      </Box>
      {options.length === 0 && <Text dimColor>no models configured</Text>}
      {options.map((option, row) => (
        <Box key={`${option.provider}/${option.id}`}>
          <Text color={row === clamped ? 'green' : 'gray'}>{row === clamped ? '› ' : '  '}</Text>
          <Text color={row === clamped ? 'green' : undefined}>{`${option.provider} · ${option.name}`}</Text>
          {option.id === current && <Text dimColor> (current)</Text>}
        </Box>
      ))}
    </Box>
  )
}
