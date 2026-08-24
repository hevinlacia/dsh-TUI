/**
 * Root Ink layout: status line / chat area / input line (+ transient gloss).
 * @module dsh-tui/ui/App
 */

import { useState, type JSX } from 'react'
import { Box } from 'ink'
import type { SessionController } from '../controller.js'
import { useStore } from '../state/store.js'
import { StatusBar } from './StatusBar.js'
import { MessageList } from './MessageList.js'
import { InputBox } from './InputBox.js'
import { SessionBrowser } from './SessionBrowser.js'
import { ModelSwitch } from './ModelSwitch.js'
import { NoticeLine } from './NoticeLine.js'

/** Modal state shared between controller commands and the UI. */
export type Modal = 'none' | 'sessions' | 'model'

/** Root component. `modal` is App-local React state; the controller opens it via hooks. */
export function App(props: {
  controller: SessionController
  modal: Modal
  setModal: (modal: Modal) => void
}): JSX.Element {
  const { controller, modal, setModal } = props
  const state = useStore(controller.getState(), s => s)
  const [thinkingOpen, setThinkingOpen] = useState(false)

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar state={state} />
      <Box flexGrow={1} flexShrink={1}>
        <MessageList state={state} thinkingOpen={thinkingOpen} />
      </Box>
      <NoticeLine state={state} />
      <InputBox
        controller={controller}
        modalOpen={modal !== 'none'}
        onToggleThinking={() => setThinkingOpen(open => !open)}
      />
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
          models={controller.options.models}
          current={state.model}
          onSelect={async model => {
            await controller.switchModel(model)
            setModal('none')
          }}
          onClose={() => setModal('none')}
        />
      )}
    </Box>
  )
}