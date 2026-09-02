/**
 * Page-key matching across terminal encodings. Ink's `key.pageUp`/`key.pageDown`
 * only cover the legacy tilde forms (`CSI 5~`); under the kitty keyboard
 * protocol (negotiated for Shift+Enter) Ghostty sends functional keys as
 * kitty CSI-u (`CSI 5u`, with modifiers `CSI 5;<mods>u`), which ink's
 * keypress parser does not know — they surface as leftover text like `[5u`
 * after the ESC prefix is stripped. Mouse SGR bytes (`[<64;…`) arrive the
 * same way and must never page.
 * @module dsh-tui/ui/pageKeys
 */

export type PageKey = 'up' | 'down'

/** 'up'/'down' for a page key press, null otherwise (incl. mouse bytes). */
export function matchPageKey(
  input: string,
  key: { pageUp?: boolean; pageDown?: boolean },
): PageKey | null {
  // Mouse wheel/press bytes (SGR `[<…`, legacy `[M…`) — never page keys.
  if (input.startsWith('[<') || input.startsWith('[M')) return null
  if (key.pageUp === true || /^\[5(;\d+)?u$/.test(input)) return 'up'
  if (key.pageDown === true || /^\[6(;\d+)?u$/.test(input)) return 'down'
  return null
}
