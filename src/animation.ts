/**
 * Lightweight terminal animation layer for dsh-tui.
 *
 * Independent implementation — no vendored renderer. It renders the working
 * spinner, streaming assistant text, and tool-call status using only ANSI
 * cursor/erase control sequences. The dsh session event log is the source of
 * truth: `session.events` returns a fresh immutable snapshot on every append
 * and `seq === log.length`, so the renderer polls for new events between
 * snapshots and streams them as they arrive.
 *
 * Interactive mode (stdout is a TTY) animates: a spinner while the model
 * works, then streamed text. Non-interactive mode renders nothing here — the
 * caller falls back to its final summary.
 */

import { stdout as output } from 'node:process'

/** ANSI: carriage return without newline. */
const CR = '\r'
/** ANSI: erase the current line (CSI 2 K). */
const ERASE_LINE = '\x1b[2K'
/** ANSI: show cursor (CSI ? 25 h). */
const SHOW_CURSOR = '\x1b[?25h'
/** ANSI: hide cursor (CSI ? 25 l). */
const HIDE_CURSOR = '\x1b[?25l'

/** Spinner frame set (fallback set, same glyphs the community TUI used). */
const SPINNER_FRAMES = ['·', '✢', '*', '✶', '✻', '✽'] as const

/** The minimal event view the renderer consumes from the session log. */
export interface RenderEvent {
  seq: number
  type: string
  data: Record<string, unknown>
}

/**
 * Stream one turn's events into the terminal, starting at `firstSeq`.
 *
 * Polls the event snapshot until `untilIdle` resolves, rendering a working
 * spinner before the first visible delta and then assistant text / tool calls
 * as they land. Returns the concatenated streamed text; when interactive is
 * false it renders nothing and returns '' so the caller can print its final
 * summary instead.
 *
 * @param getEvents - returns the latest immutable event snapshot.
 * @param firstSeq - the log length at submit time; only newer events render.
 * @param interactive - true when stdout is a TTY (animation allowed).
 * @param untilIdle - resolves when the agent is idle again (turn settled).
 * @returns the streamed text (interactive only, else '').
 */
export async function streamTurn(
  getEvents: () => readonly RenderEvent[],
  firstSeq: number,
  interactive: boolean,
  untilIdle: Promise<void>,
): Promise<string> {
  if (!interactive) {
    // Non-interactive: let the caller's summary own the output.
    await untilIdle
    return ''
  }

  let lastSeq = firstSeq
  let streamed = ''
  let sawTurnStart = false
  let streaming = false

  const poll = (): void => {
    const events = getEvents()
    for (let i = lastSeq; i < events.length; i += 1) {
      const event = events[i]
      if (event === undefined || event.seq < firstSeq) continue
      lastSeq = event.seq + 1
      switch (event.type) {
        case 'turn/start':
          sawTurnStart = true
          break
        case 'assistant/chunk': {
          const chunk = event.data.chunk as
            | { type?: string; text?: string }
            | undefined
          if (chunk?.type === 'text-delta' && chunk.text) {
            beginStreaming()
            output.write(chunk.text)
            streamed += chunk.text
          }
          break
        }
        case 'tool/call': {
          const name = event.data.name
          if (typeof name === 'string' && name !== '') {
            beginStreaming()
            output.write(`\n⚙ ${name}\n`)
          }
          break
        }
        default:
          break
      }
    }
  }

  const beginStreaming = (): void => {
    if (streaming) return
    streaming = true
    // Clear the spinner line and re-show the cursor before streaming.
    output.write(`${CR}${ERASE_LINE}${SHOW_CURSOR}`)
  }

  const tickSpinner = (): void => {
    if (streaming) return
    const frame = Math.floor(Date.now() / 120)
    const glyph = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!
    const mode = sawTurnStart ? 'thinking' : 'requesting'
    output.write(`${CR}${ERASE_LINE}${glyph} ${mode}`)
  }

  output.write(HIDE_CURSOR)
  try {
    for (;;) {
      poll()
      tickSpinner()
      // Wait for the next 50ms tick or the turn settling, whichever first.
      const idle = await Promise.race([
        untilIdle.then(() => true),
        sleep(50).then(() => false),
      ])
      if (idle) {
        // Drain any events that landed before the idle signal.
        poll()
        break
      }
    }
  } finally {
    output.write(`${CR}${ERASE_LINE}${SHOW_CURSOR}`)
  }
  return streamed
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
