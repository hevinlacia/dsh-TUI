/**
 * The UI-facing controller contract. Both the JSON-RPC-backed
 * `SessionController` (standalone CLI) and the in-process Cordis plugin's
 * controller satisfy this, so the Ink components never depend on the transport.
 * @module dsh-tui/ui/controller
 */

import type { CliOptions, ModelOption } from '../config.js'
import type { TuiState } from '../events/reducer.js'
import type { Store } from '../state/store.js'
import type { SessionRegistry } from '../sessions.js'
import type { PermissionMode } from '../permission.js'

/** The UI-facing decision for a pending model interaction (approval/question). */
export type InteractionDecision =
  | { kind: 'approval'; outcome: 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable' }
  | { kind: 'question'; answer: { answers: { id: string; selected: string[]; custom?: string }[] } }

/** The minimal surface the TUI reads/drives. */
export interface TuiController {
  readonly options: CliOptions
  /** Read the current UI state store. */
  getState(): Store<TuiState>
  /** Local git branch for the workspace cwd ('' when not a repo). */
  gitBranch(): string
  /** Named sessions for the browser. */
  sessions(): ReturnType<SessionRegistry['list']>
  /** Submit one input line (slash command or prompt). */
  submit(input: string): Promise<boolean>
  /** Resume an existing session id. */
  resumeSession(id: string): void
  /** Switch the model (and its provider) for new sessions. */
  switchModel(option: ModelOption): Promise<void>
  /** The session's current effective permission mode. */
  currentPermission(): PermissionMode
  /** Switch the permission level (sandbox + approval policy). */
  setPermissionMode(mode: PermissionMode): Promise<void>
  /** Resolve the pending model-facing interaction (approval/question). */
  resolveInteraction(seq: number, decision: InteractionDecision): boolean
  /** Cancel the pending model-facing interaction (treated as user-declined). */
  cancelInteraction(seq: number): void
}
