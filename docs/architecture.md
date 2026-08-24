# Architecture

`dsh-tui` is an independent terminal UI for DeepSeek Harness. It is a
**protocol client**, not a plugin: the TUI runs in its own process and speaks
the official Harness SDK JSON-RPC wire protocol to a Harness runtime
subprocess. Agent Core is never modified to fit the UI.

## Boundary

```text
user terminal
  -> dsh-tui process (TypeScript + Ink)
       src/harness/client.ts  ── spawns the runtime subprocess ──>
       [ dsh-jsonrpc-agent <runtime/cordis.yml> ]
       NDJSON JSON-RPC over stdio (official @deepseek-ai/dsh-sdk-protocol wire)
       <-- notifications -- <events/status>
  -> src/events/reducer.ts  (pure: notification -> TuiEvent -> state)
  -> src/state/store.ts     (tiny external store, useSyncExternalStore)
  -> src/ui/*               (Ink components render state, dispatch input)
```

The runtime process owns: agent loop, model calls, tool execution, session
durability, credentials, permissions, compaction. The TUI owns: rendering,
user input, session browsing metadata, model selection, command handling.

## Why the JSON-RPC runtime and not `dsh --profile headless`

The headless command boundary (previous MVP) prints finished assistant text to
stdout. A real TUI needs a **structured, streaming event stream**: token
deltas, reasoning deltas, tool lifecycles, and agent status transitions. The
official out-of-process seam for exactly that is `dsh-sdk-jsonrpc-server`,
which emits `session.event` / `session.status` notifications and accepts
`initialize` / `session/prompt` / `shutdown` requests (see
[docs/protocol.md](protocol.md)). Adopting it keeps the old,
unstructured-string boundary out of the design.

## Event interface (minimal, by explicit design)

`src/events/types.ts` defines the only vocabulary the UI understands. It is
deliberately smaller than `SessionEventMap`; the reducer maps only what the UI
consumes. Everything else is dropped.

| TuiEvent | Source session-event(s) | Purpose |
| --- | --- | --- |
| `status` (+connection) | `session.status`, `turn/start/end`, `step/start/end`, `tool/*` | R4 status line |
| `user-message` | `user/message` with `source.kind === 'user'` | R2 chat |
| `assistant-delta` / `thinking-delta` | `assistant/chunk` (`text-delta` / `reasoning-delta`) | R2 streaming, A2 |
| `assistant-message` | `assistant/message` (finalized; usage, interrupted) | R2 finalize |
| `tool-start` / `tool-output` / `tool-finish` | `tool/call` / `tool/result` | A1 tool cards |
| `title` / `todos` / `context` | `session/title` / `todo/write` / `request/context` | W1, C1 |

## Data flow

1. `cli.ts` parses args, loads config, creates the store.
2. `client.ts` spawns the runtime and performs `initialize`.
3. Every notification is buffered and pushed through `wire→TuiEvent`
   mapping; the reducer applies events to state in order.
4. Ink components subscribe to the store (`useSyncExternalStore`) and render.
5. Input submission: `/`-commands dispatch locally (or restart the runtime for
   `/model`); plain text goes out as `session/prompt` and returns as events.

`--replay <file>` feeds a fixture notification JSONL through the same pipeline
with no runtime process and prints a plain-text render — the keyless smoke
path that exercises reducer + components deterministically.

## Provisioning

- **Runtime executable** (`src/runtime/resolve.ts`): `DSH_TUI_JSONRPC_BIN` →
  `dsh-jsonrpc-agent` on PATH → the local DeepSeek Harness checkout's built
  `dsh-sdk-jsonrpc-demo` bin (dev convenience, documented).
- **Composition** (`runtime/cordis.yml`): dsh-tui's own plugin tree. Bare
  `@deepseek-ai/*` names resolve from this project's `node_modules`
  (devDependencies pinned to the harness `0.1.1-rc.2` line).
- **Credentials**: the composition mounts the same rows as the official
  `dsh-base` bundle — `settings` + `credentials` + `llm-pi-ai` — so an
  existing `$DSH_HOME/settings.yaml` (e.g. a local provider-router route)
  works unchanged. `llm-deepseek` with `DEEPSEEK_API_KEY` remains the
  fallback for official-API use. No secret value ever enters dsh-tui source.

## Session browsing & model switch (W1/W7)

- The TUI keeps its own small session registry
  (`~/.local/share/dsh-tui/sessions.json`) as UI metadata: id, title, created/
  updated timestamps, message count. The runtime stays the authority on the
  durable log; resuming sends `session/prompt` with the stored session id.
- Model switch re-sends `initialize` with the new model. The server applies it
  to subsequently created sessions; existing sessions keep their model. This
  needs no Agent Core change.

## Deliberately out of scope (phase 1)

Clipboard, mouse interaction, splash/logo animation, custom renderer,
Yoga/layout engine, full theme and i18n systems, rewind/fork, plugin system,
subagent dashboard, trajectory viewer, VS Code integration, self-update.