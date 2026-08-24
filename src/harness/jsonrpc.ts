/**
 * Newline-delimited JSON-RPC 2.0 over byte streams (official wire).
 *
 * Requests carry `id` + `method`, responses carry `id` + `result`/`error`,
 * notifications carry `method` alone. Malformed lines are ignored; handler
 * failures become error frames. Mirrors `@deepseek-ai/dsh-sdk-protocol`
 * transport semantics: stream ownership stays with the caller.
 * @module dsh-tui/harness/jsonrpc
 */

import { StringDecoder } from 'node:string_decoder'
import type { Readable, Writable } from 'node:stream'

/** A JSON-RPC peer error preserving the wire code. */
export class JsonRpcError extends Error {
  constructor(
    readonly code: number | undefined,
    message: string,
    readonly data?: unknown,
  ) {
    super(message)
    this.name = 'JsonRpcError'
  }
}

/** Frames with an `id` but no handler (duplicate ids) are dropped. */
interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

/**
 * Line-framed JSON-RPC peer over caller-owned streams. Attach with
 * {@link start}; detach with {@link close}. A request with no response and no
 * `onNotification` handler still resolves per the peer.
 */
export class JsonRpcTransport {
  private buffer = ''
  private readonly decoder = new StringDecoder('utf8')
  private readonly pending = new Map<string, Pending>()
  private started = false
  private closed = false
  onNotification: ((method: string, params: Record<string, unknown>) => void) | undefined

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
  ) {}

  /** Start reading frames from the input stream. Idempotent. */
  start(): void {
    if (this.started) return
    this.started = true
    this.input.on('data', this.onData)
    this.input.on('error', this.onInputError)
    this.input.on('end', this.onInputEnd)
  }

  /** Detach listeners and reject pending requests. Safe before start. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.input.off('data', this.onData)
    this.input.off('error', this.onInputError)
    this.input.off('end', this.onInputEnd)
    this.failPending(new Error('JSON-RPC transport closed'))
  }

  /**
   * Send a request and await its response.
   * @param method - the JSON-RPC method name.
   * @param params - the request parameters object.
   * @returns the `result`; rejects with {@link JsonRpcError} on an error frame.
   */
  request(method: string, params?: object): Promise<unknown> {
    const id = `req_${crypto.randomUUID().replaceAll('-', '')}`
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        this.write({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })
      } catch (error) {
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private readonly onData = (chunk: Buffer | string): void => {
    this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk)
    this.drain()
  }

  private readonly onInputError = (error: Error): void => {
    this.failPending(error)
  }

  private readonly onInputEnd = (): void => {
    this.buffer += this.decoder.end()
    this.drain()
    this.failPending(new Error('JSON-RPC input closed'))
  }

  private drain(): void {
    for (;;) {
      const newline = this.buffer.indexOf('\n')
      if (newline < 0) return
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (!line) continue
      this.handleLine(line)
    }
  }

  private handleLine(line: string): void {
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      return // malformed peer lines are ignored
    }
    if (message === null || typeof message !== 'object') return
    const frame = message as { id?: unknown; method?: unknown; result?: unknown; error?: unknown; params?: unknown }
    if (typeof frame.id === 'string') {
      const entry = this.pending.get(frame.id)
      if (entry === undefined) return
      this.pending.delete(frame.id)
      if (frame.error !== undefined) this.resolveError(entry, frame.error)
      else entry.resolve(frame.result)
      return
    }
    if (typeof frame.method === 'string') {
      const params = frame.params !== undefined && isRecord(frame.params) ? frame.params : {}
      this.onNotification?.(frame.method, params)
    }
  }

  private resolveError(entry: Pending, error: unknown): void {
    if (isRecord(error)) {
      const code = typeof error.code === 'number' ? error.code : undefined
      const message = typeof error.message === 'string' ? error.message : 'JSON-RPC error'
      entry.reject(new JsonRpcError(code, message, error.data))
      return
    }
    entry.reject(new JsonRpcError(undefined, 'JSON-RPC error'))
  }

  private failPending(error: Error): void {
    for (const entry of this.pending.values()) entry.reject(error)
    this.pending.clear()
  }

  private write(message: unknown): void {
    this.output.write(`${JSON.stringify(message)}\n`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}