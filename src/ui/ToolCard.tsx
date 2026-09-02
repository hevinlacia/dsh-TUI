/**
 * A1 — structured tool card, pi-style: a BORDERLESS block on a dark green
 * bar. For shell tools the command itself is the headline (`$ <command>`,
 * bright); everything else (tool name + args summary) keeps the old layout
 * but on the same bar. Output renders dim inside the block.
 * @module dsh-tui/ui/ToolCard
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import type { ChatItem } from '../events/types.js'
import { palette } from './theme.js'

const OUTPUT_CAP = 1200
const COMMAND_CAP = 400

/** One tool call card (running / ok / error). */
export function ToolCard(props: { item: ChatItem & { kind: 'tool' } }): JSX.Element {
  const { item } = props
  const badge = item.status === 'running'
    ? { label: '◌ running', color: palette.toolRun }
    : item.status === 'ok'
      ? { label: '✓', color: palette.ok }
      : { label: '✗ error', color: palette.error }
  const command = extractCommand(item.name, item.args)
  const argsSummary = command === null ? summarizeArgs(item.args) : ''
  return (
    // pi-style bar: filled dark green, no border. The status badge leads the
    // headline; a shell call shows the COMMAND itself (`$ <cmd>`), other
    // tools show their name + an args line.
    <Box backgroundColor={palette.toolBar} paddingX={1} flexDirection="column" width="100%">
      <Text wrap="wrap">
        <Text color={badge.color} bold>{badge.label} </Text>
        <Text bold color={command === null ? palette.toolName : undefined}>
          {toolGlyph(item.name)} {command ?? item.name}
        </Text>
        {item.error && <Text color={palette.error}> {item.error.code ?? item.error.name ?? 'failed'}</Text>}
      </Text>
      {argsSummary !== '' && (
        <Text dimColor wrap="wrap">args: {argsSummary}</Text>
      )}
      {item.output !== '' && (
        <Box flexDirection="column">
          <Text dimColor wrap="wrap">{capOutput(item.output)}</Text>
          {item.output.length > OUTPUT_CAP && <Text dimColor>… ({item.output.length} chars)</Text>}
        </Box>
      )}
      {item.status === 'running' && <Text color={palette.toolRun} dimColor>…</Text>}
    </Box>
  )
}

function toolGlyph(name: string): string {
  if (name.includes('bash') || name.includes('shell')) return '$'
  if (name.includes('fs') || name.includes('file') || name.includes('read') || name.includes('edit')) return '✎'
  if (name.includes('web') || name.includes('search') || name.includes('fetch')) return '↗'
  return '☰'
}

/** The shell command for bash-like calls (`{"command": "…"}` args), capped. */
function extractCommand(name: string, args: string): string | null {
  if (!(name.includes('bash') || name.includes('shell'))) return null
  try {
    const parsed = JSON.parse(args) as { command?: unknown }
    if (typeof parsed.command === 'string' && parsed.command.trim() !== '') {
      const command = parsed.command.replace(/\s+/gu, ' ').trim()
      return command.length > COMMAND_CAP ? `${command.slice(0, COMMAND_CAP)}…` : command
    }
  } catch {
    // args not JSON — fall back to the generic name+args layout
  }
  return null
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
