/**
 * Interactive TUI entry: wires the Ink root, the session controller, and the
 * runtime subprocess lifecycle for this process.
 * @module dsh-tui/index
 */

import { render } from 'ink'
import { useState, type JSX } from 'react'
import type { CliOptions } from './config.js'
import { registryPath } from './config.js'
import { SessionController } from './controller.js'
import { HarnessClient } from './harness/client.js'
import { resolveRuntime } from './runtime/resolve.js'
import { App, type Modal } from './ui/App.js'

/** Run the interactive TUI; resolves with the process exit code after quit. */
export async function runInteractive(options: CliOptions): Promise<number> {
  const runtime = resolveRuntime(options)
  if (options.dryRun) {
    // The single machine-readable line for --dry-run.
    process.stdout.write(`spawn ${runtime.launch.command} ${runtime.launch.args.join(' ')} (${runtime.describe})\n`)
    return 0
  }

  const client = new HarnessClient(runtime.launch)
  const modalRef: { current: ((modal: Modal) => void) | undefined } = { current: undefined }
  let app: { unmount: () => void } | undefined
  let exitResolve: (code: number) => void = () => {}
  const exitPromise = new Promise<number>(resolveExit => { exitResolve = resolveExit })

  const controller = new SessionController(client, { ...options, registryPath: registryPath() }, {
    openModal: modal => modalRef.current?.(modal),
    onExit: () => {
      void client.close().finally(() => {
        app?.unmount()
        exitResolve(0)
      })
    },
  })

  /** Root owns modal state and mirrors the setter into the controller hook. */
  function Root(): JSX.Element {
    const [modal, setModal] = useState<Modal>('none')
    modalRef.current = setModal
    return <App controller={controller} modal={modal} setModal={setModal} />
  }

  app = render(<Root />)

  // Terminal-level quit paths (the runtime is the only child process).
  const quit = (): void => {
    void client.close().finally(() => {
      app?.unmount()
      process.exit(0)
    })
  }
  process.once('SIGTERM', quit)
  process.once('SIGINT', quit)

  try {
    await controller.start()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // The store already carries the disconnected state; keep the UI alive so
    // the user can re-roll with /exit and see the stderr tail.
    void message
  }
  return exitPromise
}