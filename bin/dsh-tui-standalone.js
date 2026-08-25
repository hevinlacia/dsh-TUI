#!/usr/bin/env node
/**
 * dsh-tui-standalone — the LEGACY JSON-RPC subprocess client. Spawns
 * `dsh-jsonrpc-agent` (a child harness) and talks over JSON-RPC. Kept for
 * reference and the keyless smoke path; the canonical client is the in-process
 * plugin, launched by `dsh-tui`.
 * @module dsh-tui/bin-standalone
 */

import '../lib/cli.js'
