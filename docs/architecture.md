# Architecture

`dsh-tui` is a terminal UI for DeepSeek Harness shipped as an in-process Cordis
plugin. It mounts onto the official `dsh --profile tui` host plane
(`dsh-base`) and composes the same agent world as the web profile, minus the
browser transport. Agent Core is never modified to fit the UI.

## Boundary

```text
dsh --profile tui
  -> dsh-base (host plane)             session persistence, sandbox + approval,
                                       skills/goals registries, model route
  -> cordis.patch.yml (this package)   agent-presets roster + the dsh-tui row
  -> src/plugin.tsx  apply(ctx, config)
       ctx.agents.create/resume        official agent factory (in-process)
       ctx.on('session/event', ...)    official event feed
  -> src/events/reducer.ts             pure: SessionEvent -> TuiEvent -> state
  -> src/state/store.ts                tiny external store (useSyncExternalStore)
  -> src/ui/*                          Ink components render state, dispatch input
```

The harness owns agent loop, model calls, tool execution, session durability,
credentials, permissions, compaction, and subagent delegation. The TUI owns
rendering, user input, session browsing metadata, and model/preset selection.

## Shared sessions with web

The base row `session-persistence-jsonl` is rooted at `dshHomePath('sessions')`
(`~/.dsh/sessions`) for every profile, so `dsh --profile tui` and
`dsh --profile web` write and read the same durable JSONL logs. The plugin's
session browser (`/sessions` + `/resume`) walks that store
(`src/plugin.tsx` → `listPersistedSessions`), decompressing each log to recover
titles, and resumes through the official agent factory (`ctx.agents.resume`).
`DSH_TUI_SESSION_ROOT` re-points the root for test isolation only.

## Event interface (minimal, by explicit design)

`src/events/types.ts` defines the only vocabulary the UI understands. The
plugin projects official `SessionEvent`s through `eventsFor`; the reducer maps
only what the UI consumes and drops the rest. `tuiEventsFromNotification`
adapts fixture frames for the keyless replay path (`scripts/smoke.mjs`).

| TuiEvent | Source session-event(s) | Purpose |
| --- | --- | --- |
| `status` (+connection) | `session.status`, `turn/start/end`, `step/start/end`, `tool/*` | status line |
| `user-message` | `user/message` with `source.kind === 'user'` | chat |
| `assistant-delta` / `thinking-delta` | `assistant/chunk` (`text-delta` / `reasoning-delta`) | streaming |
| `assistant-message` | `assistant/message` (finalized; usage, interrupted) | finalize |
| `tool-start` / `tool-finish` | `tool/call` / `tool/result` | tool cards |
| `title` / `todos` / `context` | `session/title` / `todo/write` / `request/context` | session browser, status |

## Data flow

1. `bin/dsh-tui.js` ensures the profile points at this package, then runs
   `dsh --profile tui`.
2. The profile composes `dsh-base` + this package's `cordis.patch.yml`
   (agent-presets roster default `standard`, the 23 host tool rows the web
   profile also disables, and the `dsh-tui` front door).
3. `src/plugin.tsx` `apply` builds the controller, creates/resumes an agent
   through `ctx.agents`, subscribes to `session/event`, and renders the Ink
   tree.
4. Every official session event is projected through `eventsFor` and the
   reducer into the store; Ink components subscribe via `useSyncExternalStore`.
5. Input submission: `/`-commands dispatch through `src/commandRunner.ts`
   (model/preset/permission switches, session resume, harness commands);
   plain text goes out as `agent.followup(createUserMessage(...))` and returns
   as session events.

`scripts/smoke.mjs` feeds notification fixtures through the replay pipeline
with no runtime process and prints a plain-text render — the keyless smoke path
that exercises reducer + components deterministically.

## Agent-plane parity with web

`cordis.patch.yml` disables the same 23 host rows the web-app bundle disables
(`tool-bash`/`tool-pwsh`/`tool-jobs`/`tool-fs`/`tool-fs-search`/
`tool-str-replace-editor`/`skill-filesystem`/`tool-skill`/`tool-goal`/
`plan-mode`/`compaction-basic`/`command-compact`/`tool-result-pruner`/
`tool-subagent-*`/`workflow-worker-thread`/`tool-workflow`/`tool-ralph`/
`agent-instructions`/`tool-todo`/`tool-web`) and mounts the same
`agent-presets` roster (default `standard`). A tui session therefore composes
the same tool world as a web standard-preset session.

## Adapter boundary

All imports of official `@deepseek-ai/*` packages are confined to
`src/official.ts` (see AGENTS.md → Adapter boundary). `src/ui/*` and
`src/plugin.tsx` reach official types and services only through that facade.

## Deliberately out of scope (phase 1)

Clipboard, mouse interaction, splash/logo animation, custom renderer,
Yoga/layout engine, full theme and i18n systems, rewind/fork, plugin system,
subagent dashboard, trajectory viewer, VS Code integration, self-update, and
the web-only surfaces (session content search, workspace, background-jobs list,
`@`-reference picker).
