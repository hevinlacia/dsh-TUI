/**
 * Smart-permission risk classifier — the decision core of the `smart`
 * permission mode. Pure module, no official imports, fully table-driven so
 * the smoke suite can pin behavior.
 *
 * Grading (what `answerApproval` does with it):
 * - `low`    read-only commands → auto-approve, no prompt
 * - `medium` writes / mutations / UNKNOWN → interactive confirm
 * - `high`   irreversible or system-wide destruction → auto-DENY + notice
 *
 * Design rules:
 * - The whole command is split on shell separators (`&&` `||` `;` `|` and
 *   newlines) and the risk is the MAX over segments — one dangerous stage
 *   poisons the whole pipeline.
 * - Unknown commands grade `medium` (fail-safe: ask, never silently allow).
 * - `sudo`/`doas`/`su` escalation lifts a segment to at least `medium`.
 * @module dsh-tui/smartPermission
 */

export type Risk = 'low' | 'medium' | 'high'

/** First tokens that are pure reads (whole command grades low). */
const LOW_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'find', 'fd', 'tree', 'stat', 'file', 'wc', 'diff',
  'which', 'whereis', 'whoami', 'id', 'groups', 'pwd', 'echo', 'printf', 'date', 'uname', 'uptime',
  'hostname', 'env', 'printenv', 'ps', 'df', 'du', 'free', 'lscpu', 'lsblk', 'ip', 'ss', 'netstat',
  'ping', 'getent', 'sort', 'uniq', 'cut', 'column', 'jq', 'yq', 'man', 'tldr', 'basename', 'dirname',
  'realpath', 'readlink', 'xxd', 'md5sum', 'sha256sum', 'sha1sum', 'cksum', 'tput', 'true', 'false',
  'test', 'sleep', 'seq', 'bc', 'rev', 'nl', 'tac', 'zcat', 'less', 'more', 'git', 'node', 'python', 'python3',
])

/** git subcommands that only read. */
const LOW_GIT_SUBCOMMANDS = new Set([
  'status', 'log', 'diff', 'show', 'branch', 'blame', 'remote', 'rev-parse', 'describe', 'ls-files',
  'ls-remote', 'shortlog', 'reflog', 'tag',
])

/** Tokens that mutate state → at least medium. */
const MEDIUM_COMMANDS = new Set([
  'mkdir', 'rmdir', 'touch', 'cp', 'mv', 'rm', 'ln', 'chmod', 'chown', 'chgrp', 'tee', 'truncate',
  'sed', 'awk', 'patch', 'install', 'zip', 'unzip', 'tar', 'gzip', 'gunzip', 'xz', 'zstd', 'kill',
  'pkill', 'killall', 'npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'uv', 'cargo', 'go', 'gem',
  'composer', 'mvn', 'gradle', 'make', 'cmake', 'docker', 'podman', 'kubectl', 'systemctl', 'service',
  'mount', 'umount', 'curl', 'wget', 'ssh', 'scp', 'rsync', 'nc', 'ssh-keygen', 'systeminfo',
])

/** Whole-segment regexes that grade HIGH (irreversible / system-wide). */
const HIGH_PATTERNS: RegExp[] = [
  /(^|\s)(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/,
  /(^|\s)(mkfs(\.\w+)?|fdisk|cfdisk|parted|wipefs|blockdev)\b/,
  /(^|\s)dd\b[^|]*\bof=\/dev\//,
  /(^|\s):(\/?)\{\s*:\|\s*:&\s*\};/, // fork bomb
  /(^|\s)chmod\s+(-R\s+)?777\s+\/(\s|$)/,
  /\bmv\b[^|]*\s\/(\s|$)/, // mv into filesystem root
  /(^|\s)rm\b[^|]*\s(-[a-zA-Z]*[rf][a-zA-Z]*\s+)*\/(\*|\s|$)/, // rm -rf /
  /(^|\s)rm\b[^|]*-[a-zA-Z]*[rf][a-zA-Z]*[^|]*\s(~|\$HOME|\/etc|\/usr|\/var|\/boot|\/dev|\/proc|\/sys)(\/|\s|$)/,
  /(^|\s)rm\b[^|]*-[a-zA-Z]*[rf][a-zA-Z]*[^|]*\s\.\.(\s|\/|$)/, // rm -rf .. — deleting the parent
  /(^|\s)(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/, // curl … | sh
  /(^|\s)git\s+push\b[^|]*(--force|-f)\b/, // force-push rewrites shared history
  /(^|\s)git\s+push\b[^|]*--delete\b/,
  />\s*\/dev\/(sd|nvme|hd)/, // raw device overwrite
]

/** Whole-command regexes that span separators — tested against the RAW line
 * (segmentRisk never sees `|` because segments() splits on it). */
const HIGH_PIPE_PATTERNS: RegExp[] = [
  /(^|\s)(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/, // curl … | sh — remote code exec
]

/** Segment-leading tokens that escalate privilege (base risk ≥ medium). */
const ESCALATORS = new Set(['sudo', 'doas', 'su'])

/** Strip one leading env-assignment run (FOO=bar BAZ=qux cmd …). */
function stripEnvAssignments(segment: string): string {
  const tokens = segment.trim().split(/\s+/u)
  let i = 0
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[i] ?? '')) i += 1
  return tokens.slice(i).join(' ')
}

/** Risk of ONE pipeline-free segment (leading command decides). */
function segmentRisk(segment: string): Risk {
  const stripped = stripEnvAssignments(segment)
  const tokens = stripped.split(/\s+/u).filter(token => token !== '')
  const head = (tokens[0] ?? '').replace(/^[\s"']+/u, '')
  if (head === '') return 'low' // empty stage
  if (ESCALATORS.has(head)) {
    const rest = tokens.slice(1).join(' ')
    const inner = rest === '' ? 'medium' : segmentRisk(rest)
    return inner === 'low' ? 'medium' : 'high'
  }
  for (const pattern of HIGH_PATTERNS) {
    if (pattern.test(stripped)) return 'high'
  }
  if (head === 'git' && tokens[1] !== undefined) {
    const sub = tokens[1]!
    // git config is repo-local (noise tradeoff); everything else mutates → medium.
    return LOW_GIT_SUBCOMMANDS.has(sub) || sub === 'config' ? 'low' : 'medium'
  }
  if (head === 'node' || head === 'python' || head === 'python3') {
    // Interpreters: -v/--version/-c with a print-only body is unreadable cheaply — ask.
    const rest = tokens.slice(1).join(' ')
    return /^\s*(--version|-(v|V))\b/u.test(rest) ? 'low' : 'medium'
  }
  if (MEDIUM_COMMANDS.has(head)) return 'medium'
  if (LOW_COMMANDS.has(head)) return 'low'
  return 'medium' // unknown → ask (fail-safe)
}

/** Split a shell line into pipeline stages (conservative separator set). */
function segments(command: string): string[] {
  return command.split(/&&|\|\||;|\n|\|/u)
}

/** Classify one bash command line. */
export function classifyCommand(command: string): Risk {
  for (const pattern of HIGH_PIPE_PATTERNS) {
    if (pattern.test(command)) return 'high'
  }
  let risk: Risk = 'low'
  for (const segment of segments(command)) {
    const r = segmentRisk(segment)
    if (r === 'high') return 'high'
    if (r === 'medium') risk = 'medium'
  }
  return risk
}

/**
 * Classify one tool call. `bash`-family tools grade by their command text;
 * web tools are reads → low; workspace file edits grade medium; anything
 * unknown grades medium (fail-safe ask).
 */
export function classifyToolCall(toolName: string, argsJson: string | undefined): Risk {
  const name = toolName.toLowerCase()
  if (name.includes('bash')) {
    let command = argsJson ?? ''
    try {
      const parsed = JSON.parse(argsJson ?? '{}') as { command?: unknown }
      if (typeof parsed.command === 'string') command = parsed.command
    } catch {
      // args are not JSON — fall back to the raw string
    }
    return classifyCommand(command)
  }
  if (name.startsWith('web')) return 'low'
  if (name.includes('fs') || name.includes('edit') || name.includes('str_replace') || name.includes('write')) return 'medium'
  return 'medium'
}
