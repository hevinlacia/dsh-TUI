/**
 * The official `@deepseek-ai/*` adapter boundary for the in-process Cordis
 * plugin. UI layer (`src/ui/*`, `src/plugin.tsx` logic) reaches official types
 * only through this module. See AGENTS.md → Adapter boundary.
 * @module dsh-tui/official
 */

import Schema from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
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
  AskUserQuestionAnswer,
  AskUserQuestionRequest,
  UserQuestionProvider,
  SandboxMode,
  CommandRuntime,
}
