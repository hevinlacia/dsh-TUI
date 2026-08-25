/**
 * Session controller: the single wiring hub between the runtime client, the
 * store, the session registry, and command execution. UI components only
 * read the store and call these methods.
 * @module dsh-tui/controller
 */

import { execFileSync } from 'node:child_process'
import type { CliOptions, ModelOption } from './config.js'
import { COMMANDS, lookupCommand, parseInput } from './commands.js'
import { reduce, initialState, type TuiState } from './events/reducer.js'
import { tuiEventsFromNotification, type TuiEvent } from './events/types.js'
import type { HarnessClient } from './harness/client.js'
import { PERMISSION_LEVELS, permissionLabel, resolvePermission, type PermissionMode } from './permission.js'
import { AGENT_PRESETS, DEFAULT_AGENT_PRESET, isAgentPreset, presetLabel, type AgentPreset } from './presets.js'
import { SessionRegistry } from './sessions.js'
import { Store } from './state/store.js'

/** Callbacks the TUI supplies to the controller for UI-only concerns. */
export interface ControllerHooks {
  /** Open a modal (sessions / model / permission / preset switch). */
  openModal?: (modal: 'sessions' | 'model' | 'permission' | 'preset') => void
  /** Called when the user quits. */
  onExit?: () => void
}

/**
 * Owns one active session id and connects the runtime notification stream to
 * the store. Created once per process; {@link start} boots the runtime.
 */
export class SessionController {
  private sessionId = `session-${randomPart()}`
  private readonly registry: SessionRegistry
  private readonly store: Store<TuiState>

  constructor(
    readonly client: HarnessClient,
    readonly options: CliOptions & { registryPath: string },
    private readonly hooks: ControllerHooks = {},
  ) {
    this.registry = new SessionRegistry(options.registryPath)
    this.registry.load()
    this.store = new Store(initialState(this.sessionId))
  }

  /** Local git branch for the workspace cwd (empty when not a repo). */
  gitBranch(): string {
    try {
      const cwd = this.options.cwd
      const result = execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return result.trim()
    } catch {
      return ''
    }
  }

  /** The store UI components read. */
  getState(): Store<TuiState> {
    return this.store
  }

  /** Current active session id. */
  currentSessionId(): string {
    return this.sessionId
  }

  /** Named sessions for the browser. */
  sessions(): ReturnType<SessionRegistry['list']> {
    return this.registry.list()
  }

  /** Spawn the runtime, handshake, and start feeding notifications. */
  async start(): Promise<void> {
    this.client.onNotification(notification => {
      for (const event of tuiEventsFromNotification(notification)) {
        this.apply(event)
      }
    })
    this.store.setState(state => ({ ...state, connection: 'connecting' }))
    try {
      this.client.start()
      const result = await this.client.initialize({
        cwd: this.options.cwd,
        provider: this.options.provider,
        model: this.options.model,
      })
      void result
      this.apply({ type: 'connected' })
      this.apply({ type: 'context', provider: this.options.provider, model: this.options.model })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.apply({ type: 'disconnected', reason: message })
      throw error
    }
  }

  /** Submit a plain user prompt on the active session. */
  async submitPrompt(text: string): Promise<void> {
    const prompt = text.trim()
    if (prompt === '') return
    // No local echo: the runtime's `user/message` session event is the single
    // source for the chat surface (see docs/protocol.md).
    this.touchSession(() => ({})) // bump updatedAt only
    try {
      await this.client.sessionPrompt(this.sessionId, prompt)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.apply({ type: 'error', message })
    }
  }

  /** Handle one input line: slash command or prompt. */
  async submit(input: string): Promise<boolean> {
    const parsed = parseInput(input)
    if (parsed.kind === 'prompt') {
      await this.submitPrompt(parsed.text)
      return true
    }
    await this.runCommand(parsed.name, parsed.args)
    return true
  }

  /** Start a fresh session; keeps the runtime. */
  newSession(): void {
    this.sessionId = `session-${randomPart()}`
    const fresh = initialState(this.sessionId)
    fresh.connection = this.store.getState().connection
    fresh.provider = this.store.getState().provider
    fresh.model = this.store.getState().model
    this.store.setState(() => fresh)
    this.apply({ type: 'notice', message: `new session ${this.sessionId}` })
  }

  /** Switch the active session id (for `/resume`); view resets to the fresh id. */
  resumeSession(id: string): void {
    this.sessionId = id
    const fresh = initialState(id)
    fresh.connection = this.store.getState().connection
    fresh.provider = this.store.getState().provider
    fresh.model = this.store.getState().model
    const meta = this.registry.list().find(entry => entry.id === id)
    fresh.title = meta?.title ?? ''
    this.store.setState(() => fresh)
    this.apply({ type: 'notice', message: `resumed ${id} — previous messages stay in the runtime log` })
  }

  /** Switch the model (and its provider) for subsequently created sessions. */
  async switchModel(option: ModelOption): Promise<void> {
    const model = option.id
    if (model === this.store.getState().model) {
      this.apply({ type: 'notice', message: `already on ${model}` })
      return
    }
    try {
      await this.client.switchModel(model, option.provider, this.options.cwd)
      this.apply({ type: 'context', provider: option.provider, model })
      this.apply({ type: 'notice', message: `model → ${model} (applies to new sessions; /new to start one)` })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.apply({ type: 'error', message })
    }
  }

  /** The JSON-RPC runtime's session is the source; the store mirrors the event fold. */
  currentPermission(): PermissionMode {
    return this.store.getState().permission
  }

  /** The standalone runtime owns the sandbox; there is no JSON-RPC switch, so this only updates the UI. */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.apply({ type: 'permission', mode })
    this.apply({ type: 'notice', message: `permission → ${permissionLabel(mode)} (standalone 无法真正切换，需进程内模式)` })
  }

  /** The compose default agent preset (standalone records it only). */
  currentPreset(): AgentPreset {
    return DEFAULT_AGENT_PRESET
  }

  /** The standalone runtime composes agents without a preset roster, so this only records the choice. */
  async setAgentPreset(preset: AgentPreset): Promise<void> {
    this.apply({ type: 'notice', message: `preset → ${presetLabel(preset)} (standalone 无 agent-presets roster，仅记录)` })
  }

  /** Standalone talks JSON-RPC, so no harness command registry is reachable. */
  async listHarnessCommands(): Promise<Array<{ name: string; description: string }>> {
    return []
  }

  /** The standalone runtime has no in-process agent to abort; no-op. */
  interrupt(): void {
    this.apply({ type: 'notice', message: 'standalone 无进程内 agent，无法中断（用 /exit 退出）' })
  }

  /** Clear the rendered chat view. */
  clear(): void {
    this.store.setState(state => ({ ...state, items: [] }))
  }

  /** No-op: the JSON-RPC runtime owns approvals/questions; never surfaced here. */
  resolveInteraction(_seq: number, _decision: import('./ui/controller.js').InteractionDecision): boolean {
    return false
  }

  /** No-op: the JSON-RPC runtime owns the interaction lifecycle. */
  cancelInteraction(_seq: number): void {}

  /** Apply one TuiEvent through the reducer and sync registry metadata. */
  private apply(event: TuiEvent): void {
    this.store.setState(state => reduce(state, event))
    if (event.type === 'user-message') {
      this.touchSession(meta => ({ messageCount: meta.messageCount + 1 }))
    }
    if (event.type === 'title' && event.title !== '') {
      this.touchSession(() => ({ title: event.title }))
    }
  }

  private touchSession(patch: (meta: { title: string; messageCount: number }) => { title?: string; messageCount?: number }): void {
    const meta = this.registry.list().find(entry => entry.id === this.sessionId)
    const title = meta?.title ?? ''
    const messageCount = meta?.messageCount ?? 0
    const applied = patch({ title, messageCount })
    this.registry.touch(this.sessionId, applied)
  }

  private async runCommand(name: string, args: string): Promise<void> {
    const spec = lookupCommand(name)
    if (spec === undefined) {
      this.apply({ type: 'error', message: `unknown command /${name} — try /help` })
      return
    }
    const state = this.store.getState()
    switch (spec.name) {
      case 'help':
        this.apply({ type: 'notice', message: COMMANDS.map(command => `${command.usage} — ${command.description}`).join('\n') })
        break
      case 'commands': {
        const harness = await this.listHarnessCommands()
        const tui = COMMANDS.map(command => `${command.usage} — ${command.description}`)
        const header = harness.length > 0 ? '\n— harness commands —' : ''
        this.apply({ type: 'notice', message: [...tui, ...(harness.length > 0 ? [header, ...harness.map(c => `/${c.name} — ${c.description}`)] : [])].join('\n') })
        break
      }
      case 'clear':
        this.clear()
        break
      case 'status':
        this.apply({
          type: 'notice',
          message:
            `session ${this.sessionId} · ${state.connection} · ${state.phase}`
            + ` · ${state.provider}/${state.model || '?'} · turn ${state.turn} step ${state.step}`,
        })
        break
      case 'context':
        this.apply({
          type: 'notice',
          message:
            `turn ${state.turn} step ${state.step} · ${state.todos.length} todos`
            + ` · ${state.items.length} items · ${state.activeToolCount} tools running`
            + (state.title !== '' ? ` · "${state.title}"` : ''),
        })
        break
      case 'new':
        this.newSession()
        break
      case 'resume':
        if (args !== '') this.resumeSession(args)
        else this.hooks.openModal?.('sessions')
        break
      case 'sessions':
        this.hooks.openModal?.('sessions')
        break
      case 'model': {
        if (args === '') {
          this.hooks.openModal?.('model')
          break
        }
        const option = this.options.modelOptions.find(candidate => candidate.id === args)
        if (option === undefined) {
          this.apply({ type: 'error', message: `unknown model ${args} — ${this.options.modelOptions.map(opt => opt.id).join(' | ')}` })
          break
        }
        await this.switchModel(option)
        break
      }
      case 'permission': {
        if (args === '') {
          this.hooks.openModal?.('permission')
          break
        }
        const permission = resolvePermission(args)
        if (permission === undefined) {
          this.apply({ type: 'error', message: `unknown permission ${args} — ${PERMISSION_LEVELS.map(level => level.label).join(' | ')}` })
          break
        }
        await this.setPermissionMode(permission)
        break
      }
      case 'preset': {
        if (args === '') {
          this.hooks.openModal?.('preset')
          break
        }
        if (!isAgentPreset(args)) {
          this.apply({ type: 'error', message: `unknown preset ${args} — ${AGENT_PRESETS.join(' | ')}` })
          break
        }
        await this.setAgentPreset(args)
        break
      }
      case 'exit':
        this.hooks.onExit?.()
        break
    }
  }
}

function randomPart(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12)
}