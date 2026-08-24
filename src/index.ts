import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { streamTurn } from './animation.js'

export const name = 'dsh-tui'
export const inject = ['agentDefaultModel', 'agents', 'sessions']

interface DshTuiArgs {
  help: boolean
  sessionId: string | undefined
  resumeSessionId: string | undefined
  contextPath: string | undefined
  task: string | undefined
}

interface Context {
  get(name: string): unknown
}

interface AgentSession {
  id: string
  seq: number
  events: SessionEvent[]
}

interface Agent {
  id: string
  session: AgentSession
  whenIdle(): Promise<void>
  followup(message: unknown): void
}

interface AgentHandle {
  agent: Agent
  dispose(): Promise<void>
}

interface SessionEvent {
  seq: number
  type: string
  data: Record<string, unknown>
}

interface TurnEndReason {
  kind: string
  error?: { code: string; message: string }
}

interface DshTuiServices {
  agents: {
    create(options: Record<string, unknown>): Promise<AgentHandle>
    resume(options: Record<string, unknown>): Promise<AgentHandle>
  }
  agentDefaultModel: { currentSelection(): { provider: string; model: string } }
  sessions: { flush(session: AgentSession): Promise<void> }
}

interface RunOutcome {
  text: string
  reason: TurnEndReason | undefined
}

export function apply(ctx: Context): void {
  void run(ctx).catch((error: unknown) => {
    process.stderr.write(`dsh-tui: ${error instanceof Error ? error.message : String(error)}\n`)
    requestExit(ctx, 1)
  })
}

async function run(ctx: Context): Promise<void> {
  await maybeAwaitLoader(ctx)
  const args = parseDshTuiArgs(readCmdlineArgs(ctx), process.env)
  if (args.help) {
    output.write(helpText())
    requestExit(ctx, 0)
    return
  }

  const services = readServices(ctx)
  const handle = await openAgent(services, args)
  try {
    const contextText = await readContextText(args.contextPath)
    if (args.task !== undefined) {
      const code = await submitAndPrint(services, handle.agent, args.task, contextText)
      requestExit(ctx, code)
      return
    }
    if (!input.isTTY || !output.isTTY) {
      process.stderr.write('dsh-tui: no task provided and stdin/stdout are not interactive.\n')
      requestExit(ctx, 2)
      return
    }
    const code = await interactiveLoop(services, handle.agent, contextText)
    requestExit(ctx, code)
  } finally {
    await services.sessions.flush(handle.agent.session).catch(() => undefined)
    await handle.dispose().catch((error: unknown) => {
      process.stderr.write(`dsh-tui: dispose failed: ${error instanceof Error ? error.message : String(error)}\n`)
    })
  }
}

async function maybeAwaitLoader(ctx: Context): Promise<void> {
  const loader = ctx.get('loader') as { await(): Promise<void> } | undefined
  await loader?.await()
}

function readCmdlineArgs(ctx: Context): readonly string[] {
  const cmdlineArgs = ctx.get('cmdlineArgs') as { get(): readonly string[] } | undefined
  return cmdlineArgs?.get() ?? []
}

function readServices(ctx: Context): DshTuiServices {
  const agents = ctx.get('agents') as DshTuiServices['agents'] | undefined
  const agentDefaultModel = ctx.get('agentDefaultModel') as DshTuiServices['agentDefaultModel'] | undefined
  const sessions = ctx.get('sessions') as DshTuiServices['sessions'] | undefined
  if (agents === undefined) throw new Error('missing ctx.agents')
  if (agentDefaultModel === undefined) throw new Error('missing ctx.agentDefaultModel')
  if (sessions === undefined) throw new Error('missing ctx.sessions')
  return { agents, agentDefaultModel, sessions }
}

async function openAgent(services: DshTuiServices, args: DshTuiArgs): Promise<AgentHandle> {
  const selection = services.agentDefaultModel.currentSelection()
  const agentOptions = { provider: selection.provider, model: selection.model }
  const requested = args.resumeSessionId ?? args.sessionId
  if (requested !== undefined) {
    const id = normalizeSessionId(requested)
    try {
      return await services.agents.resume({ resumeSessionId: id, agentOptions })
    } catch (error) {
      if (args.resumeSessionId !== undefined && args.sessionId === undefined) throw error
      return services.agents.create({ sessionId: id, meta: { cwd: process.cwd() }, agentOptions })
    }
  }
  return services.agents.create({ sessionId: randomUUID(), meta: { cwd: process.cwd() }, agentOptions })
}

function normalizeSessionId(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') throw new Error('session id must not be blank')
  return trimmed.startsWith('session-') ? trimmed.slice('session-'.length) : trimmed
}

function parseDshTuiArgs(argv: readonly string[], env: NodeJS.ProcessEnv): DshTuiArgs {
  const positionals: string[] = []
  const args: DshTuiArgs = {
    help: false,
    sessionId: clean(env.DSH_TUI_SESSION_ID),
    resumeSessionId: clean(env.DSH_TUI_RESUME_SESSION),
    contextPath: clean(env.DSH_TUI_CONTEXT),
    task: undefined,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === undefined) continue
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (arg === '-h' || arg === '--help') {
      args.help = true
      continue
    }
    if (arg === '--session-id') {
      args.sessionId = requireValue(argv, i, arg)
      i += 1
      continue
    }
    if (arg.startsWith('--session-id=')) {
      args.sessionId = valueAfterEquals(arg, '--session-id')
      continue
    }
    if (arg === '--resume') {
      args.resumeSessionId = requireValue(argv, i, arg)
      i += 1
      continue
    }
    if (arg.startsWith('--resume=')) {
      args.resumeSessionId = valueAfterEquals(arg, '--resume')
      continue
    }
    if (arg === '--context') {
      args.contextPath = requireValue(argv, i, arg)
      i += 1
      continue
    }
    if (arg.startsWith('--context=')) {
      args.contextPath = valueAfterEquals(arg, '--context')
      continue
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
    positionals.push(arg)
  }
  const task = positionals.join(' ').trim()
  args.task = task === '' ? undefined : task
  return args
}

async function interactiveLoop(services: DshTuiServices, agent: Agent, contextText: string | undefined): Promise<number> {
  const rl = createInterface({ input, output })
  let pendingContext = contextText
  output.write(banner(agent.id))
  try {
    for (;;) {
      const line = (await rl.question(`dsh-tui[${agent.id}]> `)).trim()
      if (line === '') continue
      if (line === '/exit' || line === '/quit') return 0
      if (line === '/help') {
        output.write(interactiveHelpText())
        continue
      }
      const code = await submitAndPrint(services, agent, line, pendingContext)
      pendingContext = undefined
      if (code !== 0) output.write(`dsh-tui: turn exited with code ${code}.\n`)
    }
  } finally {
    rl.close()
  }
}

async function submitAndPrint(
  services: DshTuiServices,
  agent: Agent,
  text: string,
  contextText: string | undefined,
): Promise<number> {
  await agent.whenIdle()
  const firstSeq = agent.session.seq
  agent.followup(createUserMessage(withContext(text, contextText)))
  // Stream the turn live (spinner + streaming text) while the agent works;
  // the session log grows between polls, so streamTurn returns the text it
  // already rendered interactively. On a TTY that text is on screen, so the
  // final summary below only prints what streaming did not cover.
  const streamed = await streamTurn(
    () => agent.session.events,
    firstSeq,
    output.isTTY === true,
    agent.whenIdle(),
  )
  await services.sessions.flush(agent.session)
  const outcome = summarize(agent.session.events, firstSeq)
  if (streamed === '' && outcome.text.trim() !== '') {
    output.write(`${outcome.text.trim()}\n`)
  }
  if (outcome.reason?.kind === 'error') {
    const error = outcome.reason.error
    process.stderr.write(`dsh-tui: ${error?.code ?? 'ERROR'}: ${error?.message ?? 'unknown error'}\n`)
  }
  return outcome.reason?.kind === 'completed' ? 0 : 1
}

function withContext(text: string, contextText: string | undefined): string {
  if (contextText === undefined || contextText.trim() === '') return text
  return `Use this requirement context for the session.\n\n${contextText.trim()}\n\nUser request:\n${text}`
}

async function readContextText(path: string | undefined): Promise<string | undefined> {
  if (path === undefined) return undefined
  return readFile(path, 'utf8')
}

function summarize(events: readonly SessionEvent[], firstSeq: number): RunOutcome {
  let started = false
  let text = ''
  let reason: TurnEndReason | undefined
  for (const event of events) {
    if (event.seq < firstSeq) continue
    if (event.type === 'turn/start') {
      started = true
      continue
    }
    if (!started) continue
    if (event.type === 'assistant/message') {
      const message = event.data.message as { content?: Array<{ type?: string; text?: string }> } | undefined
      const joined = message?.content
        ?.filter(block => block.type === 'text')
        .map(block => block.text ?? '')
        .join('') ?? ''
      if (joined !== '') text = joined
    }
    if (event.type === 'turn/end') reason = event.data.reason as TurnEndReason | undefined
  }
  return { text, reason }
}

function createUserMessage(text: string): unknown {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }
}

function requestExit(ctx: Context, code: number): void {
  const appExit = ctx.get('appExit') as ((exitCode: number) => void) | undefined
  if (appExit === undefined) {
    process.exitCode = code
    return
  }
  appExit(code)
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

function requireValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (value === undefined || value.trim() === '') throw new Error(`${flag} requires a value`)
  return value
}

function valueAfterEquals(arg: string, flag: string): string {
  const value = arg.slice(flag.length + 1)
  if (value.trim() === '') throw new Error(`${flag} requires a value`)
  return value
}

function helpText(): string {
  return `dsh-tui profile front door\n\nUsage:\n  dsh --profile dsh-tui [options] [task...]\n\nOptions:\n  --session-id <id>  Create with this id when the session does not exist\n  --resume <id>      Resume an existing persisted DSH session\n  --context <path>   Add file content to the first user turn\n  -h, --help         Show this help\n\nEnvironment:\n  DSH_TUI_SESSION_ID=<id>       Same as --session-id\n  DSH_TUI_RESUME_SESSION=<id>   Same as --resume\n  DSH_TUI_CONTEXT=<path>        Same as --context\n\nExamples:\n  DSH_TUI_SESSION_ID=<uuid> DSH_TUI_CONTEXT=/tmp/ctx.md dsh --profile dsh-tui\n  DSH_TUI_RESUME_SESSION=<uuid> dsh --profile dsh-tui\n`
}

function interactiveHelpText(): string {
  return `Commands:\n  /help   Show this help\n  /exit   Quit\n\nType any other text to send it to the current DSH session.\n`
}

function banner(sessionId: string): string {
  const keyState = process.env.DEEPSEEK_API_KEY === undefined ? 'not set' : 'set'
  return `dsh-tui profile\nsession: ${sessionId}\nDEEPSEEK_API_KEY: ${keyState}\nType /help for commands, /exit to quit.\n\n`
}
