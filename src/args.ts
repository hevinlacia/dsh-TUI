export interface CliOptions {
  profile: string
  dshBin: string
  cwd: string
  history: boolean
  dryRun: boolean
  help: boolean
  version: boolean
  task: string | undefined
}

export const DEFAULT_PROFILE = 'headless'

export function parseArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): CliOptions {
  const positionals: string[] = []
  const options: CliOptions = {
    profile: env.DSH_TUI_PROFILE?.trim() || DEFAULT_PROFILE,
    dshBin: env.DSH_TUI_DSH_BIN?.trim() || 'dsh',
    cwd: process.cwd(),
    history: true,
    dryRun: false,
    help: false,
    version: false,
    task: undefined,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === undefined) continue
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (arg === '-h' || arg === '--help') {
      options.help = true
      continue
    }
    if (arg === '-v' || arg === '--version') {
      options.version = true
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--no-history') {
      options.history = false
      continue
    }
    if (arg === '--profile') {
      options.profile = requireValue(argv, i, arg)
      i += 1
      continue
    }
    if (arg.startsWith('--profile=')) {
      options.profile = valueAfterEquals(arg, '--profile')
      continue
    }
    if (arg === '--dsh') {
      options.dshBin = requireValue(argv, i, arg)
      i += 1
      continue
    }
    if (arg.startsWith('--dsh=')) {
      options.dshBin = valueAfterEquals(arg, '--dsh')
      continue
    }
    if (arg === '--cwd') {
      options.cwd = requireValue(argv, i, arg)
      i += 1
      continue
    }
    if (arg.startsWith('--cwd=')) {
      options.cwd = valueAfterEquals(arg, '--cwd')
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    }
    positionals.push(arg)
  }

  const task = positionals.join(' ').trim()
  options.task = task === '' ? undefined : task
  options.profile = requireNonBlank(options.profile, 'profile')
  options.dshBin = requireNonBlank(options.dshBin, 'dsh executable')
  options.cwd = requireNonBlank(options.cwd, 'cwd')
  return options
}

function requireValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (value === undefined || value.trim() === '') throw new Error(`${flag} requires a value`)
  return value
}

function valueAfterEquals(arg: string, flag: string): string {
  const value = arg.slice(flag.length + 1)
  if (value.trim() === '') throw new Error(`${flag} requires a value`)
  return value
}

function requireNonBlank(value: string, label: string): string {
  if (value.trim() === '') throw new Error(`${label} must not be blank`)
  return value
}
