/**
 * A modal-style interaction view for pending model-facing decisions the agent
 * is blocked on: permission approvals (`allowed-once`/`rejected`) and
 * user-questions (`ask_user_question` with options or free-text). Rendered in
 * place of the input's own keyboard handling (the App blanks InputBox while a
 * `pending` interaction is present, so only this view owns the keys).
 * @module dsh-tui/ui/InteractionView
 */

import { useState, type JSX } from 'react'
import { Box, Text, useInput } from 'ink'
import type { TuiController } from './controller.js'
import type { PendingInteraction } from '../events/types.js'
import { palette } from './theme.js'

const KEY_HINTS = 'y 允许 · n 拒绝 · esc 取消'

/** Render the pending interaction (approval or the first question) and route keys. */
export function InteractionView(props: { interaction: PendingInteraction; controller: TuiController }): JSX.Element {
  const { interaction, controller } = props
  const [selected, setSelected] = useState(0)
  const [text, setText] = useState('')
  const [multi, setMulti] = useState<number[]>([])

  useInput((input, key) => {
    if (interaction.kind === 'approval') {
      if (key.escape) {
        controller.cancelInteraction(interaction.seq)
        return
      }
      if (input === 'y' || key.return) {
        controller.resolveInteraction(interaction.seq, { kind: 'approval', outcome: 'allowed-once' })
        return
      }
      if (input === 'n') {
        controller.resolveInteraction(interaction.seq, { kind: 'approval', outcome: 'rejected' })
        return
      }
      return
    }

    // user-question
    const item = interaction.items[0]
    if (item === undefined) {
      controller.cancelInteraction(interaction.seq)
      return
    }
    const options = item.options ?? []
    if (key.escape) {
      controller.cancelInteraction(interaction.seq)
      return
    }
    if (options.length > 0) {
      if (input >= '1' && input <= String(options.length)) {
        const index = Number(input) - 1
        if (item.multiSelect === true) {
          setMulti(current => current.includes(index) ? current.filter(value => value !== index) : [...current, index])
        } else {
          setSelected(index)
        }
        return
      }
      if (key.upArrow) {
        setSelected(index => (index - 1 + options.length) % options.length)
        return
      }
      if (key.downArrow) {
        setSelected(index => (index + 1) % options.length)
        return
      }
      if (key.return) {
        const indices = item.multiSelect === true && multi.length > 0 ? multi : [selected]
        const answer = {
          answers: [{ id: item.id, selected: indices.map(index => options[index]?.label ?? '').filter(Boolean) }],
        }
        controller.resolveInteraction(interaction.seq, { kind: 'question', answer })
      }
      return
    }
    // free-text question
    if (key.return) {
      controller.resolveInteraction(interaction.seq, {
        kind: 'question',
        answer: { answers: [{ id: item.id, selected: [], custom: text }] },
      })
      return
    }
    if (key.backspace) {
      setText(current => current.slice(0, -1))
      return
    }
    if (key.ctrl) return
    if (input !== '') setText(current => current + input)
  })

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} borderStyle="round" borderColor={palette.accent}>
      {interaction.kind === 'approval'
        ? renderApproval(interaction)
        : renderQuestion(interaction, selected, multi, text)}
    </Box>
  )
}

function renderApproval(interaction: Extract<PendingInteraction, { kind: 'approval' }>): JSX.Element {
  return (
    <>
      <Text color={palette.accent}>需要授权</Text>
      <Text color={palette.meta}>
        {interaction.toolName}
        {interaction.reason !== undefined && interaction.reason !== '' ? ` · ${interaction.reason}` : ''}
      </Text>
      {interaction.args !== undefined && interaction.args !== '' ? (
        <Text color={palette.meta} wrap="truncate">参数: {interaction.args.length > 200 ? `${interaction.args.slice(0, 200)}…` : interaction.args}</Text>
      ) : null}
      <Text color={palette.tip}>{KEY_HINTS}</Text>
    </>
  )
}

function renderQuestion(
  interaction: Extract<PendingInteraction, { kind: 'question' }>,
  selected: number,
  multi: number[],
  text: string,
): JSX.Element {
  const item = interaction.items[0]
  if (item === undefined) return <Text color={palette.error}>空问题</Text>
  const options = item.options ?? []
  const header = item.header ?? ''
  return (
    <>
      <Text color={palette.accent}>{header !== '' ? header : '提问'}</Text>
      <Text>{item.question}</Text>
      {item.detail !== undefined && item.detail !== '' ? <Text color={palette.meta}>{item.detail}</Text> : null}
      {options.length > 0
        ? (
          <>
            {item.multiSelect === true ? <Text color={palette.tip}>数字键勾选多项 · Enter 确认 · esc 取消</Text> : null}
            {options.map((option, index) => {
              const isSelected = item.multiSelect === true ? multi.includes(index) : selected === index
              const marker = isSelected ? '●' : '○'
              return (
                <Text key={`${option.label}-${index}`} color={isSelected ? palette.commandSelected : palette.commandItem}>
                  {` ${index + 1} ${marker} ${option.label}`}
                  {option.description !== undefined ? ` (${option.description})` : ''}
                </Text>
              )
            })}
            <Text color={palette.tip}>↑↓ 选择 · Enter 确认 · esc 取消</Text>
          </>
        )
        : (
          <>
            <Text color={palette.tip}>输入答案后按 Enter 提交 · esc 取消</Text>
            <Box>
              <Text color={palette.commandName}>{'> '}</Text>
              <Text>{text}</Text>
            </Box>
          </>
        )}
    </>
  )
}
