/**
 * In-process Cordis plugin entry — the official-client front door.
 *
 * Mounted by a dsh profile (via `cordis.patch.yml`) alongside dsh-base. At
 * `apply`, it creates/resumes an Agent through the official agent factory,
 * subscribes to the in-process `session/event` feed, projects those events
 * through the existing reducer, and renders the TUI. DSH owns the agent,
 * session, tools, model, persistence and policy; the TUI only consumes.
 *
 * Note: this is the in-process target. It is wired against the official
 * `@deepseek-ai/*` types and compiles; live boot needs a running harness
 * profile to verify (see AGENTS.md → Transition status).
 * @module dsh-tui/plugin
 */

import React, { type JSX } from 'react'
import { render } from 'ink'
import {
  createUserMessage,
  Schema,
  type ContentBlock,
  type Context,
  type Session,
  type SessionEvent,
  type SessionId,
} from './official.js'
import { reduce, initialState, type TuiState } from './events/reducer.js'
import { eventsFor } from './events/types.js'
import type { SessionEvent as LocalSessionEvent } from './harness/types.js'
import { Store } from './state/store.js'
import { App, type Modal } from './ui/App.js'
import type { TuiController } from './ui/controller.js'
import type { CliOptions, ModelOption } from './config.js'

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

/** A `TuiController` backed by an official in-process {@link Context} + agent. */
class InProcessController implements TuiController {
  readonly options: CliOptions
  private readonly store: Store<TuiState>

  constructor(
    private readonly ctx: Context,
    private readonly agent: import('./official.js').Agent,
    options: CliOptions,
    store: Store<TuiState>,
  ) {
    this.options = options
    this.store = store
  }

  getState(): Store<TuiState> {
    return this.store
  }

  gitBranch(): string {
    return ''
  }

  sessions(): ReturnType<import('./sessions.js').SessionRegistry['list']> {
    return []
  }

  async submit(input: string): Promise<boolean> {
    const text = input.trim()
    if (text === '') return false
    // Phase 1: forward the raw line as a user follow-up. Slash-command routing
    // (model/preset/clear) is DSH-owned; wire it to the commands registry next.
    const message = createUserMessage({ content: textBlock(text), source: { kind: 'user' } })
    this.agent.followup(message)
    return true
  }

  resumeSession(id: string): void {
    void id // Resume is owned by the agent/session domain; no-op in phase 1.
  }

  async switchModel(option: ModelOption): Promise<void> {
    void option // Model switch is DSH-owned (fork/new session); no-op in phase 1.
  }
}

function textBlock(text: string): ContentBlock[] {
  return [{ type: 'text', text }]
}

/** Compute the controller's options from the plugin config. */
function controllerOptions(config: Config): CliOptions {
  const cwd = config.cwd ?? process.cwd()
  const provider = config.provider ?? 'deepseek-official'
  const model = config.model ?? 'deepseek-v4-flash'
  const modelOptions: ModelOption[] = [{ provider, id: model, name: model }]
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
    projectRoot: cwd,
  }
}

/**
 * Start the in-process TUI. Creates/resumes an agent, subscribes to session
 * events, and renders the App. Resolves when the TUI teardown completes.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const sessionId = (config.sessionId ?? `session-${Date.now().toString(36)}`) as SessionId
  const store = new Store<TuiState>(initialState(String(sessionId)))

  const agentHandle = await ctx.agents.create({
    sessionId,
    ...(config.cwd !== undefined ? { meta: { cwd: config.cwd } } : {}),
    ...(config.model !== undefined ? { agentOptions: { model: config.model } } : {}),
  })
  const agent = agentHandle.agent

  // The durable session event feed is the source of truth. Project through the
  // existing wire mapper (the official event is a superset of the local
  // structural subset) into the reducer.
  const onSessionEvent = (_session: Session, event: SessionEvent): void => {
    for (const tuiEvent of eventsFor(event as unknown as LocalSessionEvent)) {
      store.setState(state => reduce(state, tuiEvent))
    }
  }
  ctx.on('session/event', onSessionEvent)

  // Replay the existing log so a resumed session paints its history.
  for (const event of agent.session.events) {
    onSessionEvent(agent.session, event)
  }

  const controller = new InProcessController(ctx, agent, controllerOptions(config), store)

  /** Root owns modal state, mirroring the standalone App wiring. */
  function Root(): JSX.Element {
    const [modal, setModal] = React.useState<Modal>('none')
    return <App controller={controller} modal={modal} setModal={setModal} />
  }

  let app: { unmount: () => void } | undefined
  return new Promise<void>(resolve => {
    app = render(<Root />)
    void agent.whenIdle().finally(() => {
      void agentHandle.dispose().finally(() => {
        app?.unmount()
        resolve()
      })
    })
  })
}
