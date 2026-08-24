import { spawn } from 'node:child_process'
import { shellQuote } from './shell.js'

export interface HarnessRunOptions {
  dshBin: string
  profile: string
  cwd: string
  dryRun: boolean
}

export interface HarnessRunResult {
  code: number
  stdout: string
  stderr: string
  command: string
}

export async function runHarnessTask(task: string, options: HarnessRunOptions): Promise<HarnessRunResult> {
  const args = ['--profile', options.profile, task]
  const command = shellQuote([options.dshBin, ...args])
  if (options.dryRun) {
    process.stdout.write(`${command}\n`)
    return { code: 0, stdout: '', stderr: '', command }
  }

  return new Promise<HarnessRunResult>((resolve, reject) => {
    const child = spawn(options.dshBin, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    const onSigint = (): void => {
      child.kill('SIGINT')
    }

    process.once('SIGINT', onSigint)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      process.stderr.write(chunk)
    })
    child.on('error', error => {
      process.removeListener('SIGINT', onSigint)
      reject(error)
    })
    child.on('close', code => {
      process.removeListener('SIGINT', onSigint)
      resolve({ code: code ?? 1, stdout, stderr, command })
    })
  })
}
