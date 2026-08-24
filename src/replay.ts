/**
 * Headless render pipeline for `--replay <file>`: feed a notification JSONL
 * (the exact fixture format the probe records) through the real reducer and
 * print a plain-text conversation. Keyless, deterministic — this is the smoke
 * entry point (`scripts/smoke.mjs` asserts on its markers).
 * @module dsh-tui/replay
 */

import { readFileSync } from 'node:fs'
import { initialState, reduce } from './events/reducer.js'
import { tuiEventsFromNotification, type ChatItem } from './events/types.js'
import type { HarnessNotification } from './harness/types.js'

/** Replay a notification JSONL and render it as plain text. */
export function runReplay(file: string): string {
  const lines = readFileSync(file, 'utf8').split('\n')
  let state = initialState('replay')
  for (const line of lines) {
    if (line.trim() === '') continue
    const frame = JSON.parse(line) as unknown
    const notification = notificationOf(frame)
    for (const event of tuiEventsFromNotification(notification)) {
      state = reduce(state, event)
    }
  }
  return renderState(state)
}

/** Render the final state as plain text (used by replay and one-shot). */
export function renderState(state: ReturnType<typeof initialState>): string {
  const out: string[] = []
  out.push(`[dsh-tui] ${state.connection} · ${state.phase} · model ${state.model || '?'} · turn ${state.turn} step ${state.step}`)
  for (const item of state.items) out.push(renderItem(item))
  if (state.error !== '') out.push(`[error] ${state.error}`)
  return out.join('\n')
}

function renderItem(item: ChatItem): string {
  switch (item.kind) {
    case 'user':
      return `user: ${item.text}`
    case 'assistant': {
      const lines: string[] = []
      if (item.thinking !== '') lines.push(`# thinking (${item.thinking.length} chars)`)
      lines.push(`assistant: ${item.text === '' ? '…' : item.text}`)
      return lines.join('\n')
    }
    case 'tool':
      return `tool[${item.status}] ${item.name} args=${short(item.args)}${item.output !== '' ? `\n  output: ${short(item.output)}` : ''}${item.error !== undefined ? `\n  error: ${item.error.code ?? item.error.name ?? 'failed'}` : ''}`
  }
}

function short(value: string): string {
  const flat = value.replace(/\s+/gu, ' ')
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat
}

function notificationOf(frame: unknown): HarnessNotification {
  if (frame === null || typeof frame !== 'object') return { method: '', params: {} }
  const record = frame as Record<string, unknown>
  const method = typeof record.method === 'string' ? record.method : ''
  const params = record.params !== undefined && typeof record.params === 'object' && record.params !== null
    ? record.params as Record<string, unknown>
    : {}
  return { method, params }
}