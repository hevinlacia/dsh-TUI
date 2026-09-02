/**
 * Mouse-wheel scrollback. Ink has no mouse support, so this hook speaks the
 * terminal's own protocol:
 *
 * - enable: DECSET 1000 (button events) + 1006 (SGR extended coordinates)
 * - wheel:  SGR `CSI < 64;x;y M` = up, `CSI < 65;x;y M` = down (Ghostty,
 *   kitty, WezTerm, xterm and friends all speak this when 1006 is on)
 * - disable on unmount, so the terminal doesn't keep emitting mouse bytes
 *   after the TUI is gone.
 *
 * Ink ALSO sees these bytes (stdin is broadcast) and surfaces them as
 * garbage input ('[<64;10;5M' with the ESC stripped) — text consumers must
 * drop inputs starting with '[<' (see InputBox). Handlers that only match
 * concrete keys ignore them naturally.
 * @module dsh-tui/ui/useMouseWheel
 */

import { useEffect, type JSX } from 'react'
import { useStdin, useStdout } from 'ink'

const MOUSE_ENABLE = '\x1b[?1000h\x1b[?1006h'
const MOUSE_DISABLE = '\x1b[?1000l\x1b[?1006l'
const SGR_MOUSE = /\x1b\[<(\d+);\d+;\d+[Mm]/g
const WHEEL_UP = 64
const WHEEL_DOWN = 65

/** Report one wheel notch at a time while the component is mounted. */
export function useMouseWheel(onWheel: (direction: 'up' | 'down') => void): JSX.Element | null {
  const { isRawModeSupported, stdin } = useStdin()
  const { write } = useStdout()

  useEffect(() => {
    if (!isRawModeSupported || stdin === undefined) return
    write(MOUSE_ENABLE)
    const handler = (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      SGR_MOUSE.lastIndex = 0
      let match = SGR_MOUSE.exec(text)
      while (match !== null) {
        const button = Number(match[1])
        if (button === WHEEL_UP) onWheel('up')
        else if (button === WHEEL_DOWN) onWheel('down')
        match = SGR_MOUSE.exec(text)
      }
    }
    stdin.on('data', handler)
    return () => {
      stdin.off('data', handler)
      write(MOUSE_DISABLE)
    }
  }, [isRawModeSupported, stdin, write, onWheel])

  return null
}
