/**
 * I1 — input box: a pi-style editor framed by two horizontal rules — no prompt
 * prefix, text starting at column 0, reverse-video block cursor — with pi-style
 * command interaction:
 *
 * - a live dropdown that fuzzy-narrows commands as you type `/…` (subsequence
 *   scoring, initial highlight = exact > prefix match),
 * - second-level argument candidates after `/model `, `/permission `,
 *   `/preset `, `/resume ` (Tab/Enter apply the highlighted row),
 * - path candidates for path-like tokens, completed with Tab,
 * - Enter on the slash menu applies the highlighted row and submits it
 *   (pi fall-through); with an empty argument query it submits the bare
 *   command so `/model` still opens the picker modal instead of switching to
 *   the first list entry. In chat context (non-slash) Enter always submits —
 *   a deliberate divergence from pi so a path menu never blocks sending.
 *
 * Multi-line: Shift+Enter inserts a newline; the caret moves freely in all
 * four directions (←/→ char, ↑/↓ between visual lines preserving column,
 * Home/End to the current line start/end). Up/Down fall back to history only
 * on single-line input.
 * @module dsh-tui/ui/InputBox
 */

import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import stringWidth from 'string-width'
import type { TuiController } from './controller.js'
import {
  complete,
  type ArgumentCandidate,
  type CompletionData,
  type CompletionItem,
  type CompletionResult,
} from '../completion.js'
import {
  modelArgumentEntries,
  permissionArgumentEntries,
  presetArgumentEntries,
  sessionArgumentEntries,
} from '../args.js'
import type { PresetInfo } from '../presets.js'
import { palette } from './theme.js'
import { CommandMenu } from './CommandMenu.js'

const MAX_HISTORY = 64

/** Clamp an index to a non-empty list length. */
function clamp(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1)
}

/** Char index of the start of each logical line (0, then after each `\n`). */
function lineStarts(value: string): number[] {
  const starts = [0]
  for (let i = 0; i < value.length; i++) if (value[i] === '\n') starts.push(i + 1)
  return starts
}

/** The 0-based logical line index containing a cursor position. */
function lineIndexOf(value: string, cursor: number): number {
  let line = 0
  for (let i = 0; i < cursor; i++) if (value[i] === '\n') line++
  return line
}

/** The column (chars since the last newline) of a cursor position. */
function colIndexOf(value: string, cursor: number): number {
  const lastNl = value.lastIndexOf('\n', cursor - 1)
  return lastNl === -1 ? cursor : cursor - lastNl - 1
}

/** The cursor position just before a line's newline (or its end for the last line). */
function lineEnd(value: string, starts: number[], line: number): number {
  const next = starts[line + 1]
  return next === undefined ? value.length : next - 1
}

/** One visual row of the input text: its char range in `value` + display text. */
interface VisualRow {
  start: number
  end: number
  text: string
}

/**
 * Split `value` into visual rows for a given terminal content width (CJK-aware
 * via string-width). Hard `\n` forces a row break; a line longer than `width`
 * wraps. This mirrors how Ink wraps the input `<Text>`, so up/down can move
 * between the rows the user actually sees.
 */
function wrapRows(value: string, width: number): VisualRow[] {
  const rows: VisualRow[] = []
  const lines = value.split('\n')
  let index = 0
  for (const line of lines) {
    if (line === '') {
      rows.push({ start: index, end: index, text: '' })
      index += 1
      continue
    }
    let rowStart = index
    let rowText = ''
    let col = 0
    for (const ch of line) {
      const w = stringWidth(ch)
      if (col + w > width && col > 0) {
        rows.push({ start: rowStart, end: index, text: rowText })
        rowStart = index
        rowText = ''
        col = 0
      }
      rowText += ch
      col += w
      index += 1
    }
    rows.push({ start: rowStart, end: index, text: rowText })
    index += 1 // the \n after this line (harmless after the last line)
  }
  return rows
}

/** Map a char cursor to (visual row, column-in-width). */
function cursorPosition(rows: VisualRow[], cursor: number): { row: number; col: number } {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!
    // Strict `<`: a cursor exactly at a row boundary belongs to the NEXT row
    // (col 0), so pressing up there moves into the row above instead of
    // no-op'ing at the previous row's tail.
    if (cursor < row.end) {
      return { row: r, col: stringWidth(row.text.slice(0, cursor - row.start)) }
    }
  }
  const last = rows[rows.length - 1]!
  return { row: rows.length - 1, col: stringWidth(last.text) }
}

/** Map a (visual row, column-in-width) back to a char cursor, clamped. */
function positionToCursor(rows: VisualRow[], row: number, col: number): number {
  const r = Math.max(0, Math.min(row, rows.length - 1))
  const target = rows[r]!
  const text = target.text
  let width = 0
  let idx = 0
  for (const ch of text) {
    const w = stringWidth(ch)
    if (width + w > col) break
    width += w
    idx += 1
  }
  return target.start + idx
}

/** Move the cursor one VISUAL row up/down, preserving the column (in width). */
function moveLineVisual(value: string, cursor: number, delta: -1 | 1, width: number): number {
  const rows = wrapRows(value, width)
  if (rows.length <= 1) return cursor
  const { row, col } = cursorPosition(rows, cursor)
  const target = row + delta
  if (target < 0 || target >= rows.length) return cursor
  return positionToCursor(rows, target, col)
}

/**
 * Initial highlight for a fresh completion result (pi's
 * getBestAutocompleteMatchIndex): exact value match wins, then the first
 * prefix match, then row 0.
 */
function bestMatchIndex(items: CompletionItem[], query: string): number {
  if (query === '') return 0
  let firstPrefix = -1
  for (let i = 0; i < items.length; i++) {
    const value = items[i]!.value
    if (value === query) return i
    if (firstPrefix === -1 && value.startsWith(query)) firstPrefix = i
  }
  return firstPrefix === -1 ? 0 : firstPrefix
}

/** Input box: editing, history, pi-style completion menu. */
export function InputBox(props: {
  controller: TuiController
  modalOpen: boolean
  /** Current session model — used to mark "(current)" in the model rows. */
  currentModel: string
  /** Whether the agent is mid-turn (Esc/Ctrl+C interrupt instead of clear/exit). */
  running: boolean
  /** Called (only when idle typing) to toggle thinking blocks — A2. */
  onToggleThinking: () => void
  /** Live preset roster — feeds `/preset ` argument completion. */
  presets: readonly PresetInfo[]
}): JSX.Element {
  const { controller, modalOpen, currentModel, running, onToggleThinking, presets } = props
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState(0)
  const [menuDismissed, setMenuDismissed] = useState(false)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(0)
  const cwdRef = useRef(controller.options.cwd)

  // Injectable argument data for the completion engine. Rebuilt when the
  // model or the preset roster changes (the "(current)" marker lives in the
  // model rows; the preset candidates carry descriptions from the roster).
  // Session candidates map the controller's cache snapshot on each
  // completion pass — the cache is warmed at App mount and refreshed after
  // every attach, never scanned synchronously here.
  const completionData = useMemo<CompletionData>(() => ({
    models: modelArgumentEntries(controller.options, currentModel),
    permissions: permissionArgumentEntries(),
    presets: presetArgumentEntries(presets),
    sessions: () => sessionArgumentEntries(controller.sessions()),
  }), [controller, currentModel, presets])

  const result: CompletionResult = useMemo(
    () => complete(value, cwdRef.current, completionData),
    [value, completionData],
  )
  const inSlashContext = value.startsWith('/') && !value.includes('\n')
  const items = result.items
  const menuOpen = items.length > 0 && !menuDismissed

  // Whenever the query changes, reset the highlight to the best match.
  useEffect(() => {
    setSelected(bestMatchIndex(items, result.query))
  }, [items, result.query])

  /** Set text and move the caret (defaults to the end). */
  const setText = (next: string, cursorPos: number = next.length): void => {
    setValue(next)
    setCursor(cursorPos)
  }

  const applyText = (next: string): void => {
    setText(next)
    setMenuDismissed(false)
  }

  /** Apply one completion row into the box, then keep the menu closed until
   * the next keystroke (avoids the same row instantly re-popping). */
  const applyItem = (item: CompletionItem): void => {
    setText(item.line, item.cursor)
    setMenuDismissed(true)
  }

  /** Clear the box and submit one input line. */
  const submitAndClear = (submitted: string): void => {
    applyText('')
    if (submitted.trim() !== '') {
      const history = historyRef.current
      if (history.at(-1) !== submitted) history.push(submitted)
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY)
      historyIndexRef.current = history.length
    }
    void controller.submit(submitted)
  }

  // Live terminal width: re-renders on resize so the rules never keep a
  // stale length (the "many stray dashes" bug).
  const { columns: ruleWidthRaw } = useWindowSize()
  const ruleWidth = Math.max(0, ruleWidthRaw)
  // The value `<Text>` content width: terminal columns minus the 1 col the
  // trailing cursor block can claim on a full line (pi reserves the same col
  // when the editor has no padding).
  const valueWidth = Math.max(1, ruleWidth - 1)

  useInput((input, key) => {
    if (modalOpen) return // modals own the keyboard while open
    if (key.ctrl && input === 'c') {
      if (running) {
        controller.interrupt()
      } else {
        void controller.submit('/exit')
      }
      return
    }
    if (input === 't' && !key.ctrl && !key.shift && value === '') {
      onToggleThinking()
      return
    }

    if (menuOpen) {
      if (key.upArrow) {
        setSelected(sel => (sel - 1 + items.length) % items.length)
        return
      }
      if (key.downArrow) {
        setSelected(sel => (sel + 1) % items.length)
        return
      }
      if (key.escape) {
        setMenuDismissed(true)
        return
      }
      if (key.tab) {
        applyItem(items[clamp(selected, items.length)] ?? items[0]!)
        return
      }
      if (key.return && !key.shift && inSlashContext) {
        // pi fall-through: apply the highlighted row and submit it. With an
        // EMPTY argument query, submit the bare command instead so `/model`
        // opens the picker rather than switching to the first list entry.
        if (result.kind === 'argument' && result.query === '') {
          submitAndClear(value)
          return
        }
        submitAndClear((items[clamp(selected, items.length)] ?? items[0]!).line)
        return
      }
      // Everything else — typing, backspace, Shift+Enter, and Enter in chat
      // context (path menus never block sending) — falls through to the
      // normal editing/submit handlers below.
    }

    if (key.return) {
      if (key.shift) {
        // Shift+Enter inserts a newline instead of submitting — lets the box
        // hold multi-line text that the cursor can now move through. Only
        // arrives as a distinct key on Kitty-protocol terminals (Ink
        // negotiates it); elsewhere plain \r means Enter.
        setText(value.slice(0, cursor) + '\n' + value.slice(cursor), cursor + 1)
        setMenuDismissed(false)
        return
      }
      submitAndClear(value)
      return
    }
    if (key.ctrl && input === 'j') {
      // Ctrl+J (LF) — the universal newline chord: works in any terminal,
      // no Kitty protocol required (same fallback pi ships).
      setText(value.slice(0, cursor) + '\n' + value.slice(cursor), cursor + 1)
      setMenuDismissed(false)
      return
    }
    if (key.tab) {
      // No menu: fall back to the longest-common-prefix completion line.
      if (result.completed !== value) setText(result.completed)
      setMenuDismissed(false)
      return
    }
    if (key.upArrow) {
      // Multi-row text (wrapped long line or `\n`): move the caret between the
      // visual rows the user sees. Single-row: browse history as before.
      if (wrapRows(value, valueWidth).length > 1) {
        setCursor(position => moveLineVisual(value, position, -1, valueWidth))
      } else {
        navigateHistory(-1, historyRef.current, setText, applyText, historyIndexRef)
      }
      return
    }
    if (key.downArrow) {
      if (wrapRows(value, valueWidth).length > 1) {
        setCursor(position => moveLineVisual(value, position, 1, valueWidth))
      } else {
        navigateHistory(1, historyRef.current, setText, applyText, historyIndexRef)
      }
      return
    }
    if (key.escape) {
      if (running) {
        controller.interrupt()
      } else {
        applyText('')
      }
      return
    }
    if (key.leftArrow) {
      setCursor(position => Math.max(0, position - 1))
      return
    }
    if (key.rightArrow) {
      setCursor(position => Math.min(value.length, position + 1))
      return
    }
    if (key.home) {
      setText(value, lineStarts(value)[lineIndexOf(value, cursor)] ?? 0)
      return
    }
    if (key.end) {
      setText(value, lineEnd(value, lineStarts(value), lineIndexOf(value, cursor)))
      return
    }
    if (key.backspace) {
      if (cursor > 0) setText(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1)
      return
    }
    if (key.delete) {
      // Forward-delete at the caret (no-op at the end).
      if (cursor < value.length) {
        setText(value.slice(0, cursor) + value.slice(cursor + 1), cursor)
      }
      return
    }
    if (key.ctrl && input === 'u') {
      applyText('')
      return
    }
    if (key.ctrl && input === 'p') {
      navigateHistory(-1, historyRef.current, setText, applyText, historyIndexRef)
      return
    }
    if (key.ctrl && input === 'n') {
      navigateHistory(1, historyRef.current, setText, applyText, historyIndexRef)
      return
    }
    if (key.ctrl) return
    if (input !== '') {
      setText(value.slice(0, cursor) + input + value.slice(cursor), cursor + input.length)
      setMenuDismissed(false)
    }
  })

  return (
    <Box flexDirection="column">
      <Text color={palette.inputRule}>{'─'.repeat(ruleWidth)}</Text>
      <Text>{value.slice(0, cursor)}<Text inverse>{cursor < value.length && value[cursor] !== '\n' ? value[cursor] : ' '}</Text>{value.slice(cursor + 1)}</Text>
      <Text color={palette.inputRule}>{'─'.repeat(ruleWidth)}</Text>
      {/* pi renders the completion rows BELOW the editor frame, appended to
          the editor's output with no surrounding box. The 12–32 primary
          column clamp applies only to command names; argument candidates
          (provider · model rows) and path entries render in full. */}
      {menuOpen && (
        <CommandMenu
          items={items}
          selected={selected}
          width={ruleWidth}
          clampPrimary={result.kind === 'command'}
        />
      )}
    </Box>
  )
}

function navigateHistory(
  delta: -1 | 1,
  history: string[],
  setValue: (v: string) => void,
  applyText: (v: string) => void,
  indexRef: { current: number },
): void {
  if (history.length === 0) return
  indexRef.current = Math.max(0, Math.min(indexRef.current + delta, history.length))
  const at = indexRef.current
  if (at < history.length) setValue(history[at] ?? '')
  else applyText('')
}
