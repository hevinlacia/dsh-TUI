/**
 * Root Ink layout: chat/splash area → notice → input → rich status footer.
 * @module dsh-tui/ui/App
 */

import { useState, type JSX } from 'react'
import { Box } from 'ink'
import type { TuiController } from './controller.js'
import { useStore } from '../state/store.js'
import { StatusBar } from './StatusBar.js'
import { MessageList } from './MessageList.js'
import { InputBox } from './InputBox.js'
import { SessionBrowser } from './SessionBrowser.js'
import { ModelSwitch } from './ModelSwitch.js'
import { NoticeLine } from './NoticeLine.js'
import { Splash } from './Splash.js'
import { InfoPanel } from './InfoPanel.js'

/** Modal state shared between controller commands and the UI. */
export type Modal = 'none' | 'sessions' | 'model'

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

  return (
    <Box flexDirection="column" height="100%">
      <Box flexGrow={1} flexShrink={1} flexDirection="column">
        {empty
          ? (
            <Box flexDirection="row" flexGrow={1}>
              <Box flexGrow={1}><Splash /></Box>
              <InfoPanel model={state.model} effort={state.effort} cwd={cwd} gitBranch={gitBranch} />
            </Box>
          )
          : <MessageList state={state} thinkingOpen={thinkingOpen} />}
      </Box>
      <NoticeLine state={state} />
      <InputBox
        controller={controller}
        modalOpen={modal !== 'none'}
        currentModel={state.model}
        onToggleThinking={() => setThinkingOpen(open => !open)}
      />
      <StatusBar state={state} cwd={cwd} gitBranch={gitBranch} />
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
    </Box>
  )
}