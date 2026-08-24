#!/usr/bin/env node
/**
 * Keyless smoke test. Runs against the built lib/ (run `pnpm build` first).
 *
 * Covers, without any model call:
 *   1. command parsing (/help → command, plain → prompt)
 *   2. command + file completion (I1)
 *   3. reducer + replay rendering of the rich fixture: tool cards (A1),
 *      thinking markers (A2), assistant/user messages (R2), status (R4)
 *   4. reducer + replay of the real error-path capture (graceful failure)
 *   5. `--dry-run` prints the spawn command
 *
 * Exit code 0 on pass, 1 on any mismatch. Assertions are marker based so the
 * smoke stays stable as rendering details evolve.
 */

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(root, 'bin/dsh-tui.js')
const fixture = name => join(root, 'fixtures', name)
let failures = 0

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.error(`  FAIL ${label}${detail !== '' ? ` — ${detail}` : ''}`)
  }
}

console.log('dsh-tui smoke')

// 1. command parsing
{
  const { parseInput, lookupCommand } = await import(join(root, 'lib/commands.js'))
  const parsed = parseInput('/help')
  check('parseInput("/help") is a command', parsed.kind === 'command' && parsed.name === 'help')
  check('lookupCommand("help") exists', lookupCommand('help')?.name === 'help')
  check('parseInput("hello") is a prompt', parseInput('hello').kind === 'prompt')
}

// 2. completion (I1)
{
  const { complete, commonPrefix } = await import(join(root, 'lib/completion.js'))
  const commandResult = complete('/he', root)
  check('command completion /he → /help', commandResult.completed === '/help', commandResult.completed)
  check('command completion hint empty for unique', commandResult.hint === '')
  const pathInput = 'src/'
  const pathResult = complete(pathInput, root)
  check('path completion finds candidates', pathResult.candidates.length > 0, `got ${pathResult.candidates.length}`)
  check('path completion completes the token', pathResult.completed.startsWith('src/'))
  check('commonPrefix(["abc","abd"]) === "ab"', commonPrefix(['abc', 'abd']) === 'ab')
}

// 3. rich fixture replay (R2/A1/A2/R4)
{
  const { runReplay } = await import(join(root, 'lib/replay.js'))
  const text = runReplay(fixture('sample-conversation.jsonl'))
  check('replay shows status+phase', /connected · idle · model deepseek-v4-flash · turn 2 step 1/.test(text) || /turn 2/.test(text), 'status line')
  check('replay shows user message', text.includes('user: List the repository files'))
  check('replay shows assistant text', text.includes('assistant: Here is the layout'))
  check('replay marks thinking (A2)', text.includes('# thinking'))
  check('replay shows tool card ok (A1)', text.includes('tool[ok] bash') && text.includes('output:'), text.slice(0, 600))
  check('replay shows tool args', text.includes('ls -la'))
  check('two assistant messages rendered', (text.match(/assistant:/g) ?? []).length === 2)
}

// 4. error-path capture replay (graceful failure)
{
  const { runReplay } = await import(join(root, 'lib/replay.js'))
  const text = runReplay(fixture('sample-session-error.jsonl'))
  check('error capture replays without throwing', text.length > 0)
  check('error capture surfaces failure', /error/i.test(text), 'expected an error marker')
}

// 5. dry-run prints the spawn command
{
  const result = spawnSync(process.execPath, [bin, '--dry-run', 'hello'], { encoding: 'utf8' })
  check('dry-run exits 0', result.status === 0, `status ${result.status}`)
  check('dry-run prints spawn', /^spawn /m.test(result.stdout), result.stdout)
}

process.exitCode = failures === 0 ? 0 : 1
console.log(failures === 0 ? 'smoke PASS' : `smoke FAIL (${failures})`)