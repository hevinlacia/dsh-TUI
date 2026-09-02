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

import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import React, { useState, type JSX } from 'react'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
import { render } from 'ink'
import {
  createUserMessage,
  effectiveSandboxMode,
  Schema,
  setSandboxMode,
  type Agent,
  type AgentPresetsService,
  type ApprovalOutcome,
  type ApprovalRequest,
  type AskUserQuestionAnswer,
  type AskUserQuestionRequest,
  type ContentBlock,
  type Context,
  type SandboxMode,
  type Session,
  type SessionEvent,
  type SessionId,
} from './official.js'
import { dshHome, loadDshSettings, loadTuiConfigFile, type CliOptions, type ModelOption } from './config.js'
import { loadLastModel, loadLastPreset, loadLastSmart, saveLastModel, saveLastPreset, saveLastSmart } from './lastModel.js'
import { approvalPolicyFor, DEFAULT_PERMISSION, permissionLabel, sandboxModeFor, type PermissionMode } from './permission.js'
import { classifyToolCall } from './smartPermission.js'
import { DEFAULT_AGENT_PRESET, SHIPPED_AGENT_PRESETS, type PresetInfo } from './presets.js'
import { parseInput } from './commands.js'
import { runCommand, type CommandHost, type ModalKind } from './commandRunner.js'
import { reduce, initialState, type TuiState } from './events/reducer.js'
import { eventsFor, type TuiEvent } from './events/types.js'
import type { SessionEvent as LocalSessionEvent } from './harness/types.js'
import { Store } from './state/store.js'
import type { SessionMeta } from './sessions.js'
import { App, type Modal } from './ui/App.js'
import type { TuiController, InteractionDecision } from './ui/controller.js'

export const name = 'dsh-tui'
/** Agent registry, user-question, approval + harness command services the TUI drives. */
export const inject = ['agents', 'userQuestions', 'approval', 'commands', 'agentPresets', 'sessionTitle']

/**
 * Read the last `session/title` event's title from a compressed session log.
 * Returns '' when the file is missing, undecodable, or has no title yet.
 */
/**
 * Latest-wins `session/title` from one durable session log — WITHOUT parsing
 * every line. The log is APPEND-CONCATENATED zstd frames (dsh re-opens a new
 * frame per flush), which rules out `zlib.zstdDecompressSync` (first frame
 * only, then `ZSTD_error_prefix_unknown`) and fzstd (correct but pure-JS at
 * ~2.5MB/s — a 122-session/80MB store took 31s on the main thread). The
 * system zstd CLI streams all frames natively in a SUBPROCESS, keeping the
 * event loop free. Title lines are located by a Buffer needle and only those
 * lines hit `JSON.parse` (a title TEXT containing the needle still gets
 * validated against the event type, so false hits are discarded). A missing
 * zstd binary or corrupt log degrades to "untitled" — the browser still
 * lists the session.
 */
async function readSessionTitle(file: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('zstd', ['-d', '-c', file], { maxBuffer: 1 << 28, encoding: 'buffer' })
    const buf = Buffer.from(stdout)
    const NEEDLE = Buffer.from('"type":"session/title"')
    let title = ''
    let idx = buf.indexOf(NEEDLE)
    while (idx !== -1) {
      const start = buf.lastIndexOf(0x0a, idx) + 1
      let end = buf.indexOf(0x0a, idx)
      if (end === -1) end = buf.length
      try {
        const event = JSON.parse(buf.slice(start, end).toString('utf8')) as { type?: unknown; data?: { title?: unknown } }
        if (event.type === 'session/title' && typeof event.data?.title === 'string' && event.data.title !== '') {
          title = event.data.title
        }
      } catch {
        // Skip a malformed line.
      }
      idx = buf.indexOf(NEEDLE, end)
    }
    return title
  } catch {
    return ''
  }
}

/** dsh-tui plugin configuration. */
export interface Config {
  provider?: string
  model?: string
  cwd?: string
  preset?: string
  sessionId?: string
  /** Explicit session title — pins it (no automatic title generation). */
  name?: string
}

/** Cordis schemastery schema for {@link Config}. */
export const Config: Schema<Config> = Schema.object({
  provider: Schema.string().required(false),
  model: Schema.string().required(false),
  cwd: Schema.string().required(false),
  preset: Schema.string().required(false),
  sessionId: Schema.string().required(false),
  name: Schema.string().required(false),
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
  private defaultPreset: string
  /** Last completed store scan; empty until the first loadSessions lands. */
  private sessionsCache: SessionMeta[] = []
  /** In-flight scan (loadSessions dedupe). */
  private sessionsScan: Promise<SessionMeta[]> | undefined
  /** Last agent-presets roster snapshot (shipped four until the first list). */
  private presetsCache: readonly PresetInfo[] | undefined
  /** Extra system-prompt text appended to every session this TUI composes
   * (from `--append-system-prompt`); registered on the agent-scoped setup ctx
   * so it unwinds with the agent. */
  attachedPrompt: string | undefined
  /** Smart-permission answerer active (risk-graded auto-answer). A UI-side
   * policy layered on workspace-write + ask knobs; never a sandbox value. */
  private smartActive = false
  /** Monotonic id for pending model-facing interactions (approval/question). */
  private interactionSeq = 0
  /** Pending interaction resolvers, keyed by seq (the agent blocks one at a time). */
  private readonly pendingInteractions = new Map<number, { kind: 'approval' | 'question'; resolve: (result: unknown) => void }>()

  constructor(
    private readonly ctx: Context,
    options: CliOptions,
    store: Store<TuiState>,
    initialId: string,
    hooks: ControllerHooks,
    defaultProvider: string,
    defaultModel: string,
    defaultPreset: string,
  ) {
    this.options = options
    this.store = store
    this.hooks = hooks
    this.currentId = { current: initialId }
    this.defaultProvider = defaultProvider
    this.defaultModel = defaultModel
    this.smartActive = loadLastSmart()
    this.defaultPreset = defaultPreset
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

  sessions(): SessionMeta[] {
    // The last completed scan (sync, for completions and browsers). kicked
    // off at App mount and refreshed after each attach — NEVER scan here:
    // even at native speed a cold scan is 100+ log decompressions.
    return this.sessionsCache
  }

  /** Scan the durable store off the render path, deduping in-flight scans.
   * Each file decompresses between an event-loop yield, so the UI keeps
   * painting while the walk progresses. */
  loadSessions(): Promise<SessionMeta[]> {
    if (this.sessionsScan !== undefined) return this.sessionsScan
    this.sessionsScan = scanPersistedSessions()
      .then(results => {
        this.sessionsCache = results
        return results
      })
      .finally(() => {
        this.sessionsScan = undefined
      })
    return this.sessionsScan
  }

  /** Submit one input line: slash command or prompt. */
  async submit(input: string): Promise<boolean> {
    const parsed = parseInput(input)
    if (parsed.kind === 'prompt') {
      // A leading '/' that is NOT a TUI command may be a harness command
      // (/plan, /goal, ...) — route it through the commands registry. A
      // single-word token that resolves to neither is reported; a path
      // (/a/b) stays a prompt.
      const trimmed = input.trim()
      if (trimmed.startsWith('/')) {
        const agent = this.handle?.agent
        if (agent !== undefined) {
          if (this.isHarnessCommand(agent, trimmed)) {
            await this.runHarnessCommand(trimmed)
            return true
          }
          const colon = trimmed.indexOf(' ')
          const token = (colon === -1 ? trimmed.slice(1) : trimmed.slice(1, colon)).toLowerCase()
          if (token !== '' && !token.includes('/')) {
            this.apply({ type: 'error', message: `unknown command /${token} — try /help` })
            return true
          }
        }
      }
      this.submitPrompt(parsed.text)
      return true
    }
    await runCommand(this, parsed.name, parsed.args)
    return true
  }

  /** Resume an existing session id through the official agent factory. */
  async resumeSession(id: string): Promise<void> {
    try {
      const resolved = await this.resolveSessionId(id)
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
    // Remember across restarts (best-effort UI-owned state).
    saveLastModel(option.provider, option.id)
    this.apply({ type: 'context', provider: option.provider, model: option.id })
    this.apply({ type: 'notice', message: `model → ${option.id} (new sessions; /new to start one)` })  }

  /** The session's current effective permission mode (fold of sandbox/mode events). */
  currentPermission(): PermissionMode {
    if (this.smartActive) return 'smart'
    const agent = this.handle?.agent
    if (agent === undefined) return DEFAULT_PERMISSION
    return effectiveSandboxMode(agent.session.events) ?? DEFAULT_PERMISSION
  }

  /** The compose default agent preset. */
  currentPreset(): string {
    return this.defaultPreset
  }

  /** Switch the agent preset used to compose new sessions (applies on /new). */
  async setAgentPreset(preset: string): Promise<void> {
    this.defaultPreset = preset
    // Remember across restarts (best-effort UI-owned state).
    saveLastPreset(preset)
    this.apply({ type: 'notice', message: `preset → ${preset} (new sessions; /new to start one)` })
  }

  /** Live preset roster: shipped + user presets (`~/.dsh/.agent-presets`),
   * re-read by the roster on every call. Falls back to the shipped four when
   * the roster service is unavailable. */
  async listPresets(): Promise<readonly PresetInfo[]> {
    try {
      const roster = await this.ctx.agentPresets?.list()
      if (roster !== undefined && roster.length > 0) {
        this.presetsCache = roster.map(preset => ({ id: preset.id, description: preset.description }))
        return this.presetsCache
      }
    } catch {
      // fail-open: fall back to the shipped list below
    }
    return this.cachedPresets()
  }

  /** Last roster snapshot (sync, for completion data); shipped fallback. */
  cachedPresets(): readonly PresetInfo[] {
    return this.presetsCache ?? SHIPPED_AGENT_PRESETS
  }

  /** Harness-registered commands (plan, goal, compact, …) for `/commands`. */
  async listHarnessCommands(): Promise<Array<{ name: string; description: string }>> {
    const agent = this.handle?.agent
    if (agent === undefined) return []
    try {
      return this.ctx.commands.list(agent).map(descriptor => ({
        name: descriptor.name,
        description: descriptor.description,
      }))
    } catch {
      return []
    }
  }

  /** Switch the permission level: sandbox mode + the matching approval policy. */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    const agent = this.handle?.agent
    if (agent === undefined) return
    // smart = UI answerer policy over workspace-write + ask knobs (the
    // sandbox type has no 'smart'); the other three write through directly.
    this.smartActive = mode === 'smart'
    saveLastSmart(this.smartActive)
    setSandboxMode(agent.session, sandboxModeFor(mode) as SandboxMode)
    this.ctx.approval.setPolicy(agent, approvalPolicyFor(mode))
    this.apply({ type: 'permission', mode })
    this.apply({
      type: 'notice',
      message:
        mode === 'smart'
          ? 'permission → smart（低危自动放行 · 中危确认 · 高危拦截）'
          : `permission → ${permissionLabel(mode)} (${approvalPolicyFor(mode) === 'never' ? '无确认' : 'ask 确认'})`,
    })
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
  async newSession(id?: string): Promise<void> {
    const sessionId = (id ?? `session-${randomPart()}`) as SessionId
    try {
      await this.attach({ sessionId })
      this.apply({ type: 'notice', message: `new session ${String(sessionId)}` })
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
  private async resolveSessionId(input: string): Promise<string> {
    const trimmed = input.trim()
    if (trimmed === '') return trimmed
    const matches = (await this.loadSessions())
      .filter(entry => entry.id.startsWith(trimmed))
      .map(entry => entry.id)
    if (matches.length === 1) return matches[0]!
    if (matches.length > 1) throw new Error(`ambiguous session "${trimmed}" — ${matches.join(', ')}`)
    return trimmed
  }

  /** Enumerate durable session dirs under the shared storage root (newest first). */
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
    // Each agent gets its own scoped approval answerer (agent-scoped listeners
    // only receive their own agent's requests).
    this.registerApprovalAnswerer(handle.agent)
    this.registerSubagentMonitoring(handle.agent)
    this.store.setState(() => initialState(String(sessionId)))
    // Seed the footer with the compose provider/model (the remembered pair
    // on a normal boot; the pre-switch default after /model). Replayed
    // `request/context` events from a resumed session's durable log
    // overwrite this with the session's own route — the session truth wins.
    // Without the seed the footer reads "no-model" until the first turn.
    this.apply({ type: 'context', provider: this.defaultProvider, model: this.defaultModel })
    // Replay the durable log so a resumed session paints its history.
    for (const event of handle.agent.session.events) {
      this.onSessionEvent(handle.agent.session, event)
    }
    // The permission is its own fold (deployment default when no override);
    // `eventsFor` maps `sandbox/mode` too, but set it explicitly so a session
    // with no override still shows the deployment default.
    this.apply({ type: 'permission', mode: this.currentPermission() })
    // Refresh the store cache in the background (the new/resumed session's
    // title lands for the browser + completions).
    void this.loadSessions()
  }

  private async createOrResume(options: { sessionId: SessionId } | { resumeSessionId: SessionId }): Promise<AgentHandle> {
    const agentOptions = { provider: this.defaultProvider, model: this.defaultModel }
    // Compose the agent's scoped world from the selected preset (the agent
    // factory's `setup` is the supported call site): ensure the preset's
    // standing mount, then parent this agent's scope key to it so the mount's
    // tools/prompt/sections cover it. Without a roster nothing happens.
    const setup = async (ctx: Context): Promise<void> => {
      const preset = this.currentPreset()
      await this.ctx.agentPresets!.mount(ctx, preset)
      // The launcher's --append-system-prompt payload: an agent-scoped
      // section after the persona (order 50 < tool guidance 100–199).
      if (this.attachedPrompt !== undefined) {
        ctx.systemPrompt.section({ name: 'session-context', order: 50, text: this.attachedPrompt })
      }
    }
    if ('resumeSessionId' in options) {
      return this.ctx.agents.resume({ resumeSessionId: options.resumeSessionId, setup })
    }
    return this.ctx.agents.create({
      sessionId: options.sessionId,
      meta: { cwd: this.options.cwd, agentPreset: this.currentPreset() },
      agentOptions,
      setup,
    })
  }

  /** Rename the live session (pins the title; automatic generation stops). */
  async renameSession(title: string): Promise<void> {
    const handle = this.handle
    if (handle === undefined) {
      this.apply({ type: 'error', message: 'no live session to rename' })
      return
    }
    try {
      this.ctx.sessionTitle?.rename(handle.agent.session, title)
      // The session/title event echoes through the feed and updates the
      // status bar; the notice confirms the accepted input immediately.
      this.apply({ type: 'notice', message: `name → ${title}` })
    } catch (error) {
      this.apply({ type: 'error', message: errMsg(error) })
    }
  }

  /** The current session title ('' before the first title event). */
  currentTitle(): string {
    return this.store.getState().title
  }

  /** Project an official session event into the store (filtered to the live session). */
  private onSessionEvent(session: Session, event: SessionEvent): void {
    if (session.id !== this.currentId.current) return
    for (const tuiEvent of eventsFor(event as unknown as LocalSessionEvent)) {
      this.store.setState(state => reduce(state, tuiEvent))
    }
  }

  /** Register the durable feed + the UI-side interaction provider; call once. */
  subscribe(): void {
    this.ctx.on('session/event', (session, event) => this.onSessionEvent(session, event))
    this.registerUserQuestionProvider()
  }

  // ── model-facing interactions (approval / user-question) ───────────────────

  /** Answer approval requests for one agent (registered on its scoped ctx). */
  private registerApprovalAnswerer(agent: Agent): void {
    agent.ctx.on('approval/request', async (req: ApprovalRequest) => this.answerApproval(req))
  }

  /** Register the single user-question provider that surfaces `ask_user_question`. */
  private registerUserQuestionProvider(): void {
    this.ctx.userQuestions.registerProvider({
      ask: (request: AskUserQuestionRequest) => this.askQuestion(request),
    })
  }

  /** Surface delegated subagent lifecycle (cordis events, not session events). */
  private registerSubagentMonitoring(agent: Agent): void {
    // The subagent event names/types aren't a direct dep; subscribe loosely.
    const subscribe = (agent.ctx.on.bind(agent.ctx)) as (name: string, handler: (...args: unknown[]) => void) => void
    subscribe('subagent/start', identity => {
      const id = subId(identity)
      if (id === '') return
      this.apply({ type: 'subagent-start', id, label: `subagent(${id})` })
      this.apply({ type: 'notice', message: `subagent → ${id}` })
    })
    subscribe('subagent/end', identity => {
      const id = subId(identity)
      if (id === '') return
      this.apply({ type: 'subagent-end', id })
      this.apply({ type: 'notice', message: `subagent ${id} finished` })
    })
  }

  /** Present an approval prompt and resolve when the user decides. With the
   * smart mode active the risk classifier answers first: low → allow, high →
   * reject with a visible notice, medium → the normal interactive prompt. */
  private async answerApproval(req: ApprovalRequest): Promise<ApprovalOutcome> {
    if (this.smartActive) {
      const risk = classifyToolCall(req.toolName, this.toolArgsFor(req.callId))
      if (risk === 'low') return 'allowed-once'
      if (risk === 'high') {
        const detail = this.toolArgsFor(req.callId)?.slice(0, 160) ?? req.reason ?? ''
        this.apply({ type: 'notice', message: `智能权限拦截高危操作（${req.toolName}）: ${detail}` })
        return 'rejected'
      }
    }
    const seq = ++this.interactionSeq
    this.apply({
      type: 'interaction-open',
      pending: {
        kind: 'approval',
        seq,
        toolName: req.toolName,
        reason: req.reason,
        callId: req.callId,
        args: this.toolArgsFor(req.callId),
      },
    })
    return new Promise<ApprovalOutcome>(resolve => {
      this.pendingInteractions.set(seq, { kind: 'approval', resolve: result => resolve(result as ApprovalOutcome) })
    })
  }

  /** The streamed tool card's arguments for a call id (so the user can preview before approving). */
  private toolArgsFor(callId?: string): string | undefined {
    if (callId === undefined) return undefined
    const item = this.store.getState().items.find(candidate => candidate.kind === 'tool' && candidate.callId === callId)
    return item !== undefined && item.kind === 'tool' && item.args !== '' ? item.args : undefined
  }

  /** Present a user-question prompt and resolve when the user answers. */
  private async askQuestion(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
    const seq = ++this.interactionSeq
    this.apply({
      type: 'interaction-open',
      pending: {
        kind: 'question',
        seq,
        items: request.questions.map(item => ({
          id: item.id,
          question: item.question,
          detail: item.detail,
          header: item.header,
          options: (item.options ?? []).map(option => ({ label: option.label, description: option.description })),
          multiSelect: item.multiSelect ?? false,
          intent: item.intent,
        })),
      },
    })
    return new Promise<AskUserQuestionAnswer>(resolve => {
      this.pendingInteractions.set(seq, { kind: 'question', resolve: result => resolve(result as AskUserQuestionAnswer) })
    })
  }

  /** Resolve the pending interaction with the user's decision (UI → service). */
  resolveInteraction(seq: number, decision: InteractionDecision): boolean {
    const entry = this.pendingInteractions.get(seq)
    if (entry === undefined) return false
    this.pendingInteractions.delete(seq)
    if (entry.kind === 'approval') {
      entry.resolve(decision.kind === 'approval' ? decision.outcome : 'rejected')
    } else {
      entry.resolve(decision.kind === 'question' ? decision.answer : { answers: [] })
    }
    this.apply({ type: 'interaction-close' })
    return true
  }

  /** Cancel the pending interaction (treat as user-declined / aborted). */
  cancelInteraction(seq: number): void {
    const entry = this.pendingInteractions.get(seq)
    if (entry === undefined) return
    this.pendingInteractions.delete(seq)
    entry.resolve(entry.kind === 'approval' ? 'cancelled' : { answers: [] })
    this.apply({ type: 'interaction-close' })
  }

  /** Abort the running agent turn (Esc / Ctrl+C while busy). */
  interrupt(): void {
    const agent = this.handle?.agent
    if (agent === undefined || agent.status !== 'running') return
    agent.cancel({ kind: 'user' })
    this.apply({ type: 'notice', message: '已中断当前回合' })
  }

  /** Submit a plain prompt via the agent. */
  private submitPrompt(text: string): void {
    const trimmed = text.trim()
    if (trimmed === '') return
    const message = createUserMessage({ content: textBlock(trimmed), source: { kind: 'user' } })
    this.handle?.agent.followup(message)
  }

  /** Whether the leading token is a harness-registered command (not a TUI one). */
  private isHarnessCommand(agent: import('./official.js').Agent, line: string): boolean {
    const colon = line.indexOf(' ')
    const token = (colon === -1 ? line.slice(1) : line.slice(1, colon)).toLowerCase()
    return token !== '' && this.ctx.commands.find(agent, token) !== undefined
  }

  /** Run a harness-owned command on the live agent (no model round-trip). */
  private async runHarnessCommand(line: string): Promise<void> {
    const agent = this.handle?.agent
    if (agent === undefined) return
    try {
      const execution = await this.ctx.commands.execute(agent, line, [], new AbortController().signal)
      if (execution === undefined) {
        this.apply({ type: 'error', message: `unknown command ${line.split(/\s+/u)[0]}` })
      }
    } catch (error) {
      this.apply({ type: 'error', message: errMsg(error) })
    }
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

/** Extract a stable id from a subagent event identity (defensive; types minified). */
function subId(identity: unknown): string {
  if (identity === null || typeof identity !== 'object') return ''
  const it = identity as Record<string, unknown>
  if (typeof it.childId === 'string') return it.childId
  if (typeof it.runId === 'string') return it.runId
  if (typeof it.id === 'string') return it.id
  return ''
}

/** Resolve the effective agent preset: plugin config → config file → last-used
 * memory → default. Membership is NOT checked here — a preset id is an opaque
 * string and the roster mount reports unknown ids visibly at session creation. */
function resolveDefaultPreset(config: Config): string {
  return config.preset ?? loadTuiConfigFile().preset ?? loadLastPreset() ?? DEFAULT_AGENT_PRESET
}

/** Build the controller's CliOptions from plugin config → config file → last-used memory → dsh settings. */
function controllerOptions(config: Config): CliOptions {
  const settings = loadDshSettings()
  const cfg = loadTuiConfigFile()
  const modelOptions = settings?.modelOptions ?? []
  // UI-owned memory: the pair the user last switched to (still present in the
  // options — a stale entry never resurrects a removed model). Sits below the
  // explicit env/patch and the config-file pin, above the dsh settings default.
  const memory = loadLastModel()
  const remembered = memory !== null
    && modelOptions.some(option => option.provider === memory.provider && option.id === memory.id)
    ? memory
    : null
  const provider = config.provider ?? cfg.provider ?? remembered?.provider ?? settings?.defaultProvider ?? 'deepseek-official'
  const model = config.model ?? cfg.model ?? remembered?.id ?? settings?.defaultModel ?? 'deepseek-v4-flash'
  return {
    cwd: config.cwd ?? cfg.cwd ?? process.cwd(),
    provider,
    model,
    modelOptions: modelOptions.length > 0 ? modelOptions : [{ provider, id: model, name: model }],
  }
}

/** A non-empty trimmed env string, or undefined. */
function envText(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value !== undefined && value !== '' ? value : undefined
}

/**
 * Cheap existence probe: does a persisted session with this exact id exist?
 * Walks the sessions tree comparing DIRECTORY NAMES only — no log
 * decompression. `sessions()` would also work but fully parses every log for
 * titles (sync zstd + JSON on the main thread), which blocks the event loop
 * for seconds on a 100+ session store — exactly the "stuck on connecting"
 * boot the `--session-id` path used to hit.
 */
function hasPersistedSession(id: string): boolean {
  const root = join(dshHome(), 'sessions')
  const walk = (dir: string, depth: number): boolean => {
    if (depth > 3) return false
    let entries: { name: string; isDirectory(): boolean }[] = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return false
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === id) return existsSync(join(dir, entry.name, 'session.jsonl.zstd'))
      if (entry.name.startsWith('--') && walk(join(dir, entry.name), depth + 1)) return true
    }
    return false
  }
  return walk(root, 0)
}

/**
 * Walk the durable store collecting session metas off the render path.
 * Each log's title extraction runs in a zstd subprocess (see
 * readSessionTitle) and is awaited per file — the event loop stays free to
 * paint while the walk progresses. Replaces the old sync
 * listPersistedSessions, whose fzstd inflate + per-line JSON.parse blocked
 * the UI for ~30s on a 124-session/80MB store.
 */
async function scanPersistedSessions(): Promise<SessionMeta[]> {
  const root = join(dshHome(), 'sessions')
  const files: Array<{ id: string; file: string; birthtimeMs: number; mtimeMs: number }> = []
  const walk = (dir: string, depth: number): void => {
    if (depth > 3) return
    let entries: { name: string; isDirectory(): boolean }[] = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = join(dir, entry.name)
      // `--<cwd-slug>--` are grouping dirs; recurse into them, skip as ids.
      if (entry.name.startsWith('--')) {
        walk(full, depth + 1)
        continue
      }
      try {
        const stat = statSync(full)
        files.push({ id: entry.name, file: join(full, 'session.jsonl.zstd'), birthtimeMs: stat.birthtimeMs, mtimeMs: stat.mtimeMs })
      } catch {
        // Unreadable entry (e.g. a stray file); skip it.
      }
    }
  }
  walk(root, 0)
  const results: SessionMeta[] = []
  for (const entry of files) {
    results.push({
      id: entry.id,
      title: await readSessionTitle(entry.file),
      createdAt: entry.birthtimeMs,
      updatedAt: entry.mtimeMs,
      messageCount: 0,
    })
  }
  return results.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Start the in-process TUI. Creates/resumes an agent, subscribes to session
 * events, renders the App, and resolves when the TUI teardown completes.
 *
 * pi-parity launch bindings (config fields or env, set by the launcher):
 * `sessionId` / `DSH_TUI_SESSION_ID` — resume the id when known, else create
 * with it (external tools can pre-bind the id); `name` / `DSH_TUI_NAME` —
 * pin the session title; `DSH_TUI_APPEND_SYSTEM_PROMPT` — a (`@`-prefixed)
 * file whose text joins every session's system prompt.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const options = controllerOptions(config)
  const requestedId = config.sessionId ?? envText('DSH_TUI_SESSION_ID')
  const requestedName = config.name ?? envText('DSH_TUI_NAME')
  const initialId = requestedId ?? `session-${Date.now().toString(36)}`
  const store = new Store<TuiState>(initialState(initialId))
  const modalRef: { current: ((modal: Modal) => void) | undefined } = { current: undefined }

  let app: { unmount: () => void } | undefined
  let exitResolve: () => void = () => {}
  let promptNotice: string | undefined
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
    resolveDefaultPreset(config),
  )

  // `--append-system-prompt <@path>`: read once up front; an unreadable file
  // only degrades to a notice (the session still boots).
  const promptPath = envText('DSH_TUI_APPEND_SYSTEM_PROMPT')?.replace(/^@/, '')
  if (promptPath !== undefined) {
    try {
      const text = readFileSync(promptPath, 'utf8').trim()
      if (text !== '') controller.attachedPrompt = text
      else controller.attachedPrompt = undefined
    } catch {
      // Deferred: apply notices after the first attach (store not rendering yet).
      controller.attachedPrompt = undefined
      promptNotice = `append-system-prompt: cannot read ${promptPath}`
    }
  }

  /** Root owns modal state and mirrors the setter into the controller hook. */
  function Root(): JSX.Element {
    const [modal, setModal] = useState<Modal>('none')
    modalRef.current = setModal
    return <App controller={controller} modal={modal} setModal={setModal} />
  }

  controller.subscribe()
  app = render(<Root />)

  try {
    if (requestedId !== undefined) {
      // pi `--session-id` semantics: resume the id when it exists, else
      // create with it (external tools can pre-bind the id). The existence
      // probe must stay cheap — see hasPersistedSession.
      if (hasPersistedSession(requestedId)) await controller.resumeSession(requestedId)
      else await controller.newSession(requestedId)
    } else {
      await controller.newSession()
    }
  } catch (error) {
    // The store already carries the disconnected/error state; keep the UI alive.
    void error
  }
  if (requestedName !== undefined) await controller.renameSession(requestedName)
  if (promptNotice !== undefined) controller.apply({ type: 'notice', message: promptNotice })
  return exitPromise
}
