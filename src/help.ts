import { DEFAULT_PROFILE } from './args.js'

export const VERSION = '0.1.0'

export function helpText(): string {
  return `dsh-tui ${VERSION}

Independent minimal terminal UI for DeepSeek Harness.

Usage:
  dsh-tui [options] [task...]

Options:
  --profile <name>   Harness profile to run (default: ${DEFAULT_PROFILE})
  --dsh <path>       dsh executable (default: dsh)
  --cwd <path>       Child process working directory (default: current directory)
  --no-history       Do not prepend previous turns to follow-up tasks
  --dry-run          Print the dsh command instead of executing it
  -h, --help         Show this help
  -v, --version      Show version

Interactive commands:
  /help              Show commands
  /clear             Clear in-memory transcript
  /profile <name>    Change Harness profile for later turns
  /exit              Quit

Examples:
  dsh-tui
  dsh-tui "reply with the word ok"
  dsh-tui --profile headless "summarize this repository"
`
}

export function interactiveHelpText(): string {
  return `Commands:
  /help              Show this help
  /clear             Clear in-memory transcript
  /profile <name>    Change Harness profile
  /exit              Quit

Type any other text to send it to DeepSeek Harness.`
}
