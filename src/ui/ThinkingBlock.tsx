/**
 * A2 — thinking block. Collapsed: `:: Thinking · Ns (t to expand)`; expanded:
 * the reasoning text dimmed with a closing caret. Live elapsed via a ticker.
 * @module dsh-tui/ui/ThinkingBlock
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import { elapsedSeconds, useNow } from './useNow.js'
import { palette } from './theme.js'

/** Collapsible reasoning display. */
export function ThinkingBlock(props: { thinking: string; open: boolean; startedAt?: number }): JSX.Element {
  const { thinking, open, startedAt } = props
  const now = useNow(1000)
  const elapsed = elapsedSeconds(startedAt, now)
  const firstLine = thinking.split('\n')[0] ?? ''

  if (!open) {
    return (
      <Box>
        <Text color={palette.thinkingLabel} dimColor>
          :: Thinking · {elapsed}s <Text color="gray" dimColor>(t to expand)</Text>
        </Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text color={palette.thinkingLabel} dimColor>{`:: Thinking · ${elapsed}s`}</Text>
      <Text color={palette.thinkingText} dimColor wrap="wrap">
        {thinking}{thinking.endsWith('\n') ? '' : '▍'}
      </Text>
      {firstLine !== '' && <Text dimColor>{'\n'}────────────────</Text>}
    </Box>
  )
}