/**
 * CLI + environment configuration with explicit, validated defaults.
 * @module dsh-tui/config
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Parsed command-line options. */
export interface CliOptions {
  /** One-shot task (no interactive render). */
  task: string | undefined
  /** Keyless replay of a notification JSONL; prints a plain-text render. */
  replay: string | undefined
  /** Print the spawn command instead of executing. */
  dryRun: boolean
  /** Workspace cwd recorded on sessions and used by bash/fs rows. */
  cwd: string
  /** Runtime bin override (`DSH_TUI_JSONRPC_BIN` wins). */
  jsonrpcBin: string | undefined
  /** Runtime composition override (`DSH_TUI_CORDIS` wins). */
  cordis: string | undefined
  /** Provider route; `DSH_TUI_PROVIDER` wins. */
  provider: string
  /** Model for new sessions; `DSH_TUI_MODEL` wins. */
  model: string
  /** Selectable models for the switch command. */
  models: string[]
  /** Default project root: this repo (bare-name resolution anchors). */
  projectRoot: string
}

/** Parse argv into {@link CliOptions} with documented defaults. */
export function parseOptions(argv: string[]): CliOptions {
  const projectRoot = resolve(join(import.meta.dirname, '..'))
  const positional: string[] = []
  let replay: string | undefined
  let dryRun = false
  let jsonrpcBin: string | undefined
  let cordis: string | undefined
  let cwdOverride: string | undefined
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    const next = () => argv[i + 1]
    switch (arg) {
      case '--replay':
        replay = next()
        i += 1
        break
      case '--dry-run':
        dryRun = true
        break
      case '--jsonrpc-bin':
        jsonrpcBin = next()
        i += 1
        break
      case '--cordis':
        cordis = next()
        i += 1
        break
      case '--cwd':
        cwdOverride = next()
        i += 1
        break
      case '--help':
      case '-h':
        throw new CliUsageError('help')
      case '--version':
      case '-v':
        throw new CliUsageError('version')
      default:
        if (arg.startsWith('-')) throw new CliUsageError(`unknown option: ${arg}`)
        positional.push(arg)
    }
  }
  const envModels = csv(process.env.DSH_TUI_MODELS)
  const models = envModels.length > 0 ? envModels : ['deepseek-v4-flash']
  return {
    task: positional.length > 0 ? positional.join(' ') : undefined,
    replay,
    dryRun,
    cwd: resolve(cwdOverride ?? process.env.DSH_TUI_CWD ?? process.cwd()),
    jsonrpcBin: process.env.DSH_TUI_JSONRPC_BIN ?? jsonrpcBin,
    cordis: process.env.DSH_TUI_CORDIS ?? cordis,
    provider: process.env.DSH_TUI_PROVIDER ?? 'deepseek-official',
    model: process.env.DSH_TUI_MODEL ?? models[0] ?? 'deepseek-v4-flash',
    models,
    projectRoot,
  }
}

/** `~/.local/share/dsh-tui` — UI-owned state (session registry). */
export function dataHome(): string {
  const base = process.env.XDG_DATA_HOME ?? `${homedir()}/.local/share`
  return `${base}/dsh-tui`
}

/** Stable runtime session-log root passed to the composition via env. */
export function sessionRootOverride(): string {
  return `${dataHome()}/runtime-sessions`
}

/** `~/.local/share/dsh-tui/sessions.json` registry path. */
export function registryPath(): string {
  return `${dataHome()}/sessions.json`
}

/** Parse a comma-separated env list, trimming empties. */
function csv(value: string | undefined): string[] {
  if (value === undefined || value === '') return []
  return value.split(',').map(part => part.trim()).filter(part => part !== '')
}

/** Signal for `--help`/`--version` handled by the entry point. */
export class CliUsageError extends Error {
  /** 'help' | 'version' | message. */
  constructor(readonly kind: string) {
    super(kind)
    this.name = 'CliUsageError'
  }
}