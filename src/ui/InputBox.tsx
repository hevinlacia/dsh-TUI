/**
 * I1 — input box: a Claude-Code-style single-line prompt framed by two
 * horizontal rules, with history (↑/↓), Tab completion for slash commands and
 * file paths, a live slash-command dropdown that narrows as you type, and a
 * second-level option submenu for commands that take a choice (e.g. `/model`).
 * @module dsh-tui/ui/InputBox
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
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

/** One-line prompt with editing, history, Tab completion, command menu + submenu. */
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

  const applyText = (next: string): void => {
    setValue(next)
    setCompletion(undefined)
    setMenuDismissed(false)
  }

  /** Fill the highlighted command into the box and close the menu. */
  const acceptCommand = (name: string): void => {
    setValue(`/${name}`)
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
          setValue(`/${name}`)
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
        setValue(result.completed)
        setCompletion(result)
      }
      return
    }
    if (key.upArrow) {
      navigateHistory(-1, historyRef.current, setValue, applyText, historyIndexRef)
      return
    }
    if (key.downArrow) {
      navigateHistory(1, historyRef.current, setValue, applyText, historyIndexRef)
      return
    }
    if (key.escape) {
      applyText('')
      return
    }
    if (key.backspace) {
      applyText(value.slice(0, -1))
      return
    }
    if (key.delete) return // no forward-delete in a bare value buffer
    if (key.ctrl && input === 'u') {
      applyText('')
      return
    }
    if (key.ctrl) return
    if (input !== '') applyText(value + input)
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
        <Text>{value}</Text>
        <Text color="gray">▏</Text>
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
