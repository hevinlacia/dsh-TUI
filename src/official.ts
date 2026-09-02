/**
 * The official `@deepseek-ai/*` adapter boundary for the in-process Cordis
 * plugin. UI layer (`src/ui/*`, `src/plugin.tsx` logic) reaches official types
 * only through this module. See AGENTS.md → Adapter boundary.
 * @module dsh-tui/official
 */

import Schema from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentCancelCause } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, MessageId } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type {
  AskUserQuestionAnswer,
  AskUserQuestionRequest,
  UserQuestionProvider,
} from '@deepseek-ai/dsh-user-questions'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { effectiveSandboxMode, setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import type { CommandRuntime } from '@deepseek-ai/dsh-commands'

/**
 * Structural view of the agent-presets roster service (`agentPresets`). The
 * real type lives in `@deepseek-ai/dsh-agent-presets` (a deployment package, not
 * a dev dep of this repo); this minimal shape keeps the plugin typed without
 * pulling that package in. Matches the api-proxy's use:
 * `presets.mount(agentCtx, id)` in the agent factory's `setup`.
 */
export interface AgentPresetsService {
  mount(agentCtx: Context, id?: string): Promise<{ id: string }>
  /** Re-reads the roots on every call: shipped + `$DSH_HOME/.agent-presets`. */
  list(): Promise<Array<{ id: string; name?: string; description?: string }>>
  resolve(id?: string): Promise<{ id: string }>
}

/**
 * Structural view of the log-backed session title service (`sessionTitle`):
 * `rename` appends a `session/title` event with the `user` source, which PINS
 * the title — automatic generation stops for that session (pi's `--name`).
 * The official `dsh-session-title` types are not part of this build's program;
 * this structural shape keeps the plugin typed without adding the dep.
 */
export interface SessionTitleService {
  rename(session: Session, title: string): { title: string }
  get(session: Session): { title: string } | undefined
}

// `systemPrompt` needs no structural re-declaration: the official
// `dsh-system-prompt` package already augments Context with the real,
// non-optional `SystemPrompt` service (its `.section()` is what the setup
// callback uses for the appended prompt).

declare module '@deepseek-ai/cordis' {
  interface Context {
    agentPresets?: AgentPresetsService
    sessionTitle?: SessionTitleService
  }
}

export { Schema, createUserMessage, setSandboxMode, effectiveSandboxMode }
export type {
  Context,
  Agent,
  Session,
  SessionEvent,
  SessionId,
  ContentBlock,
  MessageId,
  ApprovalOutcome,
  ApprovalRequest,
  AgentCancelCause,
  AskUserQuestionAnswer,
  AskUserQuestionRequest,
  UserQuestionProvider,
  SandboxMode,
  CommandRuntime,
}
