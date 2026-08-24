#!/usr/bin/env node
import { spawn } from 'node:child_process'

const child = spawn('dsh', ['--profile', 'dsh-tui', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})

child.on('error', error => {
  process.stderr.write(`dsh-tui: failed to launch dsh --profile dsh-tui: ${error.message}\n`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
