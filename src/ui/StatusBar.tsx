/**
 * R4 — rich single-line status footer: left (model·effort·tokens), middle
 * (phase/tools/elapsed + context usage), right (git · project · session).
 * @module dsh-tui/ui/StatusBar
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import { basename } from 'node:path'
import type { TuiState } from '../events/reducer.js'
import { elapsedSeconds, useNow } from './useNow.js'
import { palette, labels } from './theme.js'

const PHASE_LABEL: Record<TuiState['phase'], string> = {
  idle: 'idle',
  working: 'working',
  thinking: 'thinking',
  'tool-running': 'tool',
  error: 'error',
}

const CONNECTION_DOT: Record<TuiState['connection'], string> = {
  connecting: '◌',
  connected: '●',
  disconnected: '✗',
}

/** Compact token count (k/M). */
function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${n}`
}

/** The whole footer as one line. */
export function StatusBar(props: { state: TuiState; cwd: string; gitBranch: string }): JSX.Element {
  const { state, cwd, gitBranch } = props
  const now = useNow(1000)
  const project = basename(cwd)
  const elapsed = state.turnStartedAt > 0 ? elapsedSeconds(state.turnStartedAt, now) : 0
  const contextUsed = state.tokens.input
  const contextPct = state.contextWindow > 0 ? `${(contextUsed / state.contextWindow * 100).toFixed(1)}%` : '–'
  const contextRemaining = state.contextWindow > 0 ? ` ${compactTokens(state.contextWindow - contextUsed)}` : ''
  const shortId = state.sessionId.length > 14 ? state.sessionId.slice(0, 14) : state.sessionId
  const model = state.model === '' ? 'model' : state.model
  const effort = state.effort === '' ? '' : ` · ${state.effort}`
  const phase = PHASE_LABEL[state.phase]
  const tokensOut = `↗${compactTokens(state.tokens.output)}`
  const tools = state.activeToolCount > 0 ? `${state.activeToolCount} 工具` : '0 工具'

  return (
    <Box borderStyle="single" borderColor={palette.statusBarBorder} paddingX={1} flexDirection="row">
      <Text wrap="truncate">
        <Text color={CONNECTION_DOT[state.connection] === '✗' ? palette.error : palette.ok}>{CONNECTION_DOT[state.connection]}</Text>
        <Text bold color={palette.statusAccent}> spot</Text>
        <Text color={palette.accent}>{` ${model}${effort} · ${tokensOut}`}</Text>
        <Text dimColor>{` · ${phase}`}</Text>
        <Text dimColor>{` · ${tools}`}</Text>
        <Text dimColor>{elapsed > 0 ? ` · ${elapsed}s` : ''}</Text>
        <Text color={palette.accent} dimColor>{` · ctx ${compactTokens(contextUsed)}/${state.contextWindow > 0 ? compactTokens(state.contextWindow) : '–'} ${contextPct}${contextRemaining}`}</Text>
        <Text dimColor>
          {` · ${gitBranch !== '' ? gitBranch : '—'} · ${project} · ${shortId} · ${labels.shortcuts}`}
        </Text>
      </Text>
    </Box>
  )
}