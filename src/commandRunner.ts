/**
 * Slash-command execution for the in-process plugin controller.
 *
 * The plugin controller (`src/plugin.tsx`) drives this vocabulary; the pieces
 * that differ across hosts (how a prompt is submitted, how a model is switched,
 * how a session is resumed/created) are injected as host primitives.
 * @module dsh-tui/commandRunner
 */

import type { ModelOption } from './config.js'
import { COMMANDS, lookupCommand } from './commands.js'
import type { TuiState } from './events/reducer.js'
import type { TuiEvent } from './events/types.js'
import { PERMISSION_LEVELS, resolvePermission, type PermissionMode } from './permission.js'
import type { PresetInfo } from './presets.js'

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
  newSession(id?: string): void
  resumeSession(id: string): void
  /** Rename the live session (pins the title). */
  renameSession(title: string): Promise<void>
  /** The current session title ('' before the first title event). */
  currentTitle(): string
  switchModel(option: ModelOption): Promise<void>
  setPermissionMode(mode: PermissionMode): Promise<void>
  setAgentPreset(preset: string): Promise<void>
  listHarnessCommands(): Promise<Array<{ name: string; description: string }>>
  /** Live preset roster (shipped + user presets). */
  listPresets(): Promise<readonly PresetInfo[]>
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
    case 'name':
      if (args === '') {
        const title = host.currentTitle()
        host.apply({ type: 'notice', message: title === '' ? 'no title yet (auto once eligible input exists)' : `name: ${title}` })
      } else {
        await host.renameSession(args)
      }
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
      // Membership is a roster question: user presets (e.g. ~/.dsh/.agent-presets/hevin)
      // are as valid as the shipped four.
      const presets = await host.listPresets()
      if (!presets.some(preset => preset.id === args)) {
        host.apply({ type: 'error', message: `unknown preset ${args} — ${presets.map(p => p.id).join(' | ')}` })
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
