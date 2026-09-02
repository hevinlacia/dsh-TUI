/**
 * Argument-candidate builders for `/command <arg>` completion (pi-style
 * second-level candidates). Pure and synchronous; the session provider is
 * passed in by the caller so the (costly) session-store walk stays lazy and
 * cached in the UI layer.
 * @module dsh-tui/args
 */

import type { CliOptions } from './config.js'
import type { ArgumentCandidate } from './completion.js'
import { PERMISSION_LEVELS } from './permission.js'
import type { PresetInfo } from './presets.js'
import type { SessionMeta } from './sessions.js'

/** `/model` — the switchable models, `provider · name` rows with a current marker. */
export function modelArgumentEntries(options: CliOptions, currentModel: string): ArgumentCandidate[] {
  return options.modelOptions.map(model => ({
    label: `${model.provider} · ${model.name}`,
    meta: model.id === currentModel ? '(current)' : undefined,
    value: model.id,
  }))
}

/** `/permission` — the three DSH sandbox levels (labels are the accepted args). */
export function permissionArgumentEntries(): ArgumentCandidate[] {
  return PERMISSION_LEVELS.map(level => ({ label: level.label, meta: level.description, value: level.label }))
}

/** `/preset` — the live roster (user presets included). */
export function presetArgumentEntries(presets: readonly PresetInfo[]): ArgumentCandidate[] {
  return presets.map(preset => ({ label: preset.id, meta: preset.description, value: preset.id }))
}

/** `/resume` — persisted sessions (title rows carrying the resume id). */
export function sessionArgumentEntries(sessions: SessionMeta[]): ArgumentCandidate[] {
  return sessions.map(session => ({
    label: session.title !== '' ? truncate(session.title, 48) : session.id,
    meta: session.id.slice(0, 8),
    value: session.id,
  }))
}

/** Elide the middle of long strings so dropdown rows stay single-line. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const half = Math.floor((max - 1) / 2)
  return `${text.slice(0, half)}…${text.slice(text.length - half)}`
}
