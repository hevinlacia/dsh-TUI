/**
 * Wire types for the DeepSeek Harness SDK JSON-RPC protocol.
 *
 * Mirrors `@deepseek-ai/dsh-sdk-protocol` (0.1.1-rc.2) without importing it:
 * dsh-tui speaks the official wire, but owns its own copy of the types so the
 * dependency boundary stays explicit (see docs/protocol.md).
 * @module dsh-tui/harness/types
 */

/** Server→client notification method names defined by the protocol. */
export type SdkNotificationMethod =
  | 'session.event'
  | 'session.status'
  | 'subagent.started'
  | 'subagent.finished'

/** One server-to-client notification as carried on the wire. */
export interface HarnessNotification {
  method: string
  params: Record<string, unknown>
}

/** `initialize` request parameters (handshake / model route). */
export interface InitializeParams {
  cwd: string
  provider: string
  model: string
  maxTokens?: number
}

/** `initialize` response. */
export interface InitializeResult {
  serverInfo: { name: string; version: string }
}

/** `session/prompt` request parameters. */
export interface SessionPromptParams {
  sessionId: string
  contentBlocks: readonly { type: 'text'; text: string }[]
}

/** `session/prompt` response. */
export interface SessionPromptResult {
  messageId: string
}

/** `session.event` notification payload. */
export interface SessionEventNotification {
  sessionId: string
  event: SessionEvent
}

/** `session.status` notification payload. */
export interface SessionStatusNotification {
  sessionId: string
  status: 'idle' | 'running'
}

/**
 * The subset of the harness `SessionEvent` the TUI reads. A discriminated
 * union over `type`; `data` narrows per type. Unknown types flow through as
 * `type: string` and are dropped by the reducer.
 */
export interface SessionEvent {
  type: string
  seq: number
  time: number
  data: unknown
}

/** Raw `assistant/chunk` stream chunk (subset used by the TUI). */
export type StreamChunk =
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: string; name?: string; argumentsDelta: string }
  | { type: 'finish'; reason: { kind: string; code?: string; message?: string } }
  | { type: string }

/** Content blocks carried by assistant/user/tool messages (subset). */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'tool-result'; toolCallId: string; content: readonly ContentBlock[]; isError?: boolean }
  | { type: string }

/** Token usage reported with a finalized assistant message. */
export interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}