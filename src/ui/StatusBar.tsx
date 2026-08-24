/**
 * R4 — working status line: connection + agent phase + session/model/turn.
 * @module dsh-tui/ui/StatusBar
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import type { TuiState } from '../events/reducer.js'

const PHASE: Record<TuiState['phase'], { label: string; color: string }> = {
  idle: { label: 'idle', color: 'gray' },
  working: { label: 'working', color: 'cyan' },
  thinking: { label: 'thinking', color: 'yellow' },
  'tool-running': { label: 'tool', color: 'magenta' },
  error: { label: 'error', color: 'red' },
}

const CONNECTION: Record<TuiState['connection'], { label: string; color: string }> = {
  connecting: { label: 'connecting…', color: 'yellow' },
  connected: { label: '●', color: 'green' },
  disconnected: { label: '✗', color: 'red' },
}

/** The single status line above the chat area. */
export function StatusBar(props: { state: TuiState }): JSX.Element {
  const { state } = props
  const phase = PHASE[state.phase]
  const connection = CONNECTION[state.connection]
  const shortId = state.sessionId.length > 14 ? state.sessionId.slice(0, 14) : state.sessionId
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} gap={2}>
      <Text color={connection.color}>{connection.label}</Text>
      <Text color={phase.color}>{phase.label}</Text>
      <Text color="gray">turn {state.turn}·{state.step}</Text>
      <Text color="gray">model {state.model === '' ? '…' : state.model}</Text>
      <Text dimColor>{shortId}</Text>
    </Box>
  )
}