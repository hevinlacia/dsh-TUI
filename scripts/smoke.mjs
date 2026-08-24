import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const bin = new URL('../bin/dsh-tui.js', import.meta.url)
const pluginLib = new URL('../lib/index.js', import.meta.url)

if (!existsSync(pluginLib)) {
  throw new Error('lib/index.js does not exist; run pnpm build before smoke')
}

function run(args) {
  const result = spawnSync(process.execPath, [bin.pathname, ...args], { encoding: 'utf8' })
  if (result.error) throw result.error
  return result
}

const help = run(['--help'])
if (help.status !== 0 || !help.stdout.includes('dsh-tui profile front door') || !help.stdout.includes('--resume')) {
  throw new Error(`profile help smoke failed\nstdout=${help.stdout}\nstderr=${help.stderr}`)
}

const noTty = run([])
if (noTty.status !== 2 || !noTty.stderr.includes('no task provided')) {
  throw new Error(`non-tty profile smoke failed\nstatus=${noTty.status}\nstdout=${noTty.stdout}\nstderr=${noTty.stderr}`)
}

console.log('smoke ok')
