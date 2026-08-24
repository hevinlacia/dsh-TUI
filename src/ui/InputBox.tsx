/**
 * I1 — input box: prompt editing with history (↑/↓) and Tab completion for
 * slash commands and file paths. No third-party input widget: a hand-rolled
 * value buffer keeps completion and history fully explicit.
 * @module dsh-tui/ui/InputBox
 */

import { useRef, useState, type JSX } from 'react'
import { Box, Text, useInput } from 'ink'
import type { SessionController } from '../controller.js'
import { complete, type CompletionResult } from '../completion.js'

const MAX_HISTORY = 64

/** One-line prompt with editing, history, and Tab completion. */
export function InputBox(props: {
  controller: SessionController
  modalOpen: boolean
  /** Called (only when idle typing) to toggle thinking blocks — A2. */
  onToggleThinking: () => void
}): JSX.Element {
  const { controller, modalOpen, onToggleThinking } = props
  const [value, setValue] = useState('')
  const [completion, setCompletion] = useState<CompletionResult | undefined>(undefined)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(0)
  const cwdRef = useRef(controller.options.cwd)

  const applyText = (next: string): void => {
    setValue(next)
    setCompletion(undefined)
  }

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
    <Box flexDirection="column" paddingX={1} paddingBottom={1}>
      {completion !== undefined && completion.hint !== '' && (
        <Text dimColor wrap="truncate">
          {completion.hint}: {completion.candidates.slice(0, 8).join(' ')}{completion.candidates.length > 8 ? ' …' : ''}
        </Text>
      )}
      <Box>
        <Text color={inCommand ? 'yellow' : 'cyan'}>{inCommand ? '/ ' : '> '}</Text>
        <Text>{value}</Text>
        <Text color="gray">▏</Text>
      </Box>
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