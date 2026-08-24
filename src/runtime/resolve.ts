/**
 * Runtime executable + composition resolution.
 *
 * Resolution order keeps dsh-tui independent of a local harness checkout:
 *   1. explicit `--jsonrpc-bin` / `DSH_TUI_JSONRPC_BIN`
 *   2. this project's installed `dsh-jsonrpc-agent` bin
 *   3. the local DeepSeek Harness checkout's built demo bin (dev convenience,
 *      documented; removed once published packages are the only route)
 * Composition resolution: `--cordis` / `DSH_TUI_CORDIS` → bundled
 * `runtime/cordis.yml` in this project.
 * @module dsh-tui/runtime/resolve
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'node:path'
import type { RuntimeLaunch } from '../harness/client.js'

/** A found runtime launch plus the resolved config path (for `--dry-run`). */
export interface ResolvedRuntime {
  launch: RuntimeLaunch
  configPath: string
  /** Human description used by `--dry-run`. */
  describe: string
}

const HARNESS_CLONE = join(homedir(), 'Developer/github/deepseek-harness')

/** Resolve the runtime bin and composition for a run. */
export function resolveRuntime(options: {
  projectRoot: string
  jsonrpcBin: string | undefined
  cordis: string | undefined
}): ResolvedRuntime {
  const configPath = options.cordis ?? join(options.projectRoot, 'runtime/cordis.yml')

  const explicit = options.jsonrpcBin
  if (explicit !== undefined) {
    return wrap(explicit, [], configPath, `explicit bin ${explicit}`)
  }

  const localBin = join(options.projectRoot, 'node_modules/.bin/dsh-jsonrpc-agent')
  if (existsSync(localBin)) {
    // The shim is executable; spawn directly (args = config path).
    return wrap(localBin, [configPath], configPath, 'installed dsh-jsonrpc-agent')
  }

  const cloneBin = join(HARNESS_CLONE, 'packages/examples/jsonrpc-demo/lib/bin.js')
  if (existsSync(cloneBin)) {
    return wrap(process.execPath, [cloneBin, configPath], configPath, `local harness clone ${HARNESS_CLONE}`)
  }

  return wrap('dsh-jsonrpc-agent', [configPath], configPath, 'dsh-jsonrpc-agent on PATH')
}

function wrap(command: string, args: string[], configPath: string, describe: string): ResolvedRuntime {
  // Child cwd anchors .env loading and node resolution; bare plugin names in
  // the composition still resolve against the config directory per the Loader.
  const childCwd = parse(configPath).dir
  return { launch: { command, args, cwd: childCwd }, configPath, describe }
}