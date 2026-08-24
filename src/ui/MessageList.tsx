/**
 * R2 — chat area: the ordered surface of user/assistant/tool items with an
 * auto-following tail window. Ink has no scrolling primitives; phase 1 caps
 * the rendered window to the last N items and keeps the tail pinned.
 * @module dsh-tui/ui/MessageList
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import type { TuiState } from '../events/reducer.js'
import { MessageItem } from './MessageItem.js'
import { ToolCard } from './ToolCard.js'

const TAIL_WINDOW = 512

/** Renders the chat items, most recent last. */
export function MessageList(props: { state: TuiState; thinkingOpen: boolean }): JSX.Element {
  const { state, thinkingOpen } = props
  const items = state.items.slice(-TAIL_WINDOW)
  if (items.length === 0) {
    return (
      <Box flexGrow={1} paddingX={1}>
        <Text dimColor>type a message or /help — the agent replies here…</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} gap={1}>
      {items.map(item => item.kind === 'tool'
        ? <ToolCard key={item.id} item={item} />
        : <MessageItem key={item.id} item={item} thinkingOpen={thinkingOpen} />)}
    </Box>
  )
}