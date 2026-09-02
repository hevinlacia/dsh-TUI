/**
 * The UI-facing controller contract. The in-process Cordis plugin controller
 * (`src/plugin.tsx`) satisfies this, so the Ink components never depend on the
 * transport.
 * @module dsh-tui/ui/controller
 */

import type { CliOptions, ModelOption } from '../config.js'
import type { TuiState } from '../events/reducer.js'
import type { Store } from '../state/store.js'
import type { SessionMeta } from '../sessions.js'
import type { PermissionMode } from '../permission.js'
import type { PresetInfo } from '../presets.js'

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
  sessions(): SessionMeta[]
  /** Submit one input line (slash command or prompt). */
  submit(input: string): Promise<boolean>
  /** Resume an existing session id. */
  resumeSession(id: string): void
  /** Rename the live session (pins the title; automatic generation stops). */
  renameSession(title: string): Promise<void>
  /** The current session title ('' before the first title event). */
  currentTitle(): string
  /** Switch the model (and its provider) for new sessions. */
  switchModel(option: ModelOption): Promise<void>
  /** The session's current effective permission mode. */
  currentPermission(): PermissionMode
  /** Switch the permission level (sandbox + approval policy). */
  setPermissionMode(mode: PermissionMode): Promise<void>
  /** The compose default agent preset. */
  currentPreset(): string
  /** Switch the agent preset used to compose new sessions. */
  setAgentPreset(preset: string): Promise<void>
  /** Live preset roster (shipped + user presets, re-read per call). */
  listPresets(): Promise<readonly PresetInfo[]>
  /** Last roster snapshot (sync, for completion data); shipped fallback. */
  cachedPresets(): readonly PresetInfo[]
  /** Harness-registered commands discoverable for `/commands` (empty offline). */
  listHarnessCommands(): Promise<Array<{ name: string; description: string }>>
  /** Resolve the pending model-facing interaction (approval/question). */
  resolveInteraction(seq: number, decision: InteractionDecision): boolean
  /** Cancel the pending model-facing interaction (treated as user-declined). */
  cancelInteraction(seq: number): void
  /** Abort the running agent turn (Esc / Ctrl+C while busy). */
  interrupt(): void
}
