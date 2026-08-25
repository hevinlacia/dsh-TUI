/**
 * Agent-preset vocabulary for the `/preset` command. DSH ships curated agent
 * compositions (standard / code / minimal / cordis) mounted into a preset
 * roster; a session composes from one when `meta.agentPreset` is set on create.
 * The TUI only lists/validates them; the actual composition happens in the
 * harness when the agent-presets roster is mounted (a deliberate profile
 * change — the default patch keeps the host tools, so /preset without the
 * roster just records the choice).
 * @module dsh-tui/presets
 */

/** The official shipped agent presets. */
export const AGENT_PRESETS = ['standard', 'code', 'minimal', 'cordis'] as const

export type AgentPreset = (typeof AGENT_PRESETS)[number]

/** Default preset (the roster default). */
export const DEFAULT_AGENT_PRESET: AgentPreset = 'standard'

/** Human label for a preset (just the id, for now). */
export function presetLabel(preset: AgentPreset): string {
  return preset
}

/** Whether a value is a known preset id. */
export function isAgentPreset(value: string): value is AgentPreset {
  return (AGENT_PRESETS as readonly string[]).includes(value)
}
