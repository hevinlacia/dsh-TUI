import { parseArgs } from './args.js'
import { helpText, VERSION } from './help.js'
import { runHarnessTask } from './harness.js'
import { runInteractive } from './tui.js'

export async function runCli(argv: readonly string[]): Promise<number> {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      process.stdout.write(helpText())
      return 0
    }
    if (options.version) {
      process.stdout.write(`${VERSION}\n`)
      return 0
    }
    if (options.task !== undefined) {
      const result = await runHarnessTask(options.task, options)
      return result.code
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stderr.write('dsh-tui: no task provided and stdin/stdout are not interactive.\n')
      process.stderr.write('Run `dsh-tui --help` for usage.\n')
      return 2
    }
    return await runInteractive(options)
  } catch (error) {
    process.stderr.write(`dsh-tui: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}
