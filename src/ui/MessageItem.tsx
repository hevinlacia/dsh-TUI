/**
 * R2/A2 — user messages on a highlighted bar, assistant messages with a
 * leading collapsible thinking block and a colored bullet on the text line.
 * @module dsh-tui/ui/MessageItem
 */

import type { JSX } from 'react'
import { Box, Text } from 'ink'
import type { ChatItem } from '../events/types.js'
import { ThinkingBlock } from './ThinkingBlock.js'
import { palette } from './theme.js'

/** Renders one user or assistant message item. */
export function MessageItem(props: { item: ChatItem; thinkingOpen: boolean }): JSX.Element {
  const { item, thinkingOpen } = props
  if (item.kind === 'tool') return <></>
  if (item.kind === 'user') {
    return (
      <Box backgroundColor={palette.userBar} paddingX={1} paddingY={0} width="100%">
        <Text color={palette.userPrefix}>{'> '}</Text>
        <Text wrap="wrap">{item.text}</Text>
      </Box>
    )
  }
  // assistant — thinking block leads, then `● text` inline.
  const pending = item.pending
  const bullet = (
    <Box>
      <Text color={palette.assistantBullet}>{'● '}</Text>
      {pending && <Text color={palette.assistantName} dimColor>{'…'}</Text>}
    </Box>
  )
  return (
    <Box flexDirection="column" paddingLeft={1}>
      {item.thinking !== '' && (
        <ThinkingBlock thinking={item.thinking} open={thinkingOpen || pending} startedAt={item.thinkingStartedAt} />
      )}
      <Box>
        {bullet}
        <Box flexDirection="column">
          {item.text === '' && pending
            ? <Text dimColor>…</Text>
            : <Text wrap="wrap">{item.text}</Text>}
          {item.usage !== undefined && !pending && (
            <Text dimColor>{fmtUsage(item.usage)}</Text>
          )}
        </Box>
      </Box>
    </Box>
  )
}

function fmtUsage(usage: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; cacheReadTokens?: number }): string {
  const parts: string[] = []
  if (usage.inputTokens !== undefined) parts.push(`${usage.inputTokens} in`)
  if (usage.outputTokens !== undefined) parts.push(`${usage.outputTokens} out`)
  if (usage.reasoningTokens !== undefined) parts.push(`${usage.reasoningTokens} think`)
  return `(${parts.join(' · ')})`
}