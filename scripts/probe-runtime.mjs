#!/usr/bin/env node
/**
 * Protocol probe for the DeepSeek Harness SDK JSON-RPC runtime.
 *
 * Spawns the official dsh-jsonrpc-agent subprocess, performs an `initialize`
 * handshake, submits one real prompt, and records every server notification
 * as newline-delimited JSON. Uses a real model call, so it needs
 * DEEPSEEK_API_KEY. The captured notification stream doubles as fixture data
 * for the keyless `--replay` smoke path.
 *
 * Usage:
 *   node scripts/probe-runtime.mjs [harnessRepo] [outFile]
 *
 * Defaults:
 *   harnessRepo = ~/Developer/github/deepseek-harness
 *   outFile     = fixtures/sample-session.jsonl
 */

import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { createWriteStream } from 'node:fs'
import { randomUUID } from 'node:crypto'

const harnessRepo = resolve(process.argv[2] ?? `${homedir()}/Developer/github/deepseek-harness`)
const outFile = resolve(process.argv[3] ?? 'fixtures/sample-session.jsonl')
const runtimeBin = `${harnessRepo}/packages/examples/jsonrpc-demo/lib/bin.js`
const runtimeConfig = `${harnessRepo}/examples/jsonrpc-agent/cordis.yml`
const sessionId = `probe-${Date.now().toString(36)}`
const prompt =
  'Run `ls` in the bash tool and reply with the first few directory names. Keep the reply to one short sentence.'

console.error(`[probe] session=${sessionId}`)
console.error(`[probe] runtime=${runtimeBin}`)
console.error(`[probe] config=${runtimeConfig}`)

// The runtime loads its own .env via app-boot's loadEnv (cwd = harness repo),
// so the key never crosses this script's source; absence surfaces as a failed turn.
const child = spawn(process.execPath, [runtimeBin, runtimeConfig], {
  cwd: harnessRepo,
  env: {
    ...process.env,
    DSH_SESSION_ROOT: resolve('tmp/probe-sessions'),
    DSH_CWD: harnessRepo,
  },
  stdio: ['pipe', 'pipe', 'inherit'],
})

/** Newline-delimited JSON-RPC client, minimal on purpose (mirrors the official wire). */
class LineRpc {
  constructor(stream) {
    this.stream = stream
    this.buffer = ''
    this.pending = new Map()
    this.onNotification = () => {}
    stream.stdout.on('data', (chunk) => {
      this.buffer += chunk
      this.drain()
    })
  }

  drain() {
    let nl = this.buffer.indexOf('\n')
    while (nl >= 0) {
      const line = this.buffer.slice(0, nl).trim()
      this.buffer = this.buffer.slice(nl + 1)
      if (line) this.frame(JSON.parse(line))
      nl = this.buffer.indexOf('\n')
    }
  }

  frame(message) {
    if (typeof message.id === 'string' || typeof message.id === 'number') {
      const entry = this.pending.get(message.id)
      if (!entry) return
      this.pending.delete(message.id)
      if (message.error !== undefined) entry.reject(new Error(`rpc ${message.error.code}: ${message.error.message}`))
      else entry.resolve(message.result)
      return
    }
    this.onNotification(message)
  }

  request(method, params) {
    const id = `req_${randomUUID().replaceAll('-', '')}`
    return new Promise((resolveResult, reject) => {
      this.pending.set(id, { resolve: resolveResult, reject })
      this.stream.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  }
}

const rpc = new LineRpc(child)
const out = createWriteStream(outFile)
let notifications = 0
let turnEnds = 0
let toolCalls = 0

rpc.onNotification = (message) => {
  notifications += 1
  const line = JSON.stringify(message)
  out.write(`${line}\n`)
  if (message.method === 'session.event') {
    const type = message.params?.event?.type
    console.error(`[probe] event ${type}`)
    if (type === 'tool/call') toolCalls += 1
    if (type === 'turn/end') {
      turnEnds += 1
      console.error(`[probe] turn ended: ${message.params.event.data?.reason}`)
    }
  } else {
    console.error(`[probe] notify ${message.method}`)
  }
}

const deadline = setTimeout(() => {
  console.error('[probe] TIMEOUT waiting for turn/end')
  void shutdown(1)
}, 180_000)

async function shutdown(code) {
  clearTimeout(deadline)
  out.end()
  try {
    await rpc.request('shutdown', {})
  } catch (error) {
    console.error(`[probe] shutdown error: ${error.message}`)
  }
  child.stdin.write('')
  await new Promise((resolveEnd) => child.on('exit', resolveEnd))
  process.exit(code)
}

try {
  const init = await rpc.request('initialize', {
    cwd: harnessRepo,
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
  })
  console.error(`[probe] initialize -> ${JSON.stringify(init)}`)
  const accepted = await rpc.request('session/prompt', {
    sessionId,
    contentBlocks: [{ type: 'text', text: prompt }],
  })
  console.error(`[probe] prompt accepted -> ${JSON.stringify(accepted)}`)
  await new Promise((resolveWait) => { void (function poll() { if (turnEnds > 0 || notifications === 0) resolveWait(); else setTimeout(poll, 250) })() })
  await new Promise((resolveWait) => setTimeout(resolveWait, 3000))
  console.error(`[probe] done: ${notifications} notifications, ${toolCalls} tool calls`)
  await shutdown(0)
} catch (error) {
  console.error(`[probe] failed: ${error.stack ?? error}`)
  await shutdown(2)
}