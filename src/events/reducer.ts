/**
 * Pure state reducer: applies {@link TuiEvent}s in order to produce the TUI
 * state. No I/O, no side effects — deterministic and directly testable. The
 * single source driving every Ink component.
 * @module dsh-tui/events/reducer
 */

import type { ChatItem, TodoItem } from './types.js'
import type { TokenUsage } from '../harness/types.js'
import type { AgentPhase, ConnectionState, TuiEvent } from './types.js'

/** Full TUI state. */
export interface TuiState {
  connection: ConnectionState
  phase: AgentPhase
  sessionId: string
  provider: string
  model: string
  effort: string
  title: string
  turn: number
  step: number
  todos: TodoItem[]
  items: ChatItem[]
  /** Last standalone-error message (cleared on the next user submit). */
  error: string
  /** Transient notice, e.g. "model switched". */
  notice: string
  /** Whether a streaming assistant item is open (drives the status line). */
  activeToolCount: number
  /** Advertised context window in tokens (from request/context). */
  contextWindow: number
  /** Cumulative token accounting across assistant messages. */
  tokens: { input: number; output: number; reasoning: number }
  /** Wall-clock ms when the current turn/step began (footer elapsed). */
  turnStartedAt: number
}

/** Fresh state for a session; keeps the previous chat items when resuming. */
export function initialState(sessionId: string): TuiState {
  return {
    connection: 'connecting',
    phase: 'idle',
    sessionId,
    provider: 'deepseek-official',
    model: '',
    effort: '',
    title: '',
    turn: 0,
    step: 0,
    todos: [],
    items: [],
    error: '',
    notice: '',
    activeToolCount: 0,
    contextWindow: 0,
    tokens: { input: 0, output: 0, reasoning: 0 },
    turnStartedAt: 0,
  }
}

/** Apply one event. Immutable updates only. */
export function reduce(state: TuiState, event: TuiEvent): TuiState {
  switch (event.type) {
    case 'connected':
      return { ...state, connection: 'connected', phase: 'idle', error: '' }
    case 'disconnected':
      return { ...state, connection: 'disconnected', phase: 'error', error: event.reason }
    case 'status':
      return statusChanged(state, event.phase)
    case 'user-message':
      return {
        ...state,
        items: [...state.items, {
          kind: 'user',
          id: event.id,
          text: event.text,
          time: event.time,
        }],
        error: '',
      }
    case 'assistant-delta':
      return patchAssistant(state, event.id, item => ({ ...item, text: item.text + event.text, pending: true }))
    case 'thinking-delta':
      return patchAssistant(state, event.id, item => ({
        ...item,
        thinking: item.thinking + event.text,
        pending: true,
        ...(item.thinkingStartedAt === undefined ? { thinkingStartedAt: event.time } : {}),
      }))
    case 'assistant-message': {
      const patched = patchAssistant(state, event.id, item => ({
        ...item,
        text: event.text,
        thinking: event.thinking,
        pending: false,
        ...(event.usage !== undefined ? { usage: event.usage } : {}),
        ...(event.interrupted === true ? { interrupted: true as const } : {}),
      }))
      if (event.usage === undefined) return patched
      return {
        ...patched,
        tokens: {
          input: state.tokens.input + (event.usage.inputTokens ?? 0),
          output: state.tokens.output + (event.usage.outputTokens ?? 0),
          reasoning: state.tokens.reasoning + (event.usage.reasoningTokens ?? 0),
        },
      }
    }
    case 'tool-start': {
      const item: ChatItem = {
        kind: 'tool',
        id: event.id,
        callId: event.callId,
        name: event.name,
        args: event.args,
        status: 'running',
        output: '',
        time: event.time,
      }
      return { ...state, items: [...state.items, item], activeToolCount: state.activeToolCount + 1, phase: 'tool-running' }
    }
    case 'tool-finish': {
      const patch = patchTool(state, event.id, item => ({
        ...item,
        status: event.ok ? 'ok' : 'error',
        ...(event.error !== undefined ? { error: event.error } : {}),
        ...(event.output !== undefined ? { output: event.output } : {}),
      }))
      const next = {
        ...patch,
        activeToolCount: Math.max(0, patch.activeToolCount - (runningAt(state, event.id) ? 1 : 0)),
      }
      return phaseAfterToolFinish(next, event.ok)
    }
    case 'turn-start':
      return { ...state, turn: event.turn, step: 0, phase: 'working', turnStartedAt: event.time }
    case 'turn-end':
      // A turn end with no open step/tool settles to idle; the error text, if
      // any, arrived via a dedicated `error` event.
      return { ...state, phase: state.activeToolCount > 0 ? 'tool-running' : 'idle' }
    case 'step-start':
      return { ...state, step: event.step, phase: 'thinking' }
    case 'step-end':
      return { ...state, phase: state.activeToolCount > 0 ? 'tool-running' : 'working' }
    case 'title':
      return { ...state, title: event.title }
    case 'todos':
      return { ...state, todos: event.todos }
    case 'context':
      return {
        ...state,
        ...(event.provider !== undefined ? { provider: event.provider } : {}),
        ...(event.model !== undefined && event.model !== '' ? { model: event.model } : {}),
        ...(event.contextWindow !== undefined ? { contextWindow: event.contextWindow } : {}),
        ...(event.effort !== undefined && event.effort !== '' ? { effort: event.effort } : {}),
      }
    case 'error':
      return { ...state, error: event.message, phase: 'error' }
    case 'notice':
      return { ...state, notice: event.message }
  }
}

function statusChanged(state: TuiState, phase: AgentPhase): TuiState {
  // The server's running/idle is authoritative for the idle edge; in-flight
  // tool calls keep the richer local label while running.
  if (phase === 'idle' && state.activeToolCount > 0) return { ...state, phase: 'tool-running' }
  if (phase === 'working') return { ...state, phase: state.activeToolCount > 0 ? 'tool-running' : 'working' }
  return { ...state, phase }
}

function patchAssistant(
  state: TuiState,
  id: string,
  updater: (item: ChatItem & { kind: 'assistant' }) => ChatItem & { kind: 'assistant' },
): TuiState {
  let mutated = false
  const items = state.items.map(item => {
    if (item.kind === 'assistant' && item.id === id) {
      mutated = true
      return updater(item)
    }
    return item
  })
  if (mutated) return { ...state, items }
  // Streaming can open before the finalized message; create the pending item.
  const seed: ChatItem & { kind: 'assistant' } = {
    kind: 'assistant',
    id,
    text: '',
    thinking: '',
    pending: true,
    time: Date.now(),
  }
  return { ...state, items: [...items, updater(seed)] }
}

function patchTool(
  state: TuiState,
  id: string,
  updater: (item: ChatItem & { kind: 'tool' }) => ChatItem & { kind: 'tool' },
): TuiState {
  let mutated = false
  const items = state.items.map(item => {
    if (item.kind === 'tool' && item.id === id) {
      mutated = true
      return updater(item)
    }
    return item
  })
  if (mutated) return { ...state, items }
  return { ...state, items: [...items, updater({ kind: 'tool', id, callId: '', name: 'unknown', args: '', status: 'ok', output: '', time: Date.now() })] }
}

function runningAt(state: TuiState, id: string): boolean {
  const item = state.items.find(candidate => candidate.kind === 'tool' && candidate.id === id)
  return item !== undefined && item.kind === 'tool' && item.status === 'running'
}

function phaseAfterToolFinish(state: TuiState, ok: boolean): TuiState {
  if (state.activeToolCount > 0) return { ...state, phase: 'tool-running' }
  return { ...state, phase: ok ? 'working' : 'error' }
}