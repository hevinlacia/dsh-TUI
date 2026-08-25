/**
 * CLI + environment configuration with explicit, validated defaults. The
 * selectable models come from dsh's own settings document (`$DSH_HOME/
 * settings.yaml`, default `~/.dsh/settings.yaml`) — the same
 * `llm-pi-ai.providers` the runtime reads — so the picker stays in lockstep
 * with what the runtime can actually route to. Env vars win over settings.
 * @module dsh-tui/config
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

/** One selectable model with the provider that owns it. */
export interface ModelOption {
  /** Provider route id, e.g. `llm-provider-router` (key in `llm-pi-ai.providers`). */
  provider: string
  /** Model id passed to the runtime, e.g. `high-model-auto`. */
  id: string
  /** Human-friendly model name (falls back to id). */
  name: string
}

/** Providers + default model derived from dsh's settings document. */
export interface DshSettings {
  defaultProvider: string
  defaultModel: string
  modelOptions: ModelOption[]
}

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
  /** Provider route; `DSH_TUI_PROVIDER` wins, else the settings default. */
  provider: string
  /** Model for new sessions; `DSH_TUI_MODEL` wins, else the settings default. */
  model: string
  /** The models a user can switch between (provider-qualified). */
  modelOptions: ModelOption[]
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
  const model = resolveModel(configModel())
  return {
    task: positional.length > 0 ? positional.join(' ') : undefined,
    replay,
    dryRun,
    cwd: resolve(cwdOverride ?? process.env.DSH_TUI_CWD ?? process.cwd()),
    jsonrpcBin: process.env.DSH_TUI_JSONRPC_BIN ?? jsonrpcBin,
    cordis: process.env.DSH_TUI_CORDIS ?? cordis,
    provider: model.provider,
    model: model.model,
    modelOptions: model.modelOptions,
    projectRoot,
  }
}

/** Resolve provider/model/modelOptions from env (wins) → dsh settings → fallback. */
function resolveModel(env: {
  provider: string | undefined
  model: string | undefined
  modelIds: string[]
}): { provider: string; model: string; modelOptions: ModelOption[] } {
  const dsh = loadDshSettings()
  const fallback: ModelOption[] = [
    { provider: 'deepseek-official', id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  ]
  const base = dsh?.modelOptions ?? fallback
  const provider = env.provider ?? dsh?.defaultProvider ?? base[0]?.provider ?? 'deepseek-official'
  const model = env.model ?? dsh?.defaultModel ?? base[0]?.id ?? 'deepseek-v4-flash'
  const modelOptions = env.modelIds.length > 0
    ? env.modelIds.map(id => ({ provider: env.provider ?? provider, id, name: id }))
    : base
  return { provider, model, modelOptions }
}

/** Read the model/provider portion of dsh's settings document. */
export function loadDshSettings(): DshSettings | null {
  const path = join(dshHome(), 'settings.yaml')
  try {
    const raw = readFileSync(path, 'utf8')
    const doc = parse(raw) as Record<string, unknown>
    const llm = (doc['llm-pi-ai'] ?? {}) as Record<string, unknown>
    const providers = (llm['providers'] ?? {}) as Record<string, unknown>
    const modelOptions: ModelOption[] = []
    for (const [providerId, providerVal] of Object.entries(providers)) {
      const provider = (providerVal ?? {}) as Record<string, unknown>
      const models = Array.isArray(provider['models']) ? provider['models'] : []
      for (const modelVal of models) {
        const model = (modelVal ?? {}) as Record<string, unknown>
        const id = typeof model['id'] === 'string' ? model['id'] : ''
        if (id === '') continue
        const name = typeof model['name'] === 'string' && model['name'] !== '' ? model['name'] : id
        modelOptions.push({ provider: providerId, id, name })
      }
    }
    if (modelOptions.length === 0) return null
    const def = (doc['agent-default-model'] ?? {}) as Record<string, unknown>
    const defaultProvider = typeof def['provider'] === 'string' ? def['provider'] : modelOptions[0]!.provider
    const defaultModel = typeof def['model'] === 'string' ? def['model'] : modelOptions[0]!.id
    return { defaultProvider, defaultModel, modelOptions }
  } catch {
    return null
  }
}

/** `$DSH_HOME` (default `~/.dsh`) — the DeepSeek Harness home the runtime reads. */
export function dshHome(): string {
  return process.env.DSH_HOME ?? `${homedir()}/.dsh`
}

/** Model env overrides (provider + model + ids) — all optional. */
function configModel(): { provider: string | undefined; model: string | undefined; modelIds: string[] } {
  return {
    provider: process.env.DSH_TUI_PROVIDER,
    model: process.env.DSH_TUI_MODEL,
    modelIds: csv(process.env.DSH_TUI_MODELS),
  }
}

/** `~/.local/share/dsh-tui` — UI-owned state (session registry). */
export function dataHome(): string {
  const base = process.env.XDG_DATA_HOME ?? `${homedir()}/.local/share`
  return `${base}/dsh-tui`
}

/**
 * Stable runtime session-log root passed to the composition via env.
 * Unified on the shared dsh session store (`$DSH_HOME/sessions`, default
 * `~/.dsh/sessions`) so the standalone JSON-RPC client and the in-process
 * plugin (and dsh web) list + resume the SAME sessions (#3 — de-fragment
 * dual-mode storage).
 */
export function sessionRootOverride(): string {
  return `${dshHome()}/sessions`
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
