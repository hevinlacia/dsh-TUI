/**
 * R2 — chat area: the ordered surface of user/assistant/tool items with an
 * auto-following tail window and scrollback. Ink has no scrolling
 * primitives, so the rendered window slides over the full item history:
 * PageUp/PageDown AND the mouse wheel (DECSET 1000/1006, see useMouseWheel)
 * move the window; reviewing holds the visible items STILL while the agent
 * streams (the offset tracks incoming items), and submitting a new message
 * or clearing snaps back to the tail.
 * @module dsh-tui/ui/MessageList
 */

import { useEffect, useRef, useState, useCallback, type JSX } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import type { TuiState } from '../events/reducer.js'
import { MessageItem } from './MessageItem.js'
import { ToolCard } from './ToolCard.js'
import { useMouseWheel } from './useMouseWheel.js'
import { matchPageKey } from './pageKeys.js'
import { wheelAccumulator } from './wheelSpeed.js'

/** Render-window size; offset can slide the window over the whole history. */
const TAIL_WINDOW = 512

/** Renders the chat items, most recent last. */
export function MessageList(props: {
  state: TuiState
  thinkingOpen: boolean
  /** Scroll keys are only active while no modal/interaction owns the keyboard. */
  scrollActive: boolean
}): JSX.Element {
  const { state, thinkingOpen, scrollActive } = props
  const [offset, setOffset] = useState(0)
  const prevTotalRef = useRef(0)
  const prevUserRef = useRef(0)
  const { rows } = useWindowSize()
  // A "page" ≈ the visible chat height, bounded to something sane.
  const page = Math.max(5, rows - 8)

  const total = state.items.length
  // Slide the window over the WHOLE history: the 512-item render cap must not
  // gate scrolling, or sessions shorter than that could never scroll in-app
  // (their only fallback is terminal-native scrollback, which a full-screen
  // TUI redraw yanks back to the tail).
  const maxOffset = Math.max(0, total - 1)
  const clamped = Math.min(offset, maxOffset)

  // Snap back to the tail on a new user message (a submit) or a clear (total
  // shrank). Reviewing (scrolled up) while the agent streams is left alone.
  useEffect(() => {
    let userCount = 0
    for (const item of state.items) if (item.kind === 'user') userCount += 1
    if (total < prevTotalRef.current || userCount > prevUserRef.current) {
      setOffset(0)
    } else if (total > prevTotalRef.current) {
      // Streaming while reviewing: bump the offset by the incoming count so
      // the visible items hold STILL instead of sliding with the tail.
      setOffset(value => (value > 0 ? value + (total - prevTotalRef.current) : value))
    }
    prevTotalRef.current = total
    prevUserRef.current = userCount
  }, [state.items, total])

  // Mouse wheel — two notches = one item (half speed, see wheelSpeed);
  // the stable wrapper keeps the stdin subscription from being torn down on
  // every render, and the accumulator instance outlives renders too.
  const wheelRef = useRef<(direction: 'up' | 'down') => void>(() => {})
  const wheelGate = useRef(wheelAccumulator())
  wheelRef.current = (direction: 'up' | 'down'): void => {
    if (!wheelGate.current(direction)) return
    setOffset(value => direction === 'up' ? Math.min(maxOffset, value + 1) : Math.max(0, value - 1))
  }
  const onWheel = useCallback((direction: 'up' | 'down'): void => { wheelRef.current(direction) }, [])
  useMouseWheel(onWheel)

  useInput((input, key) => {
    const pageKey = matchPageKey(input, key)
    if (pageKey === 'up') {
      setOffset(value => Math.min(maxOffset, value + page))
      return
    }
    if (pageKey === 'down') {
      setOffset(value => Math.max(0, value - page))
    }
  }, { isActive: scrollActive })

  if (total === 0) {
    return (
      <Box flexGrow={1} paddingX={1}>
        <Text dimColor>type a message or /help — the agent replies here… (PageUp/PageDown 滚动回看)</Text>
      </Box>
    )
  }

  const from = Math.max(0, total - TAIL_WINDOW - clamped)
  const to = Math.max(0, total - clamped)
  const visible = state.items.slice(from, to)

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} gap={1}>
      {clamped > 0 && (
        <Box>
          <Text dimColor>{`↑ 上翻 ${clamped} 条 · PageUp/PageDown 浏览 · PageDown 回到底部`}</Text>
        </Box>
      )}
      {visible.map(item => item.kind === 'tool'
        ? <ToolCard key={item.id} item={item} />
        : <MessageItem key={item.id} item={item} thinkingOpen={thinkingOpen} />)}
    </Box>
  )
}
