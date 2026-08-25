/**
 * Slash-command vocabulary and input parsing. Pure; execution lives in the
 * session controller so commands can touch the store and the runtime.
 * @module dsh-tui/commands
 */

import type { CliOptions } from './config.js'

/** One registered command's contract. */
export interface CommandSpec {
  name: string
  usage: string
  description: string
  /** Commands that need a live runtime to make sense. */
  needsRuntime?: boolean
  /** When set, confirming the command opens a second-level option submenu. */
  submenu?: 'models'
}

/** The phase-1 command set. */
export const COMMANDS: readonly CommandSpec[] = [
  { name: 'help', usage: '/help', description: 'list commands' },
  { name: 'clear', usage: '/clear', description: 'clear the chat view' },
  { name: 'status', usage: '/status', description: 'show session/connection/model info' },
  { name: 'context', usage: '/context', description: 'show turns, steps, todos, last usage' },
  { name: 'new', usage: '/new', description: 'start a fresh session' },
  { name: 'resume', usage: '/resume [id]', description: 'resume a session (opens browser without id)' },
  { name: 'sessions', usage: '/sessions', description: 'browse and resume past sessions' },
  { name: 'model', usage: '/model [name]', description: 'show or switch the model for new sessions', submenu: 'models' },
  { name: 'exit', usage: '/exit', description: 'quit dsh-tui' },
]

const BY_NAME: ReadonlyMap<string, CommandSpec> = new Map(COMMANDS.map(command => [command.name, command]))

/** Parse the input line: a slash command or a user prompt. */
export function parseInput(input: string): { kind: 'command'; name: string; args: string } | { kind: 'prompt'; text: string } {
  const trimmed = input.trim()
  if (trimmed.startsWith('/')) {
    const [rawName, ...rest] = trimmed.slice(1).split(/\s+/u)
    const name = (rawName ?? '').toLowerCase()
    if (name !== '') return { kind: 'command', name, args: rest.join(' ').trim() }
  }
  return { kind: 'prompt', text: trimmed }
}

/** Look up a command spec (also resolves strict prefixes, e.g. `/new`). */
export function lookupCommand(name: string): CommandSpec | undefined {
  return BY_NAME.get(name)
}

/** Command names to use for completion. */
export function commandNames(): string[] {
  return COMMANDS.map(command => command.name)
}

/** The full model id list a user can switch to. */
export function modelList(options: CliOptions): string[] {
  return options.modelOptions.map(option => option.id)
}