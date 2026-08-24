/**
 * R2/A2 — one user or assistant message, with the assistant's collapsible
 * thinking block (A2). Streaming assistant items animate with a caret.
 * @module dsh-tui/ui/MessageItem
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import type { ChatItem } from '../events/types.js'
import { ThinkingBlock } from './ThinkingBlock.js'

/** Renders one user or assistant message item. */
export function MessageItem(props: { item: ChatItem; thinkingOpen: boolean }): JSX.Element {
  const { item, thinkingOpen } = props
  if (item.kind === 'tool') return <></>
  if (item.kind === 'user') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="cyan" bold>you › </Text>
        </Box>
        <Text wrap="wrap">{item.text}</Text>
      </Box>
    )
  }
  // assistant
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="green" bold>assistant{item.pending ? <Text>…</Text> : ''}</Text>
        {item.pending && <Text color="green" dimColor> ▍</Text>}
      </Box>
      {item.thinking !== '' && (
        <ThinkingBlock thinking={item.thinking} open={thinkingOpen || item.pending} />
      )}
      {item.text === '' && item.pending
        ? <Text dimColor>…</Text>
        : <Text wrap="wrap">{item.text}</Text>}
      {item.usage !== undefined && !item.pending && (
        <Text dimColor>
          {' '}({fmtUsage(item.usage)})
        </Text>
      )}
    </Box>
  )
}

function fmtUsage(usage: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; cacheReadTokens?: number }): string {
  const parts: string[] = []
  if (usage.inputTokens !== undefined) parts.push(`${usage.inputTokens} in`)
  if (usage.outputTokens !== undefined) parts.push(`${usage.outputTokens} out`)
  if (usage.reasoningTokens !== undefined) parts.push(`${usage.reasoningTokens} think`)
  return parts.join(' · ')
}