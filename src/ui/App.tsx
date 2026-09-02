/**
 * Root Ink layout — a FIXED frame sized to the terminal (pi's layout model):
 *
 *   ┌ history (flex, bottom-anchored, top-clipped)  ┐
 *   ├ notice line                                   ┤
 *   ├ ──── input top rule ────                      ┤
 *   ├ input line                                    ┤  ← the interface divider
 *   ├ ──── input bottom rule ────                   ┤
 *   ├ dynamic zone: interaction / selectors         ┤ (bounded, grows downward)
 *   └ status footer                                 ┘
 *
 * The root Box is exactly `rows` tall, so a render frame can NEVER exceed the
 * terminal height — the resize-tearing fix (Ink cannot erase frames taller
 * than the screen). Everything dynamic (command menus, sub-command selectors,
 * approvals, questions) renders BELOW the input, which keeps the area above
 * the input pure history; the input's vertical position shifts as the bounded
 * dynamic zone grows and shrinks.
 * @module dsh-tui/ui/App
 */

import { useState, type JSX } from 'react'
import { Box, useWindowSize } from 'ink'
import type { TuiController } from './controller.js'
import { useStore } from '../state/store.js'
import { StatusBar } from './StatusBar.js'
import { MessageList } from './MessageList.js'
import { InputBox } from './InputBox.js'
import { SessionBrowser } from './SessionBrowser.js'
import { ModelSwitch } from './ModelSwitch.js'
import { PermissionSwitch } from './PermissionSwitch.js'
import { PresetSwitch } from './PresetSwitch.js'
import { InteractionView } from './InteractionView.js'
import { NoticeLine } from './NoticeLine.js'
import { Splash } from './Splash.js'

/** Modal state shared between controller commands and the UI. */
export type Modal = 'none' | 'sessions' | 'model' | 'permission' | 'preset'

/** Root component. `modal` is App-local React state; the controller opens it via hooks. */
export function App(props: {
  controller: TuiController
  modal: Modal
  setModal: (modal: Modal) => void
}): JSX.Element {
  const { controller, modal, setModal } = props
  const state = useStore(controller.getState(), s => s)
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const gitBranch = controller.gitBranch()
  const cwd = controller.options.cwd
  const empty = state.items.length === 0
  const pending = state.pending
  // Live terminal size: re-renders this whole tree on resize, so every
  // width/height computation below is fresh (no stale rules or windows).
  const { columns, rows } = useWindowSize()

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {/* History: bottom-anchored, top-clipped. overflow:hidden lets flex
          shrink it below its content height, so the tail always stays visible
          and the frame never overflows the terminal. The content wrapper is
          flexShrink:0 — ink boxes default to flexShrink 1, and without the
          wrapper the children squash into interleaved rows instead of
          clipping cleanly. */}
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minHeight={0}
        overflow="hidden"
        justifyContent="flex-end"
      >
        <Box flexDirection="column" flexShrink={0}>
          {empty
            ? <Splash model={state.model} effort={state.effort} cwd={cwd} gitBranch={gitBranch} />
            : <MessageList state={state} thinkingOpen={thinkingOpen} scrollActive={modal === 'none' && pending === undefined} />}
        </Box>
      </Box>
      {/* The whole block below the input is content-sized (never shrinks):
          the input anchors it to the bottom, the history area absorbs all
          slack above. */}
      <Box flexDirection="column" flexShrink={0}>
        <NoticeLine state={state} />
        <InputBox
          controller={controller}
          modalOpen={modal !== 'none' || pending !== undefined}
          currentModel={state.model}
          running={state.phase === 'working' || state.phase === 'thinking' || state.phase === 'tool-running'}
          onToggleThinking={() => setThinkingOpen(open => !open)}
        />
        {/* Dynamic zone BELOW the input — bounded selectors, never overlaps
            history. */}
        {pending !== undefined && <InteractionView interaction={pending} controller={controller} />}
        {modal === 'sessions' && (
          <SessionBrowser
            sessions={controller.sessions()}
            onSelect={id => {
              controller.resumeSession(id)
              setModal('none')
            }}
            onClose={() => setModal('none')}
          />
        )}
        {modal === 'model' && (
          <ModelSwitch
            options={controller.options.modelOptions}
            current={state.model}
            onSelect={async option => {
              await controller.switchModel(option)
              setModal('none')
            }}
            onClose={() => setModal('none')}
          />
        )}
        {modal === 'permission' && (
          <PermissionSwitch
            current={state.permission}
            onSelect={async mode => {
              await controller.setPermissionMode(mode)
              setModal('none')
            }}
            onClose={() => setModal('none')}
          />
        )}
        {modal === 'preset' && (
          <PresetSwitch
            current={controller.currentPreset()}
            onSelect={async preset => {
              await controller.setAgentPreset(preset)
              setModal('none')
            }}
            onClose={() => setModal('none')}
          />
        )}
        <StatusBar state={state} cwd={cwd} gitBranch={gitBranch} />
      </Box>
    </Box>
  )
}
