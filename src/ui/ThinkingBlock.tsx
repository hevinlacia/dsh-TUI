/**
 * A2 — streaming thinking block. Shows live reasoning dimmed and italic-ish;
 * collapses to a one-line header once completed (press `t` in the app to
 * toggle all thinking blocks).
 * @module dsh-tui/ui/ThinkingBlock
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'

/** Collapsible reasoning display. */
export function ThinkingBlock(props: { thinking: string; open: boolean }): JSX.Element {
  const { thinking, open } = props
  const single = thinking.split('\n')[0] ?? ''
  if (!open) {
    return (
      <Box>
        <Text color="yellow" dimColor>⟳ thinking · {single.length > 60 ? `${single.slice(0, 60)}…` : single} (press t)</Text>
      </Box>
    )
  }
  return (
    <Box borderStyle="round" borderColor="yellow" paddingX={1} marginY={0} flexDirection="column">
      <Text color="yellow" dimColor bold>⟳ thinking</Text>
      <Text color="yellow" dimColor wrap="wrap">{thinking}{thinking.endsWith('\n') ? '' : '▍'}</Text>
    </Box>
  )
}