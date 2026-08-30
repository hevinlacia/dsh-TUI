/**
 * W1 — session browser modal: list past sessions (UI metadata registry), pick
 * one with ↑/↓, resume with Enter, close with Esc.
 *
 * Rendered as a compact centered panel that adapts to the terminal size: the
 * list windows within the available height (the selection always stays
 * visible) and every row truncates to the panel width, so the modal never
 * spans the whole screen, never pushes the input/status area around, and long
 * titles/ids cannot break the layout.
 * @module dsh-tui/ui/SessionBrowser
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import stringWidth from 'string-width'
import type { SessionMeta } from '../sessions.js'

/** Truncate `text` to fit `width` display columns (CJK-aware), appending `…`. */
export function truncate(text: string, width: number): string {
  if (width <= 0) return ''
  if (stringWidth(text) <= width) return text
  let out = ''
  let w = 0
  for (const ch of text) {
    const cw = stringWidth(ch)
    if (w + cw > width - 1) break
    out += ch
    w += cw
  }
  return `${out}…`
}

/**
 * Window `[start, end)` over `total` entries so the `selected` index always
 * stays visible (kept near the middle of the window where possible).
 */
export function windowRange(total: number, selected: number, viewRows: number): { start: number; end: number } {
  if (total === 0) return { start: 0, end: 0 }
  const start = Math.max(0, Math.min(selected - Math.floor(viewRows / 2), Math.max(0, total - viewRows)))
  return { start, end: Math.min(total, start + viewRows) }
}

/** Build one truncated list row (marker + title + meta) to a fixed width. */
export function sessionLine(session: SessionMeta, isSelected: boolean, width: number): string {
  const title = session.title === '' ? '(untitled)' : session.title
  return truncate(
    `${isSelected ? '›' : ' '} ${title} · ${session.messageCount} msg · ${formatRelative(session.updatedAt)}`,
    width,
  )
}

/** Modal overlay listing sessions from the UI registry. */
export function SessionBrowser(props: {
  sessions: SessionMeta[]
  onSelect: (id: string) => void
  onClose: () => void
}): JSX.Element {
  const { sessions, onSelect, onClose } = props
  const { columns, rows } = useWindowSize()
  const [index, setIndex] = useState(0)

  // Compact centered panel: leave a margin on each side and room at the
  // bottom for the input box + status bar.
  const panelWidth = Math.max(16, Math.min(columns - 4, 78))
  const left = Math.max(1, Math.floor((columns - panelWidth) / 2))
  const viewRows = Math.max(4, Math.min(18, rows - 13))
  const total = sessions.length
  const clamped = total === 0 ? 0 : ((index % total) + total) % total

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
    if (key.upArrow) setIndex(i => (i - 1 + total) % Math.max(1, total))
    if (key.downArrow) setIndex(i => (i + 1) % Math.max(1, total))
    if (key.pageUp) setIndex(i => i - viewRows)
    if (key.pageDown) setIndex(i => i + viewRows)
  })

  // Window the list so the selection always stays visible.
  const { start, end } = windowRange(total, clamped, viewRows)
  const visible = sessions.slice(start, end)
  const selected = sessions[clamped]

  return (
    <Box
      position="absolute"
      top={2}
      left={left}
      width={panelWidth}
      borderStyle="round"
      borderColor="cyan"
      flexDirection="column"
    >
      <Box justifyContent="space-between" paddingX={1} paddingTop={1}>
        <Text bold color="cyan">sessions</Text>
        <Text dimColor>{`${total} total · ↑/↓ pick · Enter resume · Esc close`}</Text>
      </Box>

      <Box flexDirection="column" paddingX={1} marginTop={1}>
        {total === 0 && <Text dimColor>no sessions yet — send your first message</Text>}
        {visible.map((session, row) => {
          const isSel = start + row === clamped
          return (
            <Box key={session.id} width={panelWidth - 2}>
              <Text color={isSel ? 'cyan' : undefined} dimColor={!isSel}>{sessionLine(session, isSel, panelWidth - 4)}</Text>
            </Box>
          )
        })}
      </Box>

      {total > viewRows && (
        <Box paddingX={1} paddingTop={1}>
          <Text dimColor>{`${start > 0 ? '…' : ''} ${start + 1}–${end} of ${total} ${end < total ? '…' : ''}`}</Text>
        </Box>
      )}
      {selected !== undefined && (
        <Box paddingX={1} paddingTop={1} paddingBottom={1}>
          <Text dimColor>{truncate(`resume: ${selected.id}`, panelWidth - 4)}</Text>
        </Box>
      )}
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
