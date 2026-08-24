/**
 * Transient gloss line: notices and errors between the chat and the input.
 * @module dsh-tui/ui/NoticeLine
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import type { TuiState } from '../events/reducer.js'

/** One-line notices (errors / command feedback / model switch). */
export function NoticeLine(props: { state: TuiState }): JSX.Element {
  const { state } = props
  if (state.notice === '' && state.error === '') return <Box minHeight={1} />
  return (
    <Box minHeight={1} paddingX={1}>
      {state.error !== ''
        ? <Text color="red" wrap="truncate">{state.error}</Text>
        : <Text dimColor wrap="truncate">{state.notice}</Text>}
    </Box>
  )
}