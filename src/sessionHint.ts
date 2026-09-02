/**
 * The post-exit resume hint. After `/exit` the frame is gone, so the last
 * thing on screen is a copy-pasteable `dsh-tui --session-id …` command that
 * continues the exact session (same semantics as the boot binding: resume
 * the id when it exists).
 * @module dsh-tui/sessionHint
 */

/** The printed hint, or null when there is nothing to resume. */
export function resumeHint(id: string | undefined, title: string): string | null {
  if (id === undefined || id.trim() === '') return null
  const cleanTitle = title.trim()
  const command = `dsh-tui --session-id ${id}`
  return cleanTitle === '' || cleanTitle === id
    ? `继续会话: ${command}`
    : `继续会话「${cleanTitle}」: ${command}`
}
