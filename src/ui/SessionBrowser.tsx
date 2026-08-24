/**
 * W1 — simplified session browser modal: list past sessions (UI metadata
 * registry), pick one with ↑/↓, resume with Enter, close with Esc.
 * @module dsh-tui/ui/SessionBrowser
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput } from 'ink'
import type { SessionMeta } from '../sessions.js'

const MAX_ROWS = 16

/** Modal overlay listing sessions from the UI registry. */
export function SessionBrowser(props: {
  sessions: SessionMeta[]
  onSelect: (id: string) => void
  onClose: () => void
}): JSX.Element {
  const { sessions, onSelect, onClose } = props
  const [index, setIndex] = useState(0)
  const clamped = sessions.length === 0 ? 0 : index % sessions.length

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onClose()
      return
    }
    if (key.return) {
      const picked = sessions[clamped]
      if (picked !== undefined) onSelect(picked.id)
      return
    }
    if (key.upArrow) setIndex(i => (i - 1 + sessions.length) % Math.max(1, sessions.length))
    if (key.downArrow) setIndex(i => (i + 1) % Math.max(1, sessions.length))
    if (key.pageUp) setIndex(i => i - MAX_ROWS)
    if (key.pageDown) setIndex(i => i + MAX_ROWS)
  })

  const rows = sessions.slice(0, MAX_ROWS)
  return (
    <Box
      position="absolute"
      top={6}
      left={0}
      right={0}
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      <Box>
        <Text bold color="cyan">sessions (/resume, /new, /exit)</Text>
      </Box>
      {rows.length === 0 && <Text dimColor>no sessions yet — send your first message</Text>}
      {rows.map((session, row) => (
        <Box key={session.id}>
          <Text color={row === clamped ? 'cyan' : 'gray'}>{row === clamped ? '› ' : '  '}</Text>
          <Text color={row === clamped ? 'cyan' : undefined} dimColor={row !== clamped}>
            {session.title === '' ? '(untitled)' : session.title.slice(0, 40)}
          </Text>
          <Text dimColor> · {session.messageCount} msg · {formatRelative(session.updatedAt)}</Text>
          {row === clamped && <Text color="cyan"> · {session.id.slice(0, 12)}</Text>}
        </Box>
      ))}
    </Box>
  )
}

/** Compact relative timestamp ("just now", "5m ago", "2h ago"). */
export function formatRelative(ms: number): string {
  const delta = Date.now() - ms
  const seconds = Math.max(0, Math.floor(delta / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}