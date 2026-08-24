/**
 * UI-side session registry (metadata only; the runtime owns the durable log).
 *
 * Kept as a small JSON document under `~/.local/share/dsh-tui/sessions.json`
 * so the browser can list and resume without parsing harness storage formats.
 * @module dsh-tui/sessions
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** One browsable session entry. */
export interface SessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

/** Load-on-first-use JSON registry with safe save. */
export class SessionRegistry {
  private entries: SessionMeta[] = []

  constructor(private readonly path: string) {}

  /** Read the registry from disk. Missing file → empty list. */
  load(): SessionMeta[] {
    try {
      const text = readFileSync(this.path, 'utf8')
      const parsed = JSON.parse(text) as unknown
      if (!Array.isArray(parsed)) throw new Error('registry is not an array')
      this.entries = parsed.filter(isSessionMeta)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code
      if (code !== 'ENOENT') {
        // Corrupt local metadata should never block the TUI; reset it.
        this.entries = []
      }
    }
    return this.list()
  }

  /** Sorted newest-updated-first. */
  list(): SessionMeta[] {
    return [...this.entries].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** Touch a session (insert or update) and persist. */
  touch(id: string, patch: Partial<Pick<SessionMeta, 'title' | 'messageCount'>> = {}): void {
    const existing = this.entries.find(entry => entry.id === id)
    const now = Date.now()
    if (existing === undefined) {
      this.entries.push({
        id,
        title: '',
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        ...patch,
      })
    } else {
      existing.updatedAt = now
      if (patch.title !== undefined) existing.title = patch.title
      if (patch.messageCount !== undefined) existing.messageCount = patch.messageCount
    }
    this.save()
  }

  /** Persist atomically-ish (write temp then rename is overkill for a personal tool). */
  save(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, `${JSON.stringify(this.entries, null, 2)}\n`, 'utf8')
  }
}

function isSessionMeta(value: unknown): value is SessionMeta {
  if (value === null || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.id === 'string'
    && typeof entry.createdAt === 'number'
    && typeof entry.updatedAt === 'number'
    && typeof entry.messageCount === 'number'
    && typeof entry.title === 'string'
}