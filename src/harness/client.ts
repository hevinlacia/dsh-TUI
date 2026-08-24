/**
 * Harness runtime subprocess client.
 *
 * Spawns `dsh-jsonrpc-agent <runtime/cordis.yml>`, speaks the official
 * JSON-RPC wire over stdio, and owns the child's lifecycle (spawn, shutdown
 * exchange, EOF → SIGTERM → SIGKILL reaping). This runs OUTSIDE any harness
 * context — the boundary documented for SDK-managed transports.
 * @module dsh-tui/harness/client
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { sessionRootOverride } from '../config.js'
import { JsonRpcTransport } from './jsonrpc.js'
import type { HarnessNotification, InitializeParams, InitializeResult, SessionPromptResult } from './types.js'

/** Launch spec for the runtime subprocess. */
export interface RuntimeLaunch {
  /** Runtime bin path (`dsh-jsonrpc-agent` or a packaged exe). */
  command: string
  /** Arguments, usually just the cordis config path. */
  args: string[]
  /** Child working directory. */
  cwd: string
}

const STDERR_KEEP = 400

/** The runtime subprocess died or its stdio closed unexpectedly. */
export class RuntimeClosedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuntimeClosedError'
  }
}

/** A `session/prompt` submission was rejected by the server. */
export class PromptRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PromptRejectedError'
  }
}

/**
 * One owned runtime subprocess with a typed JSON-RPC surface and a
 * notification fan-out. Create → {@link start} → use → {@link close}.
 */
export class HarnessClient {
  private child: ChildProcess | undefined
  private transport: JsonRpcTransport | undefined
  private readonly stderrTail: string[] = []
  private exitCode: number | undefined
  private notificationHandler: ((n: HarnessNotification) => void) | undefined
  private closed = false

  constructor(private readonly launch: RuntimeLaunch) {}

  /** Subscribe to every server notification. Single consumer by design. */
  onNotification(handler: (n: HarnessNotification) => void): void {
    this.notificationHandler = handler
  }

  /** Spawn the runtime and start the transport. Idempotent. */
  start(): void {
    if (this.child !== undefined) return
    const child = spawn(this.launch.command, this.launch.args, {
      cwd: this.launch.cwd,
      env: {
        ...process.env,
        // The composition resolves DSH_* env reads; defaults to the formal env.
        DSH_SESSION_ROOT: process.env.DSH_SESSION_ROOT ?? sessionRootOverride(),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    this.transport = new JsonRpcTransport(child.stdout, child.stdin)
    this.transport.onNotification = (method, params) => {
      this.notificationHandler?.({ method, params })
    }
    this.transport.start()
    child.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString('utf8').split(/\n/u)
      this.stderrTail.push(...lines)
      if (this.stderrTail.length > STDERR_KEEP) this.stderrTail.splice(0, this.stderrTail.length - STDERR_KEEP)
    })
    child.on('exit', (code) => {
      this.exitCode = code ?? 0
      this.transport?.close()
      this.transport = undefined
      this.child = undefined
    })
  }

  /** Perform the SDK handshake; rejects when the runtime answers with an error. */
  async initialize(params: InitializeParams): Promise<InitializeResult> {
    const result = await this.request('initialize', params)
    if (typeof result !== 'object' || result === null) throw new Error('initialize returned no server identity')
    return result as InitializeResult
  }

  /** Queue one user prompt on a session; creates/resumes the durable session. */
  async sessionPrompt(sessionId: string, text: string): Promise<SessionPromptResult> {
    const result = await this.request('session/prompt', {
      sessionId,
      contentBlocks: [{ type: 'text', text }],
    })
    if (typeof result !== 'object' || result === null) throw new PromptRejectedError('session/prompt returned no message id')
    return result as SessionPromptResult
  }

  /** Re-initialize with a new model route; applies to subsequently created sessions. */
  async switchModel(model: string, provider: string, cwd: string): Promise<void> {
    await this.initialize({ cwd, provider, model })
  }

  /** Send a raw request; fails loudly when the runtime is gone. */
  private async request(method: string, params: object): Promise<unknown> {
    if (this.transport === undefined) throw new RuntimeClosedError(this.deathMessage())
    try {
      return await this.transport.request(method, params)
    } catch (error) {
      if (error instanceof RuntimeClosedError) throw error
      if (this.transport === undefined) throw new RuntimeClosedError(this.deathMessage())
      throw error
    }
  }

  /** Shut the runtime down to quiescence and reap the child. Idempotent. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const transport = this.transport
    if (transport !== undefined) {
      try {
        await transport.request('shutdown', {})
      } catch (error) {
        // The runtime may already be gone; reaping below handles that.
        void error
      }
      transport.close()
    }
    const child = this.child
    if (child !== undefined) {
      child.stdin?.end()
      // EOF grace, then a termination ladder.
      await waitExit(child, 6000)
      if (this.exitCode === undefined) {
        child.kill('SIGTERM')
        await waitExit(child, 3000)
        if (this.exitCode === undefined) child.kill('SIGKILL')
      }
    }
  }

  /** Descriptive failure for a dead runtime, including the stderr tail. */
  deathMessage(): string {
    const tail = this.stderrTail.slice(-12).join('\n').trim()
    const reason = this.exitCode !== undefined ? `runtime exited (code ${this.exitCode})` : 'runtime stdio closed'
    return tail !== '' ? `${reason}:\n${tail}` : `${reason}`
  }
}

function waitExit(child: ChildProcess, ms: number): Promise<void> {
  return Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ])
}