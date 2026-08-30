/**
 * UI-side session metadata for the session browser.
 *
 * The plugin lists durable sessions by walking the shared dsh session store
 * (`~/.dsh/sessions` — the same store dsh web writes) and decompressing each
 * log to recover its title. Only the metadata shape lives here; the walk
 * itself is in `src/plugin.tsx` (`listPersistedSessions`).
 * @module dsh-tui/sessions
 */

/** One browsable session entry. */
export interface SessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}
