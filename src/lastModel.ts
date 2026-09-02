/**
 * UI-owned model memory: remembers the most recently used provider + model
 * pair across restarts. Stored as `last-model.json` under dsh-tui's own
 * state home (`~/.dsh-tui`, `DSH_TUI_HOME` overrides) — UI metadata only;
 * the runtime's compose default still comes from the resolve chain in
 * `controllerOptions` (explicit env/patch > config file > THIS memory >
 * dsh settings). Best-effort by design: any I/O or parse failure degrades to
 * "no memory" without breaking boot or switching.
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

/** Load the remembered pair, or null when absent/invalid/corrupt. */
export function loadLastModel(): LastModel | null {
  try {
    const doc = JSON.parse(readFileSync(lastModelStatePath(), 'utf8')) as Record<string, unknown>
    const provider = doc['provider']
    const id = doc['model']
    if (typeof provider !== 'string' || provider === '' || typeof id !== 'string' || id === '') return null
    return { provider, id }
  } catch {
    return null
  }
}

/** Persist the pair (atomic replace; failures are silently ignored). */
export function saveLastModel(provider: string, id: string): void {
  try {
    const dir = tuiStateHome()
    mkdirSync(dir, { recursive: true })
    const path = lastModelStatePath()
    const tmp = `${path}.tmp-${process.pid}`
    const doc = { version: 1, provider, model: id, updatedAt: new Date().toISOString() }
    writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
    renameSync(tmp, path)
  } catch {
    // Memory is best-effort; a read-only home must never break a model switch.
  }
}
