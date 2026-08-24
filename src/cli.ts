/**
 * CLI entry: argument parsing and mode dispatch.
 *
 * Modes:
 *   interactive         no positional task    → Ink TUI
 *   one-shot            positional task given → run once, print the reply
 *   keyless replay      `--replay <jsonl>`    → deterministic text render
 *   dry-run             `--dry-run [task]`    → print the spawn command
 * @module dsh-tui/cli
 */

import { CliUsageError, parseOptions } from './config.js'
import { runReplay } from './replay.js'

const VERSION = '0.2.0'

const HELP = `dsh-tui — DeepSeek Harness terminal UI

Usage:
  dsh-tui [task] [options]

Modes:
  dsh-tui                     interactive TUI
  dsh-tui "one-shot task"     run once, print the reply
  dsh-tui --replay file.jsonl keyless replay of a notification fixture

Options:
  --jsonrpc-bin <path>  runtime bin (DSH_TUI_JSONRPC_BIN wins)
  --cordis <path>       runtime composition (DSH_TUI_CORDIS wins)
  --cwd <dir>           session workspace (DSH_TUI_CWD)
  --replay <file>       replay a session-event JSONL (no runtime)
  --dry-run             print the spawn command and exit
  -h, --help            show this help
  -v, --version         show the version

Env:
  DSH_TUI_PROVIDER      provider route (default deepseek-official)
  DSH_TUI_MODEL         model for new sessions
  DSH_TUI_MODELS        comma-separated switchable models
  DSH_TUI_CORDIS        runtime composition path
  DSH_TUI_JSONRPC_BIN   runtime executable

Commands inside the TUI:
  /help /status /context /new /resume [id] /sessions /model [name] /clear /exit
`

/** Process entry point. */
export async function main(): Promise<void> {
  let options
  try {
    options = parseOptions(process.argv.slice(2))
  } catch (error) {
    if (error instanceof CliUsageError) {
      if (error.kind === 'help') {
        process.stdout.write(HELP)
        process.exit(0)
      }
      if (error.kind === 'version') {
        process.stdout.write(`dsh-tui ${VERSION}\n`)
        process.exit(0)
      }
      process.stderr.write(`dsh-tui: ${error.message}\n\n${HELP}`)
      process.exit(2)
    }
    throw error
  }

  if (options.replay !== undefined) {
    try {
      process.stdout.write(`${runReplay(options.replay)}\n`)
      process.exit(0)
    } catch (error) {
      process.stderr.write(`dsh-tui: replay failed: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exit(2)
    }
  }

  const { runInteractive } = await import('./index.js')
  const { runOneShot } = await import('./oneshot.js')
  if (options.task !== undefined) {
    const code = await runOneShot(options)
    process.exit(code)
  }
  const code = await runInteractive(options)
  process.exit(code)
}

main().catch(error => {
  process.stderr.write(`dsh-tui: fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exit(1)
})