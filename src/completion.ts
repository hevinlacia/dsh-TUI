/**
 * Pure completion engine for the input box: slash-command names and file
 * paths relative to the workspace cwd. Synchronous by design (completion
 * latency must be imperceptible).
 * @module dsh-tui/completion
 */

import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, sep } from 'node:path'
import { commandNames } from './commands.js'

/** The completion result for one input line. */
export interface CompletionResult {
  /** Full replacement line after Tab (longest common prefix across fits). */
  completed: string
  /** Candidate suffixes for the active token (for display). */
  candidates: string[]
  /** Optional trailing hint for the UI (e.g. "N completions"). */
  hint: string
}

/** Whether the input is an in-progress slash command. */
export function isCommandInput(input: string): boolean {
  const trimmed = input.trim()
  return trimmed.startsWith('/') && !trimmed.includes(' ')
}

/** Complete an input line against commands and the filesystem. */
export function complete(input: string, cwd: string): CompletionResult {
  if (isCommandInput(input)) return completeCommand(input)
  return completePath(input, cwd)
}

function completeCommand(input: string): CompletionResult {
  const typed = input.trim().slice(1)
  const names = commandNames().filter(name => name.startsWith(typed))
  if (names.length === 0) return { completed: input, candidates: [], hint: '' }
  const prefix = commonPrefix(names)
  const spell = names.length === 1 ? names[0] ?? '' : prefix
  return {
    completed: `/${spell}`,
    candidates: names,
    hint: names.length > 1 ? `${names.length} commands` : '',
  }
}

function completePath(input: string, cwd: string): CompletionResult {
  // The active token is the last whitespace-delimited one; only complete when
  // it looks path-like or is empty after a space.
  const tokens = input.split(/\s+/u)
  const token = tokens.at(-1) ?? ''
  const lastIsPath =
    token.startsWith('.') || token.startsWith('/') || token.startsWith('~') || token.includes('/')
  if (!lastIsPath) return { completed: input, candidates: [], hint: '' }

  const base = resolveBase(token, cwd)
  const dir = token.endsWith(sep) || token === '' ? base : dirname(base)
  const prefix = token.endsWith(sep) || token === '' ? '' : basenameOf(base)
  const entries = safeReaddir(dir)
  if (entries === undefined) return { completed: input, candidates: [], hint: '' }

  const chosen: string[] = []
  for (const entry of entries) {
    if (prefix !== '' && !entry.startsWith(prefix)) continue
    const full = join(dir, entry)
    chosen.push(safeIsDir(full) ? `${entry}${sep}` : entry)
  }
  chosen.sort()
  if (chosen.length === 0) return { completed: input, candidates: [], hint: '' }

  // Longest common prefix across candidates; keep the typed token when the
  // listing target was a directory itself.
  const common = commonPrefix(chosen)
  const head = input.slice(0, input.length - token.length)
  const typedPrefix = token.endsWith(sep) || token === '' ? token : dirPrefix(token)
  const completed = common === '' ? input : applyCompletion(head, typedPrefix, dir, token, common)
  return {
    completed,
    candidates: chosen,
    hint: chosen.length > 1 ? `${chosen.length} files` : '',
  }
}

/** The textual prefix of the token up to (and including) its last separator. */
function dirPrefix(token: string): string {
  const idx = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'))
  return idx >= 0 ? token.slice(0, idx + 1) : ''
}

function applyCompletion(
  head: string,
  typedPrefix: string,
  dir: string,
  token: string,
  common: string,
): string {
  // Absolute or dot-relative tokens keep their directory text; bare names
  // render as `dir/prefix` relative text (completion UX across a workspace).
  const display = token.startsWith('/') || token.startsWith('.')
    ? `${dir}${sep}${common}`
    : `${typedPrefix}${common}`
  return `${head}${display}`
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