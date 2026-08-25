/**
 * Transport-agnostic slash-command execution. The standalone JSON-RPC
 * `SessionController` and the in-process Cordis plugin's controller both
 * drive the same command vocabulary; the pieces that differ (how a prompt is
 * submitted, how a model is switched, how a session is resumed/created) are
 * injected as host primitives.
 *
 * NOTE: the standalone controller keeps its own private `runCommand` so the
 * already-working CLI path is not touched. This module backs the in-process
 * plugin controller (and any future controller that reuses the vocabulary).
 * @module dsh-tui/commandRunner
 */

import type { ModelOption } from './config.js'
import { COMMANDS, lookupCommand } from './commands.js'
import type { TuiState } from './events/reducer.js'
import type { TuiEvent } from './events/types.js'
import { PERMISSION_LEVELS, resolvePermission, type PermissionMode } from './permission.js'
import { AGENT_PRESETS, isAgentPreset, type AgentPreset } from './presets.js'

/** The second-level modal kinds the controller can ask the UI to open. */
export type ModalKind = 'sessions' | 'model' | 'permission' | 'preset'

/**
 * The primitives a controller supplies so `runCommand` can act on the store
 * and the runtime without knowing which transport backs them.
 */
export interface CommandHost {
  /** The current plain state (the TuiController keeps a Store wrapper). */
  currentState(): TuiState
  apply(event: TuiEvent): void
  clear(): void
  newSession(): void
  resumeSession(id: string): void
  switchModel(option: ModelOption): Promise<void>
  setPermissionMode(mode: PermissionMode): Promise<void>
  setAgentPreset(preset: AgentPreset): Promise<void>
  listHarnessCommands(): Promise<Array<{ name: string; description: string }>>
  openModal(modal: ModalKind): void
  onExit(): void
  modelOptions: ModelOption[]
  currentSessionId(): string
}

/**
 * Run one slash command against a host. Unknown commands, help/clear/status/
 * context/new stay purely in the store; resume/sessions open the sessions
 * modal; model opens the model modal or switches; exit asks the host to quit.
 */
export async function runCommand(host: CommandHost, name: string, args: string): Promise<void> {
  const spec = lookupCommand(name)
  if (spec === undefined) {
    host.apply({ type: 'error', message: `unknown command /${name} — try /help` })
    return
  }
  const state = host.currentState()
  switch (spec.name) {
    case 'help':
      host.apply({ type: 'notice', message: COMMANDS.map(command => `${command.usage} — ${command.description}`).join('\n') })
      break
    case 'commands': {
      const harness = await host.listHarnessCommands()
      const tui = COMMANDS.map(command => `${command.usage} — ${command.description}`)
      const harnessLines = harness.map(command => `/${command.name} — ${command.description}`)
      const header = harnessLines.length > 0 ? '\n— harness commands —' : ''
      host.apply({ type: 'notice', message: [...tui, ...(harnessLines.length > 0 ? [header, ...harnessLines] : [])].join('\n') })
      break
    }
    case 'clear':
      host.clear()
      break
    case 'status':
      // Show the FULL session id so `/resume <id>` gets a copy-paste-able id.
      host.apply({
        type: 'notice',
        message:
          `session ${host.currentSessionId()} · ${state.connection} · ${state.phase}`
          + ` · ${state.provider}/${state.model || '?'} · turn ${state.turn} step ${state.step}`,
      })
      break
    case 'context':
      host.apply({
        type: 'notice',
        message:
          `turn ${state.turn} step ${state.step} · ${state.todos.length} todos`
          + ` · ${state.items.length} items · ${state.activeToolCount} tools running`
          + (state.title !== '' ? ` · "${state.title}"` : ''),
      })
      break
    case 'new':
      host.newSession()
      break
    case 'resume':
      if (args !== '') host.resumeSession(args)
      else host.openModal('sessions')
      break
    case 'sessions':
      host.openModal('sessions')
      break
    case 'model': {
      if (args === '') {
        host.openModal('model')
        break
      }
      const option = host.modelOptions.find(candidate => candidate.id === args)
      if (option === undefined) {
        host.apply({
          type: 'error',
          message: `unknown model ${args} — ${host.modelOptions.map(opt => opt.id).join(' | ')}`,
        })
        break
      }
      await host.switchModel(option)
      break
    }
    case 'permission': {
      if (args === '') {
        host.openModal('permission')
        break
      }
      const permission = resolvePermission(args)
      if (permission === undefined) {
        host.apply({ type: 'error', message: `unknown permission ${args} — ${PERMISSION_LEVELS.map(level => level.label).join(' | ')}` })
        break
      }
      await host.setPermissionMode(permission)
      break
    }
    case 'preset': {
      if (args === '') {
        host.openModal('preset')
        break
      }
      if (!isAgentPreset(args)) {
        host.apply({ type: 'error', message: `unknown preset ${args} — ${AGENT_PRESETS.join(' | ')}` })
        break
      }
      await host.setAgentPreset(args)
      break
    }
    case 'exit':
      host.onExit()
      break
  }
}
