/**
 * Agent-preset vocabulary for the `/preset` command. The AUTHORITATIVE list
 * comes from the mounted agent-presets roster at runtime (`ctx.agentPresets.
 * list()` — shipped presets + `$DSH_HOME/.agent-presets` user presets, e.g.
 * `hevin`), re-read on every call by the roster itself. This module only
 * carries the fallback list (the shipped four) for the offline/degraded
 * path, plus the shared `PresetInfo` shape.
 * @module dsh-tui/presets
 */

/** One selectable preset in pickers/completion. */
export interface PresetInfo {
  id: string
  /** One-sentence purpose from the preset's own metadata (when published). */
  description?: string
}

/** The shipped presets — the degraded-path fallback when the roster is unreachable. */
export const SHIPPED_AGENT_PRESETS: readonly PresetInfo[] = [
  { id: 'standard' },
  { id: 'code' },
  { id: 'minimal' },
  { id: 'cordis' },
]

/** Default preset (the roster default). */
export const DEFAULT_AGENT_PRESET = 'standard'

/** A preset id is an opaque string; membership is a roster question. */
export type AgentPreset = string
