/**
 * Pure completion engine for the input box — pi-style. Three contexts, one
 * result shape:
 *
 * 1. slash command   `/mo`            → fuzzy-filtered command rows (pi
 *                                       fuzzy scoring, trailing-space apply)
 * 2. argument        `/model deep`    → second-level candidates for commands
 *                                       that take a choice (models /
 *                                       permissions / presets / session ids)
 * 3. file path       `src/comp`       → workspace-relative path completion
 *
 * Synchronous by design (completion latency must be imperceptible); the
 * argument data is injected so the engine stays pure and the session walk
 * stays lazy.
 * @module dsh-tui/completion
 */

import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, sep } from 'node:path'
import { commandNames, lookupCommand } from './commands.js'
import { fuzzyFilter } from './fuzzy.js'

/** One selectable row in the completion dropdown, plus its apply target. */
export interface CompletionItem {
  /** Dropdown display text (e.g. `/help`, `router · high-model-auto`, `src/`). */
  label: string
  /** Optional trailing meta column (description, "(current)"). */
  meta?: string
  /** The canonical text this row matches on (command name / arg value / path entry). */
  value: string
  /** The full input line after applying this item. */
  line: string
  /** Caret position in `line` after applying. */
  cursor: number
}

/** An injectable argument candidate for `/command <arg>` completion. */
export interface ArgumentCandidate {
  /** Dropdown display text. */
  label: string
  /** Optional description column. */
  meta?: string
  /** Text inserted as the argument value. */
  value: string
}

/** Injectable data for argument completion. All optional. */
export interface CompletionData {
  models?: ArgumentCandidate[]
  permissions?: ArgumentCandidate[]
  presets?: ArgumentCandidate[]
  /** Lazy on purpose: walking the session store per keystroke is too costly. */
  sessions?: () => ArgumentCandidate[]
}

/** Which completion context produced a result. */
export type CompletionKind = 'command' | 'argument' | 'path'

/** The completion result for one input line. */
export interface CompletionResult {
  /** Rows for the dropdown (may be empty). */
  items: CompletionItem[]
  /** The token the items were matched against (drives initial highlight). */
  query: string
  /** Legacy Tab fallback: full line from the longest common prefix across items. */
  completed: string
  /** Legacy display labels (the items' labels, in order). */
  candidates: string[]
  /** Optional trailing hint (e.g. "N commands") for non-menu UIs. */
  hint: string
  /** Which context produced this result. */
  kind: CompletionKind
}

/** Command name → CompletionData key for argument completion. */
const ARG_DATA_KEYS: Record<string, 'models' | 'permissions' | 'presets' | 'sessions'> = {
  model: 'models',
  permission: 'permissions',
  preset: 'presets',
  resume: 'sessions',
}

/** Whether the input is an in-progress slash command (no space typed yet). */
export function isCommandInput(input: string): boolean {
  const trimmed = input.trim()
  return trimmed.startsWith('/') && !trimmed.includes(' ')
}

/** Complete an input line against commands, their arguments, and the filesystem. */
export function complete(input: string, cwd: string, data?: CompletionData): CompletionResult {
  if (input.startsWith('/') && !input.includes('\n')) {
    // A space switches from command-name completion to argument completion
    // (note: NOT based on isCommandInput, which trims — `/model ` with its
    // trailing space must reach the argument path).
    if (input.includes(' ')) return completeArgument(input, data)
    return completeCommand(input)
  }
  return completePath(input, cwd)
}

/** Context 1 — fuzzy command rows; apply fills `/name ` (trailing space, pi style). */
function completeCommand(input: string): CompletionResult {
  const query = input.slice(1)
  const matched = fuzzyFilter(commandNames(), query, name => name)
  const items: CompletionItem[] = matched.map(name => {
    const line = `/${name} `
    return {
      label: `/${name}`,
      meta: lookupCommand(name)?.description,
      value: name,
      line,
      cursor: line.length,
    }
  })
  const spell = matched.length === 1 ? matched[0] ?? '' : commonPrefix(matched)
  return {
    items,
    query,
    completed: matched.length === 0 ? input : `/${spell}`,
    candidates: items.map(item => item.label),
    hint: matched.length > 1 ? `${matched.length} commands` : '',
    kind: 'command',
  }
}

/** Context 2 — argument candidates after `/cmd `. */
function completeArgument(input: string, data?: CompletionData): CompletionResult {
  const nameEnd = input.indexOf(' ')
  const name = input.slice(1, nameEnd).toLowerCase()
  const query = input.slice((input.lastIndexOf(' ') ?? -1) + 1)
  const none: CompletionResult = { items: [], query, completed: input, candidates: [], hint: '', kind: 'argument' }
  if (data === undefined) return none
  const key = ARG_DATA_KEYS[name]
  if (key === undefined) return none

  let pool: ArgumentCandidate[]
  if (key === 'sessions') {
    if (data.sessions === undefined) return none
    pool = data.sessions()
  } else {
    pool = data[key] ?? []
  }

  const head = `/${name} `
  const matched = fuzzyFilter(pool, query, candidate => `${candidate.value} ${candidate.label}`)
  const items: CompletionItem[] = matched.map(candidate => {
    const line = `${head}${candidate.value}`
    return { label: candidate.label, meta: candidate.meta, value: candidate.value, line, cursor: line.length }
  })
  const common = commonPrefix(matched.map(candidate => candidate.value))
  return {
    items,
    query,
    completed: matched.length === 0 ? input : `${head}${common}`,
    candidates: items.map(item => item.label),
    hint: matched.length > 1 ? `${matched.length} options` : '',
    kind: 'argument',
  }
}

function completePath(input: string, cwd: string): CompletionResult {
  // The active token is the last whitespace-delimited one; only complete when
  // it looks path-like or is empty after a space.
  const tokens = input.split(/\s+/u)
  const token = tokens.at(-1) ?? ''
  const lastIsPath =
    token.startsWith('.') || token.startsWith('/') || token.startsWith('~') || token.includes('/')
  if (!lastIsPath) return { items: [], query: token, completed: input, candidates: [], hint: '', kind: 'path' }

  const base = resolveBase(token, cwd)
  // A bare `~`, `.`, or `..` lists its target directory (no basename filter).
  const listing = token === '~' || token === '.' || token === '..'
  const dir = token.endsWith(sep) || listing ? base : dirname(base)
  const prefix = token.endsWith(sep) || listing ? '' : basenameOf(base)
  const entries = safeReaddir(dir)
  if (entries === undefined) return { items: [], query: token, completed: input, candidates: [], hint: '', kind: 'path' }

  const chosen: string[] = []
  for (const entry of entries) {
    if (prefix !== '' && !entry.startsWith(prefix)) continue
    const full = join(dir, entry)
    chosen.push(safeIsDir(full) ? `${entry}${sep}` : entry)
  }
  chosen.sort()
  if (chosen.length === 0) return { items: [], query: token, completed: input, candidates: [], hint: '', kind: 'path' }

  // Keep the user's TYPED directory text so relative tokens complete to
  // relative paths (`./` stays `./entry`, `src/` stays `src/entry`); only
  // resolved forms render absolute. Bare `~`/`.`/`..` normalize to `~/` etc.
  const typedDir = token === '~' ? '~/' : token === '.' ? './' : token === '..' ? '../' : dirPrefix(token)
  const head = input.slice(0, input.length - token.length)
  const common = commonPrefix(chosen)
  const completed = common === '' ? input : `${head}${typedDir}${common}`
  const items: CompletionItem[] = chosen.map(entry => {
    const line = `${head}${typedDir}${entry}`
    // `value` carries the full replacement token text so exact/prefix
    // highlight matching works against what the user typed.
    return { label: entry, value: `${typedDir}${entry}`, line, cursor: line.length }
  })
  return {
    items,
    query: token,
    completed,
    candidates: chosen,
    hint: chosen.length > 1 ? `${chosen.length} files` : '',
    kind: 'path',
  }
}

/** The textual prefix of the token up to (and including) its last separator. */
function dirPrefix(token: string): string {
  const idx = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'))
  return idx >= 0 ? token.slice(0, idx + 1) : ''
}

function resolveBase(token: string, cwd: string): string {
  if (token.startsWith('~')) return join(homedir(), token.slice(1))
  if (isAbsolute(token)) return token
  return join(cwd, token)
}

function basenameOf(path: string): string {
  const parts = path.split(/[\\/]/u)
  return parts.at(-1) ?? ''
}

function safeReaddir(dir: string): string[] | undefined {
  try {
    return readdirSync(dir)
  } catch {
    return undefined
  }
}

function safeIsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Longest common prefix across non-empty strings. */
export function commonPrefix(values: string[]): string {
  if (values.length === 0) return ''
  let prefix = values[0] ?? ''
  for (const value of values.slice(1)) {
    let i = 0
    while (i < prefix.length && i < value.length && prefix[i] === value[i]) i += 1
    prefix = prefix.slice(0, i)
    if (prefix === '') break
  }
  return prefix
}
