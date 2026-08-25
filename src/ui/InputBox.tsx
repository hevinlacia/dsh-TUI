/**
 * I1 — input box: a Claude-Code-style prompt framed by two horizontal rules,
 * with history (↑/↓ single-line, Ctrl+P/Ctrl+N always), Tab completion for
 * slash commands and file paths, a live slash-command dropdown that narrows as
 * you type, and a second-level option submenu for commands that take a choice
 * (e.g. `/model`).
 *
 * Multi-line: Shift+Enter inserts a newline; the caret moves freely in all four
 * directions (←/→ char, ↑/↓ between logical lines preserving column, Home/End
 * to the current line start/end). Up/Down fall back to history only on
 * single-line input, so the box both edits multi-line text and brows history.
 * @module dsh-tui/ui/InputBox
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import stringWidth from 'string-width'
import type { TuiController } from './controller.js'
import { complete, type CompletionResult } from '../completion.js'
import { commandNames, COMMANDS } from '../commands.js'
import { submenuEntries, type SubmenuEntry } from '../submenu.js'
import { palette } from './theme.js'
import { CommandMenu } from './CommandMenu.js'
import { ModelSubmenu } from './ModelSubmenu.js'

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

/** Input box: editing, history, Tab completion, command menu + submenu. */
export function InputBox(props: {
  controller: TuiController
  modalOpen: boolean
  /** Current session model — used to mark "(current)" in the model submenu. */
  currentModel: string
  /** Called (only when idle typing) to toggle thinking blocks — A2. */
  onToggleThinking: () => void
}): JSX.Element {
  const { controller, modalOpen, currentModel, onToggleThinking } = props
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)
  const [completion, setCompletion] = useState<CompletionResult | undefined>(undefined)
  const [selected, setSelected] = useState(0)
  const [menuDismissed, setMenuDismissed] = useState(false)
  const [submenu, setSubmenu] = useState<SubmenuEntry[] | null>(null)
  const [submenuBase, setSubmenuBase] = useState<string | null>(null)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(0)
  const cwdRef = useRef(controller.options.cwd)
  const { stdout } = useStdout()

  // Live command matches for the current token (a command being typed, so far
  // without a space). Narrowing is just a startWith filter over the vocabulary.
  const typedCommand = value.startsWith('/') && !value.includes(' ') ? value.slice(1) : null
  const matches = typedCommand === null ? [] : commandNames().filter(name => name.startsWith(typedCommand.toLowerCase()))
  const showCommandMenu = submenu === null && matches.length > 0 && !menuDismissed

  // Whenever the filter narrows, snap the highlight back to the first row.
  useEffect(() => {
    setSelected(0)
  }, [typedCommand])

  /** Set text and move the caret (defaults to the end). */
  const setText = (next: string, cursorPos: number = next.length): void => {
    setValue(next)
    setCursor(cursorPos)
  }

  const applyText = (next: string): void => {
    setText(next)
    setCompletion(undefined)
    setMenuDismissed(false)
  }

  /** Fill the highlighted command into the box and close the menu. */
  const acceptCommand = (name: string): void => {
    setText(`/${name}`)
    setMenuDismissed(true)
    setSelected(0)
  }

  /** Close the submenu and return to plain editing (input keeps its value). */
  const closeSubmenu = (): void => {
    setSubmenu(null)
    setSubmenuBase(null)
    setMenuDismissed(true)
  }

  const ruleWidth = Math.max(0, stdout?.columns ?? 80)
  // The value `<Text>` content width: terminal columns minus 1 col of paddingX
  // each side and the `> `/`/ ` prompt (2 cols).
  const valueWidth = Math.max(1, ruleWidth - 4)

  useInput((input, key) => {
    if (modalOpen) return // modals own the keyboard while open
    if (key.ctrl && input === 'c') {
      void controller.submit('/exit')
      return
    }
    if (input === 't' && !key.ctrl && !key.shift && value === '') {
      onToggleThinking()
      return
    }

    // Second-level option submenu (e.g. the model picker) owns the keyboard.
    if (submenu !== null && submenuBase !== null) {
      if (key.upArrow) {
        setSelected(sel => (sel - 1 + submenu.length) % submenu.length)
        return
      }
      if (key.downArrow) {
        setSelected(sel => (sel + 1) % submenu.length)
        return
      }
      if (key.escape) {
        closeSubmenu()
        return
      }
      const entry = submenu[clamp(selected, submenu.length)] ?? submenu[0]
      if (entry !== undefined) {
        const command = `${submenuBase} ${entry.value}`
        if (key.return) {
          // Confirm immediately: clear the box and run `/command <value>`.
          applyText('')
          closeSubmenu()
          void controller.submit(command)
          return
        }
        if (key.tab) {
          // Fill the selection into the box (lets the user review/run with Enter).
          applyText(command)
          closeSubmenu()
          return
        }
      }
      return // swallow other input while the submenu is open
    }

    if (showCommandMenu && (key.return || key.tab || key.upArrow || key.downArrow || key.escape)) {
      if (key.upArrow) {
        setSelected(sel => (sel - 1 + matches.length) % matches.length)
        return
      }
      if (key.downArrow) {
        setSelected(sel => (sel + 1) % matches.length)
        return
      }
      if (key.escape) {
        setMenuDismissed(true)
        return
      }
      const name = matches[clamp(selected, matches.length)] ?? matches[0] ?? ''
      if (name === '') return
      const spec = COMMANDS.find(command => command.name === name)
      if (spec?.submenu !== undefined) {
        const entries = submenuEntries(spec.submenu, controller.options)
        if (entries.length > 0) {
          // Open the second-level menu instead of filling/running the command.
          setText(`/${name}`)
          setSubmenu(entries)
          setSubmenuBase(`/${name}`)
          setSelected(0)
          setMenuDismissed(false)
          return
        }
      }
      if (key.return && value.trim() === `/${name}`) {
        // The full command is already typed → run it.
        const submitted = value
        applyText('')
        void controller.submit(submitted)
        return
      }
      acceptCommand(name)
      return
    }

    if (key.return) {
      if (key.shift) {
        // Shift+Enter inserts a newline instead of submitting — lets the box
        // hold multi-line text that the cursor can now move through.
        setText(value.slice(0, cursor) + '\n' + value.slice(cursor), cursor + 1)
        setCompletion(undefined)
        setMenuDismissed(false)
        return
      }
      const submitted = value
      applyText('')
      if (submitted.trim() !== '') {
        const history = historyRef.current
        if (history.at(-1) !== submitted) history.push(submitted)
        if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY)
        historyIndexRef.current = history.length
        void controller.submit(submitted)
      }
      return
    }
    if (key.tab) {
      const result = complete(value, cwdRef.current)
      if (result.candidates.length > 0) {
        setText(result.completed)
        setCompletion(result)
      }
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
      applyText('')
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
      if (cursor > 0) {
        setText(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1)
        setCompletion(undefined)
      }
      return
    }
    if (key.delete) {
      // Forward-delete at the caret (no-op at the end).
      if (cursor < value.length) {
        setText(value.slice(0, cursor) + value.slice(cursor + 1), cursor)
        setCompletion(undefined)
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
      setCompletion(undefined)
      setMenuDismissed(false)
    }
  })

  const inCommand = value.trim().startsWith('/')
  return (
    <Box flexDirection="column" paddingBottom={1}>
      {submenu !== null && submenuBase !== null
        ? <ModelSubmenu entries={submenu} currentModel={currentModel} selected={selected} />
        : showCommandMenu && <CommandMenu matches={matches} selected={selected} />}
      <Text color={palette.inputRule}>{'─'.repeat(ruleWidth)}</Text>
      <Box paddingX={1}>
        <Text color={inCommand ? palette.commandName : 'cyan'}>{inCommand ? '/ ' : '> '}</Text>
        <Text>{value.slice(0, cursor)}<Text inverse> </Text>{value.slice(cursor)}</Text>
      </Box>
      <Text color={palette.inputRule}>{'─'.repeat(ruleWidth)}</Text>
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
