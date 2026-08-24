# Wire Protocol — dsh-tui ↔ DeepSeek Harness runtime

This document pins the JSON-RPC contract dsh-tui speaks to the Harness SDK
runtime (`@deepseek-ai/dsh-sdk-jsonrpc-server`, shipped in the
`@deepseek-ai/dsh-sdk-jsonrpc-demo` bin as of `0.1.1-rc.2`). The client
implementation lives in `src/harness/`; wire types mirror the official
`@deepseek-ai/dsh-sdk-protocol` package without importing it.

## Transport

- Spawn: `dsh-jsonrpc-agent <path/to/cordis.yml>` (or `DSH_CORDIS_CONFIG`).
- Newline-delimited JSON-RPC 2.0 over stdout (server→client frames) and stdin
  (client→server frames). stdout carries **only** protocol frames; stderr is
  diagnostics and must not be parsed.
- Request: `{"jsonrpc":"2.0","id":"<string>","method":"...","params":{...}}`
- Response: `{"jsonrpc":"2.0","id":"<same>","result":...}` or
  `{"jsonrpc":"2.0","id":"<same>","error":{"code":-32603,"message":"..."}}`
- Notification: `{"jsonrpc":"2.0","method":"session.event","params":{...}}`
- Unknown methods on the wire are dropped by the server; unknown methods
  requested by the client return `-32601`.

## Requests (client → server)

| Method | Params | Result | Notes |
| --- | --- | --- | --- |
| `initialize` | `{cwd, provider, model, maxTokens?}` | `{serverInfo:{name,version}}` | Handshake. Re-sending with a new `model` switches the model for subsequently created sessions (no Agent Core change). |
| `session/prompt` | `{sessionId, contentBlocks:[{type:'text',text}]}` | `{messageId}` | Creates the session on first use (durable resume when the id is persisted), queues the user message, agent follows up. |
| `shutdown` | `{}` | `{}` | Disposes server-owned agents, adapter, subscriptions; the surrounding context keeps running. |

## Notifications (server → client)

| Method | Params | Consumed by |
| --- | --- | --- |
| `session.event` | `{sessionId, event}` | reducer (see below) |
| `session.status` | `{sessionId, status: 'idle'\|'running'}` | status line (R4) |
| `subagent.started` | `{parentSessionId, childSessionId}` | dropped in phase 1 |
| `subagent.finished` | `{provider, agentId, parentSessionId, childSessionId, status, stopReason, lastAssistantMessage?}` | dropped in phase 1 |

## `session.event` vocabulary consumed by the reducer

`event` is a `SessionEvent`: `{type, seq, time, data}`. Only these `type`s are
mapped to `TuiEvent` (see `src/events/types.ts`); all others are ignored.

| SessionEvent type | `data` fields used | TuiEvent produced |
| --- | --- | --- |
| `user/message` | `content`, `source.kind` | `user-message` (only `kind === 'user'`) |
| `assistant/chunk` | `chunk.type` ∈ `text-delta` / `reasoning-delta` / `finish` | `assistant-delta` / `thinking-delta` / (error on `finish.reason.kind === 'error'`) |
| `assistant/message` | `message`, `usage`, `interrupted` | `assistant-message` |
| `tool/call` | `callId`, `name`, `arguments` | `tool-start` |
| `tool/result` | `message`, `error`, `meta` | `tool-output` + `tool-finish` |
| `turn/start` / `turn/end` | `turn`, `reason` | `turn-start` / `turn-end` (status derivation) |
| `step/start` / `step/end` | `turn`, `step` | status derivation |
| `session/title` | `title` | `title` |
| `todo/write` | `todos` | `todos` |
| `request/context` | `provider`, `model` | `context` |

The relationship is one-directional: **session events are the source of truth
for rendering; the TUI never reconstructs model-visible history itself.**

## Failure contract

- Transport close without an explicit `shutdown` response ⇒ `disconnected`
  event; the client reaps the child (EOF → SIGTERM → SIGKILL ladder) and the
  UI shows a terminal error with the retained stderr tail.
- `session/prompt` rejection ⇒ surfaced as a `user-message` plus an `error`
  notice; the UI stays usable.
- Runtime death mid-turn ⇒ `disconnected`; no partial state is trusted beyond
  what was rendered.