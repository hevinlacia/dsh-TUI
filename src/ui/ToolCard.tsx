/**
 * A1 — structured tool card: name, lifecycle badge, argument summary, and the
 * result output. Never plain text dumps; long outputs are capped per card.
 * @module dsh-tui/ui/ToolCard
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import type { ChatItem } from '../events/types.js'

const OUTPUT_CAP = 1200
const OUTPUT_LINES = 10

/** One tool call card (running / ok / error). */
export function ToolCard(props: { item: ChatItem & { kind: 'tool' } }): JSX.Element {
  const { item } = props
  const badge = item.status === 'running'
    ? { label: '◌ running', color: 'magenta' as const }
    : item.status === 'ok'
      ? { label: '✓ ok', color: 'green' as const }
      : { label: '✗ error', color: 'red' as const }
  const argsSummary = summarizeArgs(item.args)
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column" width="100%">
      <Box gap={1}>
        <Text color={badge.color} bold>{badge.label}</Text>
        <Text bold>{toolGlyph(item.name)} {item.name}</Text>
        {item.error && <Text color="red">{item.error.code ?? item.error.name ?? 'failed'}</Text>}
      </Box>
      {argsSummary !== '' && (
        <Text dimColor wrap="wrap">args: {argsSummary}</Text>
      )}
      {item.output !== '' && (
        <Box flexDirection="column">
          <Text dimColor>── output ──</Text>
          <Text dimColor wrap="wrap">{capOutput(item.output)}</Text>
          {item.output.length > OUTPUT_CAP && <Text dimColor>… ({item.output.length} chars)</Text>}
        </Box>
      )}
      {item.status === 'running' && <Text color="magenta" dimColor>…</Text>}
    </Box>
  )
}

function toolGlyph(name: string): string {
  if (name.includes('bash') || name.includes('shell')) return '$'
  if (name.includes('fs') || name.includes('file') || name.includes('read') || name.includes('edit')) return '✎'
  if (name.includes('web') || name.includes('search') || name.includes('fetch')) return '↗'
  return '☰'
}

function summarizeArgs(args: string): string {
  const trimmed = args.trim().replace(/\s+/gu, ' ')
  if (trimmed === '') return ''
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed
}

function capOutput(output: string): string {
  if (output.length <= OUTPUT_CAP) return output
  return output.slice(0, OUTPUT_CAP)
}