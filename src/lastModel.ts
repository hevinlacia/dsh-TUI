/**
 * UI-owned state memory: remembers the most recently used provider + model
 * pair and agent preset across restarts. Stored as `last-model.json` under
 * dsh-tui's own state home (`~/.dsh-tui`, `DSH_TUI_HOME` overrides) — UI
 * metadata only; the runtime's compose defaults still come from the resolve
 * chains in `controllerOptions` / `resolveDefaultPreset` (explicit env/patch
 * > config file > THIS memory > dsh settings). Best-effort by design: any
 * I/O or parse failure degrades to "no memory" without breaking boot,
 * switching, or preset changes.
 * @module dsh-tui/lastModel
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The persisted provider + model pair. */
export interface LastModel {
  provider: string
  id: string
}

/** dsh-tui's state home (`~/.dsh-tui`); `DSH_TUI_HOME` overrides (tests). */
export function tuiStateHome(): string {
  if (process.env.DSH_TUI_HOME !== undefined && process.env.DSH_TUI_HOME !== '') {
    return process.env.DSH_TUI_HOME
  }
  return join(homedir(), '.dsh-tui')
}

/** The memory file path (computed per call so env overrides always apply). */
export function lastModelStatePath(): string {
  return join(tuiStateHome(), 'last-model.json')
}

/** Read the whole state document (null when absent/invalid/corrupt). */
function readState(): Record<string, unknown> {
  try {
    const doc = JSON.parse(readFileSync(lastModelStatePath(), 'utf8')) as Record<string, unknown>
    return typeof doc === 'object' && doc !== null ? doc : {}
  } catch {
    return {}
  }
}

/** Merge-patch the state document (atomic replace; failures silently ignored). */
function writeState(patch: Record<string, unknown>): void {
  try {
    const dir = tuiStateHome()
    mkdirSync(dir, { recursive: true })
    const path = lastModelStatePath()
    const tmp = `${path}.tmp-${process.pid}`
    const doc = { ...readState(), ...patch, version: 1, updatedAt: new Date().toISOString() }
    writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
    renameSync(tmp, path)
  } catch {
    // Memory is best-effort; a read-only home must never break a switch.
  }
}

/** A non-empty trimmed string, or undefined. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** Load the remembered provider + model pair, or null. */
export function loadLastModel(): LastModel | null {
  const doc = readState()
  const provider = text(doc['provider'])
  const id = text(doc['model'])
  return provider !== undefined && id !== undefined ? { provider, id } : null
}

/** Remember the provider + model pair (merged with the rest of the state). */
export function saveLastModel(provider: string, id: string): void {
  writeState({ provider, model: id })
}

/** Load the remembered agent preset, or null. */
export function loadLastPreset(): string | null {
  return text(readState()['preset']) ?? null
}

/** Remember the agent preset (merged with the rest of the state). */
export function saveLastPreset(preset: string): void {
  writeState({ preset })
}
