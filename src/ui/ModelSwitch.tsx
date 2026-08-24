/**
 * W7 — model switch modal: pick a model from the configured list. Applies to
 * subsequently created sessions (protocol-level `initialize` re-send).
 * @module dsh-tui/ui/ModelSwitch
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput } from 'ink'

/** Modal overlay for switching the model for new sessions. */
export function ModelSwitch(props: {
  models: string[]
  current: string
  onSelect: (model: string) => void
  onClose: () => void
}): JSX.Element {
  const { models, current, onSelect, onClose } = props
  const [index, setIndex] = useState(Math.max(0, models.indexOf(current)))
  const clamped = models.length === 0 ? 0 : index % models.length

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onClose()
      return
    }
    if (key.return) {
      const picked = models[clamped]
      if (picked !== undefined) onSelect(picked)
      return
    }
    if (key.upArrow) setIndex(i => (i - 1 + models.length) % Math.max(1, models.length))
    if (key.downArrow) setIndex(i => (i + 1) % Math.max(1, models.length))
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
      {models.length === 0 && <Text dimColor>no models configured (DSH_TUI_MODELS)</Text>}
      {models.map((model, row) => (
        <Box key={model}>
          <Text color={row === clamped ? 'green' : 'gray'}>{row === clamped ? '› ' : '  '}</Text>
          <Text color={row === clamped ? 'green' : undefined}>{model}</Text>
          {model === current && <Text dimColor> (current)</Text>}
        </Box>
      ))}
    </Box>
  )
}