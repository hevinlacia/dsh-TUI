/**
 * In-process Cordis plugin entry — the official-client front door.
 *
 * Mounted by a dsh profile (via `cordis.patch.yml`) over dsh-base. At `apply`
 * it creates/resumes an Agent through the official agent factory, subscribes
 * to the in-process `session/event` feed, projects those events through the
 * existing reducer, and renders the TUI. DSH owns the agent, session, tools,
 * model, persistence and policy; the TUI only consumes.
 *
 * The controller implements the full slash-command vocabulary via the shared
 * {@link ../commandRunner} and wires `/model`, `/new`, `/resume` to the
 * official agent factory (create/resume). Live boot still needs a running
 * harness profile to verify (see AGENTS.md → Transition status).
 * @module dsh-tui/plugin
 */

import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import React, { useState, type JSX } from 'react'
import { render } from 'ink'
import {
  createUserMessage,
  Schema,
  type Agent,
  type ContentBlock,
  type Context,
  type Session,
  type SessionEvent,
  type SessionId,
} from './official.js'
import { dshHome, loadDshSettings, type CliOptions, type ModelOption } from './config.js'
import { parseInput } from './commands.js'
import { runCommand, type CommandHost, type ModalKind } from './commandRunner.js'
import { reduce, initialState, type TuiState } from './events/reducer.js'
import { eventsFor, type TuiEvent } from './events/types.js'
import type { SessionEvent as LocalSessionEvent } from './harness/types.js'
import { Store } from './state/store.js'
import { App, type Modal } from './ui/App.js'
import type { TuiController } from './ui/controller.js'

export const name = 'dsh-tui'
/** The agent registry service the TUI creates/resumes its agent through. */
export const inject = ['agents']

/** dsh-tui plugin configuration. */
export interface Config {
  provider?: string
  model?: string
  cwd?: string
  preset?: string
  sessionId?: string
}

/** Cordis schemastery schema for {@link Config}. */
export const Config: Schema<Config> = Schema.object({
  provider: Schema.string().required(false),
  model: Schema.string().required(false),
  cwd: Schema.string().required(false),
  preset: Schema.string().required(false),
  sessionId: Schema.string().required(false),
})

/** UI-only callbacks the controller drives (modal open / exit). */
interface ControllerHooks {
  openModal?: (modal: ModalKind) => void
  onExit?: () => void
}

type AgentHandle = { agent: Agent; dispose(): Promise<void> }

/**
 * A `TuiController` + `CommandHost` backed by an official in-process
 * {@link Context}. Owns the live {@link AgentHandle}; creates/resumes agents
 * via the factory for `/new` and `/resume`, and carries the model default the
 * next created session composes from.
 */
class InProcessController implements TuiController, CommandHost {
  readonly options: CliOptions
  private readonly store: Store<TuiState>
  private readonly hooks: ControllerHooks
  private handle?: AgentHandle
  private readonly currentId: { current: string }
  private defaultProvider: string
  private defaultModel: string

  constructor(
    private readonly ctx: Context,
    options: CliOptions,
    store: Store<TuiState>,
    initialId: string,
    hooks: ControllerHooks,
    defaultProvider: string,
    defaultModel: string,
  ) {
    this.options = options
    this.store = store
    this.hooks = hooks
    this.currentId = { current: initialId }
    this.defaultProvider = defaultProvider
    this.defaultModel = defaultModel
  }

  // ── TuiController ─────────────────────────────────────────────────────────

  getState(): Store<TuiState> {
    return this.store
  }

  /** CommandHost model vocabulary. */
  get modelOptions(): ModelOption[] {
    return this.options.modelOptions
  }

  gitBranch(): string {
    try {
      const result = execFileSync('git', ['-C', this.options.cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return result.trim()
    } catch {
      return ''
    }
  }

  sessions(): ReturnType<import('./sessions.js').SessionRegistry['list']> {
    // Phase 1: no in-process session cursor/browser; `/resume <id>` works by id.
    return []
  }

  /** Submit one input line: slash command or prompt. */
  async submit(input: string): Promise<boolean> {
    const parsed = parseInput(input)
    if (parsed.kind === 'prompt') {
      this.submitPrompt(parsed.text)
      return true
    }
    await runCommand(this, parsed.name, parsed.args)
    return true
  }

  /** Resume an existing session id through the official agent factory. */
  async resumeSession(id: string): Promise<void> {
    try {
      const resolved = this.resolveSessionId(id)
      await this.attach({ resumeSessionId: resolved as SessionId })
      this.apply({ type: 'notice', message: `resumed ${resolved}` })
    } catch (error) {
      this.apply({ type: 'error', message: errMsg(error) })
    }
  }

  /** Switch the model default used to compose new sessions. */
  async switchModel(option: ModelOption): Promise<void> {
    if (option.id === this.store.getState().model) {
      this.apply({ type: 'notice', message: `already on ${option.id}` })
      return
    }
    // Apply to new sessions: update the compose default + the status line.
    this.defaultProvider = option.provider
    this.defaultModel = option.id
    this.apply({ type: 'context', provider: option.provider, model: option.id })
    this.apply({ type: 'notice', message: `model → ${option.id} (new sessions; /new to start one)` })
  }

  // ── CommandHost ───────────────────────────────────────────────────────────

  currentState(): TuiState {
    return this.store.getState()
  }

  apply(event: TuiEvent): void {
    this.store.setState(state => reduce(state, event))
  }

  clear(): void {
    this.store.setState(state => ({ ...state, items: [] }))
  }

  /** Start a fresh session with the current model default. */
  async newSession(): Promise<void> {
    const id = `session-${randomPart()}` as SessionId
    try {
      await this.attach({ sessionId: id })
      this.apply({ type: 'notice', message: `new session ${String(id)}` })
    } catch (error) {
      this.apply({ type: 'error', message: errMsg(error) })
    }
  }

  openModal(modal: ModalKind): void {
    this.hooks.openModal?.(modal)
  }

  onExit(): void {
    this.hooks.onExit?.()
  }

  currentSessionId(): string {
    return this.currentId.current
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  /** Tear down the live agent (best-effort) on exit. */
  async disposeAgent(): Promise<void> {
    if (this.handle === undefined) return
    const handle = this.handle
    this.handle = undefined
    await handle.dispose()
  }

  /** Expand a `/resume` argument to a real session id (exact → prefix scan). */
  private resolveSessionId(input: string): string {
    const trimmed = input.trim()
    if (trimmed === '') return trimmed
    return this.scanPersistedSessionId(trimmed) ?? trimmed
  }

  /** Best-effort prefix match against the durable session-store layout. */
  private scanPersistedSessionId(prefix: string): string | undefined {
    const root = join(dshHome(), 'sessions')
    const matches: string[] = []
    const walk = (dir: string, depth: number): void => {
      if (depth > 3) return
      let entries: { name: string; isDirectory(): boolean }[] = []
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          // Session ids are leaf dirs (`session-6532a0a0664f`); skip the
          // `--<cwd-slug>--` grouping dirs (they start with `--`) and recurse.
          if (entry.name.startsWith(prefix) && !entry.name.startsWith('--')) {
            matches.push(entry.name)
          } else {
            walk(full, depth + 1)
          }
        }
      }
    }
    walk(root, 0)
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) throw new Error(`ambiguous session "${prefix}" — ${matches.join(', ')}`)
    return undefined
  }

  /** Create/resume an agent and (re)point the store at its session. */
  private async attach(options: { sessionId: SessionId } | { resumeSessionId: SessionId }): Promise<void> {
    const previous = this.handle
    this.handle = undefined
    // Create the replacement FIRST; only dispose the old handle once the new
    // one is ready, so a failed create leaves the previous session intact.
    const handle = await this.createOrResume(options)
    this.handle = handle
    if (previous) void previous.dispose()
    const sessionId = handle.agent.id
    this.currentId.current = String(sessionId)
    this.store.setState(() => initialState(String(sessionId)))
    // Replay the durable log so a resumed session paints its history.
    for (const event of handle.agent.session.events) {
      this.onSessionEvent(handle.agent.session, event)
    }
  }

  private async createOrResume(options: { sessionId: SessionId } | { resumeSessionId: SessionId }): Promise<AgentHandle> {
    const agentOptions = { provider: this.defaultProvider, model: this.defaultModel }
    if ('resumeSessionId' in options) {
      return this.ctx.agents.resume({ resumeSessionId: options.resumeSessionId })
    }
    return this.ctx.agents.create({
      sessionId: options.sessionId,
      meta: { cwd: this.options.cwd },
      agentOptions,
    })
  }

  /** Project an official session event into the store (filtered to the live session). */
  private onSessionEvent(session: Session, event: SessionEvent): void {
    if (session.id !== this.currentId.current) return
    for (const tuiEvent of eventsFor(event as unknown as LocalSessionEvent)) {
      this.store.setState(state => reduce(state, tuiEvent))
    }
  }

  /** Register the durable feed; call once at boot. */
  subscribe(): void {
    this.ctx.on('session/event', (session, event) => this.onSessionEvent(session, event))
  }

  /** Submit a plain prompt via the agent. */
  private submitPrompt(text: string): void {
    const trimmed = text.trim()
    if (trimmed === '') return
    const message = createUserMessage({ content: textBlock(trimmed), source: { kind: 'user' } })
    this.handle?.agent.followup(message)
  }
}

function textBlock(text: string): ContentBlock[] {
  return [{ type: 'text', text }]
}

function randomPart(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12)
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Build the controller's CliOptions from plugin config + dsh settings. */
function controllerOptions(config: Config): CliOptions {
  const settings = loadDshSettings()
  const provider = config.provider ?? settings?.defaultProvider ?? 'deepseek-official'
  const model = config.model ?? settings?.defaultModel ?? 'deepseek-v4-flash'
  const modelOptions = settings?.modelOptions ?? [{ provider, id: model, name: model }]
  const cwd = config.cwd ?? process.cwd()
  return {
    task: undefined,
    replay: undefined,
    dryRun: false,
    cwd,
    jsonrpcBin: undefined,
    cordis: undefined,
    provider,
    model,
    modelOptions,
    projectRoot: process.cwd(),
  }
}

/**
 * Start the in-process TUI. Creates/resumes an agent, subscribes to session
 * events, renders the App, and resolves when the TUI teardown completes.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const options = controllerOptions(config)
  const initialId = config.sessionId ?? `session-${Date.now().toString(36)}`
  const store = new Store<TuiState>(initialState(initialId))
  const modalRef: { current: ((modal: Modal) => void) | undefined } = { current: undefined }

  let app: { unmount: () => void } | undefined
  let exitResolve: () => void = () => {}
  const exitPromise = new Promise<void>(resolveExit => { exitResolve = resolveExit })

  const controller = new InProcessController(
    ctx,
    options,
    store,
    initialId,
    {
      openModal: modal => modalRef.current?.(modal),
      onExit: () => {
        // The host profile keeps running after `apply` resolves, so a TUI
        // front door must terminate the process itself (like the community
        // client): dispose the agent, unmount the Ink tree, then exit.
        void controller.disposeAgent().finally(() => {
          app?.unmount()
          exitResolve()
          process.exit(0)
        })
      },
    },
    options.provider,
    options.model,
  )

  /** Root owns modal state and mirrors the setter into the controller hook. */
  function Root(): JSX.Element {
    const [modal, setModal] = useState<Modal>('none')
    modalRef.current = setModal
    return <App controller={controller} modal={modal} setModal={setModal} />
  }

  controller.subscribe()
  app = render(<Root />)

  try {
    if (config.sessionId !== undefined) {
      await controller.resumeSession(config.sessionId)
    } else {
      await controller.newSession()
    }
  } catch (error) {
    // The store already carries the disconnected/error state; keep the UI alive.
    void error
  }
  return exitPromise
}
