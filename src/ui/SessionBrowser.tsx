/**
 * W1 — session browser: list past sessions below the input (pi's selector
 * pattern — a plain, borderless, windowed list in the dynamic zone), pick one
 * with ↑/↓ (PageUp/PageDown pages), resume with Enter, close with Esc.
 * @module dsh-tui/ui/SessionBrowser
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import stringWidth from 'string-width'
import type { SessionMeta } from '../sessions.js'
import { MenuList, type MenuRow } from './MenuList.js'

/** Selector window upper bound (the dynamic zone must stay bounded). */
export const SELECTOR_MAX_VISIBLE = 8

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

/** Selector listing sessions from the shared durable store. */
export function SessionBrowser(props: {
  sessions: SessionMeta[]
  onSelect: (id: string) => void
  onClose: () => void
}): JSX.Element {
  const { sessions, onSelect, onClose } = props
  const { columns } = useWindowSize()
  const [index, setIndex] = useState(0)
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
    if (key.pageUp) setIndex(i => i - SELECTOR_MAX_VISIBLE)
    if (key.pageDown) setIndex(i => i + SELECTOR_MAX_VISIBLE)
  })

  const rows: MenuRow[] = sessions.map(session => ({
    label: truncate(session.title === '' ? '(untitled)' : session.title, Math.max(16, columns - 28)),
    meta: `${session.messageCount} msg · ${formatRelative(session.updatedAt)}`,
  }))
  const selected = sessions[clamped]

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text dimColor>{`sessions — ${total} 条 · ↑/↓ 选择 · PgUp/PgDn 翻页 · Enter 恢复 · Esc 关闭`}</Text>
      {total === 0
        ? <Text dimColor>no sessions yet — send your first message</Text>
        : <MenuList rows={rows} selected={clamped} width={columns} maxVisible={SELECTOR_MAX_VISIBLE} />}
      {selected !== undefined && <Text dimColor>{truncate(`resume: ${selected.id}`, Math.max(16, columns - 2))}</Text>}
    </Box>
  )
}
