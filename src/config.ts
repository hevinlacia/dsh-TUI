/**
 * Plugin configuration resolution. The selectable models come from dsh's own
 * settings document (`$DSH_HOME/settings.yaml`, default `~/.dsh/settings.yaml`)
 * — the same `llm-pi-ai.providers` the runtime reads — so the picker stays in
 * lockstep with what the runtime can actually route to. Env vars and the
 * plugin config (`cordis.patch.yml`) win over the dsh-tui config file.
 * @module dsh-tui/config
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
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

/** The resolved options the plugin controller carries. */
export interface CliOptions {
  /** Workspace cwd recorded on sessions and used by bash/fs rows. */
  cwd: string
  /** Provider route; `DSH_TUI_PROVIDER` wins, else the settings default. */
  provider: string
  /** Model for new sessions; `DSH_TUI_MODEL` wins, else the settings default. */
  model: string
  /** The models a user can switch between (provider-qualified). */
  modelOptions: ModelOption[]
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

/** dsh-tui's own config-file fields (NOT dsh's `settings.yaml`). */
export interface TuiConfigFile {
  provider?: string
  model?: string
  cwd?: string
  preset?: string
}

/** The default config-file path; `DSH_TUI_CONFIG` overrides it. */
export function tuiConfigPath(): string {
  if (process.env.DSH_TUI_CONFIG !== undefined && process.env.DSH_TUI_CONFIG !== '') {
    return join(process.env.DSH_TUI_CONFIG)
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(configHome, 'dsh-tui', 'config.yaml')
}

/**
 * Read dsh-tui's default config file (missing/invalid → empty object). It sits
 * between explicit (env/patch/flag) and the dsh settings default in the
 * resolve chain, so a user can set provider/model/cwd once without repeating
 * them on every invocation.
 */
export function loadTuiConfigFile(): TuiConfigFile {
  try {
    const raw = readFileSync(tuiConfigPath(), 'utf8')
    const doc = parse(raw) as Record<string, unknown>
    return {
      provider: typeof doc['provider'] === 'string' ? doc['provider'] : undefined,
      model: typeof doc['model'] === 'string' ? doc['model'] : undefined,
      cwd: typeof doc['cwd'] === 'string' ? doc['cwd'] : undefined,
      preset: typeof doc['preset'] === 'string' ? doc['preset'] : undefined,
    }
  } catch {
    return {}
  }
}
