/**
 * Pi-style footer under the input: two dim lines.
 *
 *   ~/Developer (main) • session title
 *   ↑1.2k ↓300 12.3%/200k          (provider) model • effort
 *
 * Line 1 is the working directory (home collapsed to `~`) plus the git
 * branch and session title. Line 2 puts cumulative token counters and the
 * context usage on the left, and the `(provider) model` identity on the
 * right, right-aligned with a two-column gutter; the context percentage
 * turns warning/error colored as the window fills (>70% / >90%), mirroring
 * pi. A third line appears only while there is transient activity
 * (connecting / disconnected / mid-turn / delegated subagents).
 * @module dsh-tui/ui/StatusBar
 */

import type { JSX } from 'react'
import { Box, Text, useWindowSize } from 'ink'
import stringWidth from 'string-width'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { TuiState } from '../events/reducer.js'
import { elapsedSeconds, useNow } from './useNow.js'
import { palette } from './theme.js'

const PHASE_LABEL: Record<TuiState['phase'], string> = {
  idle: 'idle',
  working: 'working',
  thinking: 'thinking',
  'tool-running': 'tool',
  error: 'error',
}

const CONNECTION_MARK: Record<TuiState['connection'], string> = {
  connecting: '◌',
  connected: '●',
  disconnected: '✗',
}

const CONNECTION_COLOR: Record<TuiState['connection'], string> = {
  connecting: palette.warning,
  connected: palette.ok,
  disconnected: palette.error,
}

/** Compact token count in pi's footer style (1.0M, 128k, 9.5k, 832). */
function formatTokens(count: number): string {
  if (count < 1000) return `${count}`
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`
  if (count < 1000000) return `${Math.round(count / 1000)}k`
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`
  return `${Math.round(count / 1000000)}M`
}

/** Collapse the home directory prefix to `~` (pi's footer cwd format). */
function formatCwdForFooter(cwd: string, home: string | undefined): string {
  if (home === undefined || home === '') return cwd
  const resolvedCwd = resolve(cwd)
  const resolvedHome = resolve(home)
  const relativeToHome = relative(resolvedHome, resolvedCwd)
  const isInsideHome =
    relativeToHome === ''
    || (relativeToHome !== '..' && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome))
  if (!isInsideHome) return cwd
  return relativeToHome === '' ? '~' : `~${sep}${relativeToHome}`
}

/** Cut `text` to `maxWidth` display columns, appending `suffix` when cut. */
function truncateToWidth(text: string, maxWidth: number, suffix = ''): string {
  if (maxWidth <= 0) return ''
  if (stringWidth(text) <= maxWidth) return text
  const suffixWidth = stringWidth(suffix)
  let width = 0
  let out = ''
  for (const ch of text) {
    const w = stringWidth(ch)
    if (width + w > maxWidth - suffixWidth) break
    out += ch
    width += w
  }
  return out + suffix
}

/** One colored segment of the stats line: plain text plus an optional color. */
interface StatChunk {
  text: string
  color?: string
}

/** Pi-style dim footer: cwd/branch line, stats + model line, activity line. */
export function StatusBar(props: { state: TuiState; cwd: string; gitBranch: string }): JSX.Element {
  const { state, cwd, gitBranch } = props
  const now = useNow(1000)
  // Live width: re-renders on resize so truncation math never goes stale.
  const { columns } = useWindowSize()
  const width = Math.max(1, columns)

  // Line 1 — `~cwd (branch)` + session title, like pi's footer head.
  let pwdLine = formatCwdForFooter(cwd, process.env.HOME ?? process.env.USERPROFILE)
  if (gitBranch !== '') pwdLine = `${pwdLine} (${gitBranch})`
  if (state.title !== '') pwdLine = `${pwdLine} • ${state.title}`
  pwdLine = truncateToWidth(pwdLine, width, '...')

  // Line 2 left — cumulative token counters (only when non-zero) + context usage.
  const elapsed = state.turnStartedAt > 0 ? elapsedSeconds(state.turnStartedAt, now) : 0
  const statsChunks: StatChunk[] = []
  if (state.tokens.input > 0) statsChunks.push({ text: `↑${formatTokens(state.tokens.input)}` })
  if (state.tokens.output > 0) statsChunks.push({ text: `↓${formatTokens(state.tokens.output)}` })
  const contextPct = state.contextWindow > 0 ? (state.tokens.input / state.contextWindow) * 100 : null
  const contextDisplay =
    contextPct === null ? '?' : `${contextPct.toFixed(1)}%/${formatTokens(state.contextWindow)}`
  statsChunks.push({
    text: contextDisplay,
    color: contextPct !== null && contextPct > 90 ? palette.error : contextPct !== null && contextPct > 70 ? palette.warning : undefined,
  })

  // Line 2 right — `(provider) model`, plus the effort level like pi's thinking indicator.
  const modelName = state.model === '' ? 'no-model' : state.model
  let modelLine = state.provider === '' ? modelName : `(${state.provider}) ${modelName}`
  if (state.effort !== '') modelLine = `${modelLine} • ${state.effort}`
  modelLine = truncateToWidth(modelLine, width)
  const modelWidth = stringWidth(modelLine)

  // Fit left + gutter(2) + right into the terminal width; truncate the left
  // chunks first, then pad so the model stays right-aligned.
  const availableForStats = modelLine === '' ? width : width - modelWidth - 2
  const rendered: StatChunk[] = []
  let usedWidth = 0
  for (const chunk of statsChunks) {
    const gap = rendered.length > 0 ? 1 : 0
    const budget = availableForStats - usedWidth - gap
    if (budget <= 0) break
    const text = truncateToWidth(chunk.text, budget)
    if (text === '') break
    rendered.push({ text, color: chunk.color })
    usedWidth += gap + stringWidth(text)
  }
  const gutter = ' '.repeat(Math.max(0, width - usedWidth - modelWidth))

  // Line 3 — transient activity only; hidden when idle so the footer matches pi.
  // The connection mark renders separately so it can carry its own color.
  const activity: string[] = []
  if (state.connection !== 'connected') activity.push(state.connection)
  if (state.phase !== 'idle') activity.push(PHASE_LABEL[state.phase])
  if (state.activeToolCount > 0) activity.push(`${state.activeToolCount} 工具`)
  if (elapsed > 0) activity.push(`${elapsed}s`)
  if (state.subagents.length > 0) activity.push(`${state.subagents.length} 子代理`)

  return (
    <Box flexDirection="column">
      <Text dimColor wrap="truncate">{pwdLine}</Text>
      <Text wrap="truncate">
        {rendered.map((chunk, index) => (
          <Text key={index} dimColor={chunk.color === undefined} color={chunk.color}>
            {index === 0 ? chunk.text : ` ${chunk.text}`}
          </Text>
        ))}
        <Text dimColor>{`${gutter}${modelLine}`}</Text>
      </Text>
      {activity.length > 0 && (
        <Text dimColor wrap="truncate">
          <Text color={state.connection === 'connected' ? undefined : CONNECTION_COLOR[state.connection]}>
            {state.connection === 'connected' ? '' : `${CONNECTION_MARK[state.connection]} `}
          </Text>
          {activity.join(' · ')}
        </Text>
      )}
    </Box>
  )
}
