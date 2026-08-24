import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const bin = new URL('../bin/dsh-tui.js', import.meta.url)
const lib = new URL('../lib/cli.js', import.meta.url)

if (!existsSync(lib)) {
  throw new Error('lib/cli.js does not exist; run pnpm build before smoke')
}

function run(args) {
  const result = spawnSync(process.execPath, [bin.pathname, ...args], { encoding: 'utf8' })
  if (result.error) throw result.error
  return result
}

const help = run(['--help'])
if (help.status !== 0 || !help.stdout.includes('Usage:') || !help.stdout.includes('--profile')) {
  throw new Error(`help smoke failed\nstdout=${help.stdout}\nstderr=${help.stderr}`)
}

const dry = run(['--dry-run', '--profile', 'headless', 'hello world'])
if (dry.status !== 0 || !dry.stdout.trim().startsWith("dsh --profile headless")) {
  throw new Error(`dry-run smoke failed\nstdout=${dry.stdout}\nstderr=${dry.stderr}`)
}

const noTty = run([])
if (noTty.status !== 2 || !noTty.stderr.includes('no task provided')) {
  throw new Error(`non-tty smoke failed\nstatus=${noTty.status}\nstdout=${noTty.stdout}\nstderr=${noTty.stderr}`)
}

console.log('smoke ok')
