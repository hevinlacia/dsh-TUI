import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import type { CliOptions } from './args.js'
import { interactiveHelpText } from './help.js'
import { runHarnessTask } from './harness.js'
import { Transcript } from './transcript.js'

export async function runInteractive(options: CliOptions): Promise<number> {
  const transcript = new Transcript()
  let profile = options.profile
  const rl = createInterface({ input, output, prompt: promptFor(profile) })

  output.write(banner(profile, options))
  try {
    for (;;) {
      const line = (await rl.question(promptFor(profile))).trim()
      if (line === '') continue
      if (line === '/exit' || line === '/quit') return 0
      if (line === '/help') {
        output.write(`${interactiveHelpText()}\n`)
        continue
      }
      if (line === '/clear') {
        transcript.clear()
        output.write('Transcript cleared.\n')
        continue
      }
      if (line.startsWith('/profile')) {
        const next = line.slice('/profile'.length).trim()
        if (next === '') {
          output.write(`Current profile: ${profile}\n`)
        } else {
          profile = next
          output.write(`Profile changed to: ${profile}\n`)
        }
        continue
      }

      transcript.pushUser(line)
      const task = transcript.buildTask(line, options.history)
      output.write('\n')
      const result = await runHarnessTask(task, { ...options, profile })
      output.write('\n')
      if (result.code !== 0) {
        output.write(`dsh exited with code ${result.code}.\n`)
      }
      transcript.pushAssistant(result.stdout.trim())
    }
  } finally {
    rl.close()
  }
}

function promptFor(profile: string): string {
  return `dsh-tui[${profile}]> `
}

function banner(profile: string, options: CliOptions): string {
  const keyState = process.env.DEEPSEEK_API_KEY === undefined ? 'not set' : 'set'
  const dryRun = options.dryRun ? ' dry-run' : ''
  return `dsh-tui minimal${dryRun}\nprofile: ${profile}\ndsh: ${options.dshBin}\nDEEPSEEK_API_KEY: ${keyState}\nType /help for commands, /exit to quit.\n\n`
}
