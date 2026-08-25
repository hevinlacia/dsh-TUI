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
}
