/**
 * One-shot mode: run a single task against the runtime and print the final
 * assistant reply. The same controller + reducer pipeline as the TUI, with a
 * plain-text sink — no Ink, script-friendly.
 * @module dsh-tui/oneshot
 */

import type { CliOptions } from './config.js'
import { registryPath } from './config.js'
import { SessionController } from './controller.js'
import { HarnessClient } from './harness/client.js'
import { renderState } from './replay.js'
import { resolveRuntime } from './runtime/resolve.js'

/** Run one task; resolves with the process exit code. */
export async function runOneShot(options: CliOptions): Promise<number> {
  const runtime = resolveRuntime(options)
  if (options.dryRun) {
    process.stdout.write(`spawn ${runtime.launch.command} ${runtime.launch.args.join(' ')} (${runtime.describe})\n`)
    return 0
  }

  const client = new HarnessClient(runtime.launch)
  const controller = new SessionController(client, { ...options, registryPath: registryPath() })
  try {
    await controller.start()
  } catch (error) {
    process.stderr.write(`dsh-tui: ${error instanceof Error ? error.message : String(error)}\n`)
    await client.close()
    return 1
  }

  const settled = settleWhenIdle(controller)
  if (options.task !== undefined) await controller.submitPrompt(options.task)
  await Promise.race([settled, new Promise<void>(resolve => setTimeout(resolve, 10 * 60_000))])

  const state = controller.getState().getState()
  const failed = state.connection === 'disconnected' || state.error !== ''
  if (failed) {
    // Print the full render for diagnostics, then report failure to scripts.
    process.stdout.write(`${renderState(state)}\n`)
    await client.close()
    return 1
  }
  // Print the final assistant reply (the old headless boundary's contract);
  // the full render stays available via --replay.
  const lastAssistant = [...state.items].reverse().find(item => item.kind === 'assistant')
  if (lastAssistant !== undefined && lastAssistant.kind === 'assistant') {
    process.stdout.write(`${lastAssistant.text}\n`)
  } else {
    process.stdout.write(`${renderState(state)}\n`)
  }
  await client.close()
  return 0
}

/** Resolve once a connected session finished at least one turn (idle again). */
function settleWhenIdle(controller: SessionController): Promise<void> {
  const store = controller.getState()
  return new Promise<void>(resolve => {
    const check = (): void => {
      const state = store.getState()
      if (state.connection === 'disconnected') {
        unsubscribe()
        resolve()
        return
      }
      if (state.connection === 'connected' && state.phase === 'idle' && state.turn > 0) {
        unsubscribe()
        resolve()
        return
      }
    }
    const unsubscribe = store.subscribe(check)
    check()
  })
}