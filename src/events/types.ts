/**
 * The minimal event vocabulary between the Harness runtime and the TUI.
 *
 * `TuiEvent` is the only surface the UI consumes. The plugin projects official
 * `SessionEvent`s through {@link eventsFor}; {@link tuiEventsFromNotification}
 * adapts the same events from fixture frames for the keyless replay path.
 * Unknown event types are dropped. See AGENTS.md → Architecture Entry.
 * @module dsh-tui/events/types
 */

import type { HarnessNotification, SessionEvent, TokenUsage } from '../harness/types.js'
import type { PermissionMode } from '../permission.js'

/** Deliberately small superset of the harness `AgentStatus`; UI-specific labels. */
export type AgentPhase =
  | 'idle'
  | 'working' // turn open, no step yet
  | 'thinking' // step open with live reasoning/tool deltas pending
  | 'tool-running' // a tool call is in flight
  | 'error'

/** Connection state of the runtime subprocess. */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected'

/** A text content block from a user message. */
export interface UserText {
  text: string
  sourceKind: string
}

/** The ordered chat surface item union. */
export type ChatItem =
  | {
    kind: 'user'
    id: string
    text: string
    time: number
  }
  | {
    kind: 'assistant'
    id: string
    text: string
    thinking: string
    pending: boolean
    usage?: TokenUsage
    interrupted?: boolean
    /** Wall-clock ms when the first thinking delta for this item arrived. */
    thinkingStartedAt?: number
    /** Wall-clock ms when the thinking finished (freezes the live timer). */
    thinkingEndedAt?: number
    time: number
  }
  | {
    kind: 'tool'
    id: string
    callId: string
    name: string
    args: string
    status: 'running' | 'ok' | 'error'
    output: string
    error?: { name?: string; code?: string }
    time: number
  }

/** One todo snapshot entry (log-only surface, never derived history). */
export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** A user-question choice offered by the model to the human. */
export interface QuestionOption {
  label: string
  description?: string
}

/** One user-question rendered for the human to answer. */
export interface QuestionItem {
  id: string
  question: string
  detail?: string
  header?: string
  options: QuestionOption[]
  multiSelect?: boolean
  intent?: { kind: 'plan-review'; approve: string }
}

/** A pending permission decision the agent is blocked on. */
export interface PendingApproval {
  kind: 'approval'
  seq: number
  toolName: string
  reason?: string
  callId?: string
  /** The tool call's arguments, when the streamed tool card has them. */
  args?: string
}

/** A pending user-question the agent is blocked on. */
export interface PendingQuestion {
  kind: 'question'
  seq: number
  items: QuestionItem[]
}

/** The model-facing interaction currently awaiting a human decision. */
export type PendingInteraction = PendingApproval | PendingQuestion

/** UI event union; each event is applied by the reducer in wire order. */
export type TuiEvent =
  | { type: 'connected' }
  | { type: 'disconnected'; reason: string }
  | { type: 'status'; phase: AgentPhase; detail?: string }
  | { type: 'user-message'; id: string; text: string; time: number }
  | { type: 'assistant-delta'; id: string; text: string }
  | { type: 'thinking-delta'; id: string; text: string; time: number }
  | {
    type: 'assistant-message'
    id: string
    text: string
    thinking: string
    usage?: TokenUsage
    interrupted?: boolean
    time: number
  }
  | { type: 'tool-start'; id: string; callId: string; name: string; args: string; time: number }
  | { type: 'tool-finish'; id: string; ok: boolean; error?: { name?: string; code?: string }; output?: string }
  | { type: 'turn-start'; turn: number; time: number }
  | { type: 'turn-end'; turn: number; reason: string }
  | { type: 'step-start'; turn: number; step: number }
  | { type: 'step-end'; turn: number; step: number }
  | { type: 'title'; title: string }
  | { type: 'todos'; todos: TodoItem[] }
  | {
    type: 'context'
    provider?: string
    model?: string
    /** Advertised combined request+response context window in tokens. */
    contextWindow?: number
    /** Adapter-selected reasoning effort, when surfaced. */
    effort?: string
  }
  | { type: 'error'; message: string }
  | { type: 'notice'; message: string }
  | { type: 'permission'; mode: PermissionMode }
  | { type: 'subagent-start'; id: string; label: string }
  | { type: 'subagent-end'; id: string }
  | { type: 'interaction-open'; pending: PendingInteraction }
  | { type: 'interaction-close' }

/** Stable item ids used by the reducer to correlate streaming events. */
export namespace ItemIds {
  /** Assistant-stream id for a given turn/step (persists across deltas). */
  export function assistant(turn: number, step: number): string {
    return `assistant-${turn}-${step}`
  }

  /** Tool card id for a call id. */
  export function tool(callId: string): string {
    return `tool-${callId}`
  }
}

/** Extract the chat-surface-relevant events from one notification. */
export function tuiEventsFromNotification(n: HarnessNotification): TuiEvent[] {
  if (n.method === 'session.status') {
    const status = n.params.status
    return [{ type: 'status', phase: status === 'running' ? 'working' : 'idle' }]
  }
  if (n.method !== 'session.event') {
    // subagent.started / subagent.finished are dropped in phase 1.
    return []
  }
  const raw = n.params.event as SessionEvent | undefined
  if (raw === undefined || typeof raw.type !== 'string') return []
  return eventsFor(raw)
}

export function eventsFor(event: SessionEvent): TuiEvent[] {
  const data = event.data as Record<string, unknown>
  switch (event.type) {
    case 'user/message': {
      const source = data.source as { kind?: string } | undefined
      if (source?.kind !== 'user') return [] // synthetic injections are not chat
      const text = textOfMessage(data)
      if (text === '') return []
      return [{ type: 'user-message', id: `user-${event.seq}`, text, time: event.time }]
    }
    case 'assistant/chunk': {
      const chunk = data.chunk as
        | { type?: string; text?: unknown; reason?: { kind?: string; message?: string } }
        | undefined
      const id = ItemIds.assistant(num(data.turn, 1), num(data.step, 1))
      switch (chunk?.type) {
        case 'reasoning-delta':
          return [{ type: 'thinking-delta', id, text: str(chunk.text), time: event.time }]
        case 'text-delta':
          return [{ type: 'assistant-delta', id, text: str(chunk.text) }]
        case 'finish': {
          const reason = chunk.reason
          if (reason?.kind === 'error') {
            return [{ type: 'error', message: reason.message ?? 'assistant stream failed' }]
          }
          return []
        }
        default:
          return []
      }
    }
    case 'assistant/message': {
      const id = ItemIds.assistant(num(data.turn, 1), num(data.step, 1))
      const text = textOfMessage(data.message as Record<string, unknown> | undefined)
      const thinking = thinkingOfMessage(data.message as Record<string, unknown> | undefined)
      return [{
        type: 'assistant-message',
        id,
        text,
        thinking,
        ...(data.usage !== undefined ? { usage: data.usage as TokenUsage } : {}),
        ...(data.interrupted === true ? { interrupted: true as const } : {}),
        time: event.time,
      }]
    }
    case 'tool/call': {
      const id = ItemIds.tool(str(data.callId))
      const args = str(data.arguments)
      return [{
        type: 'tool-start',
        id,
        callId: str(data.callId),
        name: str(data.name),
        args,
        time: event.time,
      }]
    }
    case 'tool/result': {
      const message = data.message as Record<string, unknown> | undefined
      const id = ItemIds.tool(callIdOf(message, event))
      const output = textOfMessage(message)
      const errorField = data.error as { name?: string; code?: string } | undefined
      const isError =
        errorField !== undefined
        || (message?.content !== undefined
          && Array.isArray(message.content)
          && message.content.some(block => isRecord(block) && block.type === 'tool-result' && block.isError === true))
      return [{
        type: 'tool-finish',
        id,
        ok: !isError,
        ...(errorField !== undefined ? { error: errorField } : {}),
        ...(output !== '' ? { output } : {}),
      }]
    }
    case 'turn/start':
      return [{ type: 'turn-start', turn: num(data.turn, 1), time: event.time }]
    case 'turn/end': {
      const reason = data.reason as { kind?: string; error?: { message?: string } } | undefined
      const out: TuiEvent[] = [{ type: 'turn-end', turn: num(data.turn, 1), reason: reason?.kind ?? 'unknown' }]
      if (reason?.kind === 'error') {
        out.push({ type: 'error', message: reason.error?.message ?? 'turn failed' })
      }
      return out
    }
    case 'step/start':
      return [{ type: 'step-start', turn: num(data.turn, 1), step: num(data.step, 1) }]
    case 'step/end':
      return [{ type: 'step-end', turn: num(data.turn, 1), step: num(data.step, 1) }]
    case 'session/title':
      return [{ type: 'title', title: str(data.title) }]
    case 'todo/write': {
      const todos = Array.isArray(data.todos)
        ? data.todos.filter(isTodo).map(t => ({ content: t.content, status: t.status }))
        : []
      return [{ type: 'todos', todos }]
    }
    case 'request/context':
      return [{
        type: 'context',
        provider: str(data.provider),
        model: str(data.model),
        ...(typeof data.contextWindow === 'number' ? { contextWindow: data.contextWindow } : {}),
      }]
    case 'request/header': {
      const header = data.header as { config?: { reasoningEffort?: unknown } } | undefined
      const effort = header?.config?.reasoningEffort
      return [{
        type: 'context',
        provider: str(data.provider ?? ''),
        model: str(data.model ?? ''),
        ...(typeof effort === 'string' ? { effort } : {}),
      }]
    }
    case 'sandbox/mode': {
      const mode = str(data.mode)
      if (mode === 'read-only' || mode === 'workspace-write' || mode === 'danger-full-access') {
        return [{ type: 'permission', mode }]
      }
      return []
    }
    default:
      return []
  }
}

/** Recover the call id for a `tool/result` event (source.callId / block.toolCallId). */
function callIdOf(message: Record<string, unknown> | undefined, fallback: SessionEvent): string {
  if (message !== undefined) {
    const source = message.source as { callId?: unknown } | undefined
    if (typeof source?.callId === 'string' && source.callId !== '') return source.callId
    const content = message.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (isRecord(block) && block.type === 'tool-result' && typeof block.toolCallId === 'string') {
          return block.toolCallId
        }
      }
    }
  }
  // The real wire always carries a correlation; fall back to the event seq so
  // a malformed fixture degrades to a distinct card instead of a collision.
  return `seq-${fallback.seq}`
}

function textOfMessage(message: Record<string, unknown> | undefined): string {  if (message === undefined) return ''
  const content = message.content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => isRecord(block))
    .map(block => blockOf(block).text)
    .join('')
}

function thinkingOfMessage(message: Record<string, unknown> | undefined): string {
  if (message === undefined) return ''
  const content = message.content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => isRecord(block))
    .map(block => blockOf(block).thinking)
    .join('')
}

function blockOf(block: Record<string, unknown>): { text: string; thinking: string } {
  if (block.type === 'text') return { text: str(block.text), thinking: '' }
  if (block.type === 'reasoning') return { text: '', thinking: str(block.text) }
  if (block.type === 'tool-result') {
    // Recurse into nested content (tool outputs often nest).
    const nested = Array.isArray(block.content) ? block.content : []
    let text = ''
    let thinking = ''
    for (const child of nested) {
      if (!isRecord(child)) continue
      const inner = blockOf(child)
      text += inner.text
      thinking += inner.thinking
    }
    return { text, thinking }
  }
  return { text: '', thinking: '' }
}

function isTodo(value: unknown): value is { content: string; status: 'pending' | 'in_progress' | 'completed' } {
  if (!isRecord(value)) return false
  const status = value.status
  return typeof value.content === 'string'
    && (status === 'pending' || status === 'in_progress' || status === 'completed')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}