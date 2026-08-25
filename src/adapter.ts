/**
 * The official `@deepseek-ai/*` adapter boundary.
 *
 * ALL imports of official DeepSeek Harness packages belong in this file (or a
 * `src/adapter/` folder). The UI layer — `src/ui/*`, `src/controller.ts`,
 * `src/channel.ts`, hooks and screens — reaches official types and services
 * only through this facade, so the TUI stays decoupled from the harness's
 * domain ownership (agent/model/tool/session/persistence/policy stay with the
 * runtime).
 *
 * The client currently speaks the SDK JSON-RPC wire (`@deepseek-ai/
 * dsh-sdk-jsonrpc-server` via a spawned subprocess) and reads
 * `$DSH_HOME/settings.yaml` itself; `src/` imports no official package today.
 * This module is the single, intentional seam: any future official import goes
 * here (and its friends), never in UI code. See AGENTS.md → Adapter boundary.
 * @module dsh-tui/adapter
 */

/** The official packages the client consumes (by contract), at one version line. */
export const adapterContract = {
  /** The coherent runtime version line (see AGENTS.md / package.json). */
  versionLine: '0.1.1-rc.2',
  /** Official packages the runtime composes and the client relies on. */
  runtimePackages: [
    '@deepseek-ai/dsh-sdk-jsonrpc-server',
    '@deepseek-ai/dsh-agent-spine-demo',
    '@deepseek-ai/dsh-llm-deepseek',
    '@deepseek-ai/dsh-llm-pi-ai',
    '@deepseek-ai/dsh-settings-file',
    '@deepseek-ai/dsh-credentials-local',
    '@deepseek-ai/dsh-subprocess-local',
    '@deepseek-ai/dsh-bash-local',
    '@deepseek-ai/dsh-fs-local',
    '@deepseek-ai/dsh-fs-observation-policy',
    '@deepseek-ai/dsh-tool-fs',
    '@deepseek-ai/dsh-tool-str-replace-editor',
    '@deepseek-ai/dsh-tool-todo',
    '@deepseek-ai/dsh-subagent',
    '@deepseek-ai/dsh-subagent-spawn-in-process',
    '@deepseek-ai/dsh-subagent-fork-in-process',
    '@deepseek-ai/dsh-tool-subagent',
    '@deepseek-ai/dsh-user-questions',
    '@deepseek-ai/dsh-user-approval',
    '@deepseek-ai/dsh-commands',
    '@deepseek-ai/dsh-plan-mode',
    '@deepseek-ai/dsh-command-goal',
    '@deepseek-ai/dsh-session-persistence-jsonl',
    '@deepseek-ai/dsh-session-query',
    '@deepseek-ai/dsh-session-checkpoint-policy',
    '@deepseek-ai/dsh-token-meter',
    '@deepseek-ai/dsh-compaction-basic',
  ],
} as const

export type AdapterContract = typeof adapterContract
