/**
 * The session-event vocabulary the TUI consumes.
 *
 * The in-process plugin projects official `SessionEvent`s (from
 * `@deepseek-ai/dsh-session`) through `src/events/types.ts`; these local types
 * mirror the wire shape without importing the official package, so the
 * dependency boundary stays explicit (see `src/official.ts`).
 * @module dsh-tui/harness/types
 */

/** A server notification frame (used by the keyless replay fixture path). */
export interface HarnessNotification {
  method: string
  params: Record<string, unknown>
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

/** Token usage reported with a finalized assistant message. */
export interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}
