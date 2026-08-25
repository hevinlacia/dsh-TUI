#!/usr/bin/env node
/**
 * dsh-tui launcher — boots the IN-PROCESS Cordis plugin via the official dsh
 * profile host plane (the canonical client path).
 *
 * Usage:
 *   dsh-tui                            # boot profile $DSH_TUI_PROFILE ?? 'dsh-tui'
 *   dsh-tui --profile <name>           # boot a specific profile
 *   dsh-tui --dry-run                  # print the boot command, don't run
 *   dsh-tui [task...]                  # pass a one-shot task to the harness
 *
 * The first run auto-creates the profile by installing THIS package into it
 * (`dsh plugin --profile <name> add <this pkg>`), then boots `dsh --profile
 * <name>`. The older JSON-RPC subprocess client is kept at `dsh-tui-standalone`
 * (legacy).
 * @module dsh-tui/bin
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// This package's root (one level above bin/).
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let profile = process.env.DSH_TUI_PROFILE ?? 'dsh-tui'
let dryRun = false
const passthrough = []

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i]
  if (arg === '--dry-run') {
    dryRun = true
  } else if (arg === '--profile') {
    const next = process.argv[i + 1]
    if (next !== undefined && !next.startsWith('-')) {
      profile = next
      i += 1
    }
  } else {
    passthrough.push(arg)
  }
}

/** `~/.dsh/profiles/<name>` */
function profileDir(name) {
  return join(process.env.DSH_HOME ?? join(process.env.HOME, '.dsh'), 'profiles', name)
}

/** Ensure the profile exists and points at THIS package; no-op if it already does. */
function ensureProfile(name) {
  const pkgJsonPath = join(profileDir(name), 'package.json')
  if (existsSync(pkgJsonPath)) {
    try {
      const dep = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).dependencies?.['dsh-tui']
      if (typeof dep === 'string' && dep.includes(pkgRoot)) return // already THIS package
    } catch {
      // Fall through and re-point.
    }
  }
  spawnSync('dsh', ['plugin', '--profile', name, 'add', pkgRoot], { stdio: 'inherit' })
}

const bootArgs = ['--profile', profile, ...passthrough]

if (dryRun) {
  process.stdout.write(`spawn dsh ${bootArgs.join(' ')} (in-process plugin: ${pkgRoot})\n`)
  process.exit(0)
}

ensureProfile(profile)

const child = spawn('dsh', bootArgs, { stdio: 'inherit', env: process.env })
child.on('error', error => {
  console.error(`dsh-tui: failed to start dsh — ${error.message}`)
  process.exit(1)
})
child.on('exit', code => process.exit(code ?? 0))
