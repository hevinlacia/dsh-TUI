# AGENTS.md - dsh-tui

## Scope

This repository is an **official-client terminal UI for DeepSeek Harness**. It
is a client of the official Harness ecosystem: it uses the official
`@deepseek-ai/*` runtime packages, the official profile / agent-preset /
host-plane architecture, and official DSH services.

It is **not** a fork of, and does not copy the code of, the community
`dsh-TUI` (`@deepseek-harness-tui/dsh-tui`, repo `~/Developer/github/dsh-TUI`).
The community project serves only as a **design reference** for how to mount a
TUI as a zero-core-change plugin onto the official harness and how to keep the
UI thin. All implementation here is our own.

## Architecture

### Target (official-client) model

```text
dsh --profile <name>                     # official CLI: boots $DSH_HOME/profiles/<name>
  -> dsh-base                            # official host plane: tools/subagents/skills/goals/web
                                         #   registries, sandbox+approval, persistence, model route
  -> dsh-tui (cordis.patch.yml)          # our client plugin: mounts the TUI into the profile
  -> Agent preset (standard/minimal/code/cordis + ours)
  -> session/event                       # official session events (single source of truth)
  -> dsh-tui channel projection          # event -> view model
  -> React (Ink) components              # the TUI we own
  -> terminal
```

### Domain ownership (the single most important rule)

**DeepSeek Harness owns the agent, model, tool, session, permission,
persistence, and policy domains.** The TUI only:

- consumes official `session/event` / status / subagent notifications and
  official services/registries;
- renders them (streaming, thinking, tool cards, status, context);
- captures user input and submits intent (prompt / steer / follow-up /
  interrupt / model & preset selection / resume / rewind) through the official
  channel;
- persists only UI-owned metadata (theme, input history, session registry,
  `~/.dsh-tui/*.json` preferences).

Never re-implement a DSH domain in the TUI for the sake of the look (model
switching via fork/续聊, compaction, rewind, approvals, etc. stay with DSH).

### Adapter boundary

All imports of official `@deepseek-ai/*` packages are confined to a single
adapter layer (mirrors the community project's `dsh-adapter/` idea, but our own
design). `src/ui/*`, `src/channel.ts`, hooks and screens reach official types
only through that facade. Keep the version line coherent (`0.1.1-rc.2`) and
pin the `@deepseek-ai/*` framework packages as both peer and dev dependencies.

## Architecture Entry (current code)

- CLI entry: `bin/dsh-tui.js` → `src/cli.ts` (interactive / one-shot / replay / dry-run)
- Harness boundary: spawn the official `dsh-jsonrpc-agent <runtime/cordis.yml>`
  subprocess and speak the SDK JSON-RPC wire (`initialize` / `session/prompt` /
  `shutdown` requests; `session.event` / `session.status` / `subagent.*` notifications)
- Event interface: `src/events/types.ts` (TuiEvent) + `src/events/reducer.ts`
  (pure reducer); wire→event mapping in `docs/protocol.md`
- UI: Ink components under `src/ui/`; wiring hub `src/controller.ts`
- Model/provider config: `src/config.ts` reads `$DSH_HOME/settings.yaml`
  (`llm-pi-ai.providers` + `agent-default-model`) — see `loadDshSettings`
- Runtime composition: `runtime/cordis.yml` (official DSH services + agent-spine
  with Skills on, workspace AGENTS.md context, goal domain; approval/ask-user
  answerers not yet registered → fail-closed)
- Adapter boundary: `src/adapter.ts` — the only place official `@deepseek-ai/*`
  imports may appear; `src/ui/*` never imports them directly

## Transition status

The code is **mid-transition** toward the official-client (in-process Cordis
plugin) model. The **primary entry is now the in-process plugin**: `dsh-tui`
boots the official dsh profile host plane with this package loaded as a plugin
(see `bin/dsh-tui.js`), auto-creating the profile on first run. The older
JSON-RPC subprocess client is kept at `dsh-tui-standalone` (legacy; spawns
`dsh-jsonrpc-agent`, no approval/permission/sandbox switching). Work is tracked
to:

1. Move the runtime to consume the official profile + host plane (mount as a
   profile bundle: `dsh plugin --profile <name> add <pkg>`) — DONE (the plugin
   is the primary entry).
2. Switch to the official agent-presets (`standard` / `minimal` / `code` /
   `cordis`) instead of the hand-rolled `agent-spine-demo` tree — DONE (the
   profile mounts the `agent-presets` roster and the in-process controller's
   `setup` mounts the selected preset per session; host tool rows are disabled
   so the preset owns the tools).
3. Introduce the `@deepseek-ai/*` adapter boundary and drop the raw JSON-RPC
   subprocess in favor of in-process Cordis service consumption — DONE at the
   adapter boundary (`src/official.ts`), the JSON-RPC path is legacy-only.
4. Keep the TUI rendering/input layer, adapted to consume official events.

Current state: the runtime composition now mounts official DSH services
(user-questions, approval, subagent spawn+fork, commands, plan-mode,
command-goal, session-query, fs-observation-policy) and enables Skills +
workspace context + goals on agent-spine (see `runtime/cordis.yml`). The TUI
still drives it over JSON-RPC and reads settings.yaml for model/provider. The
remaining big step is the in-process Cordis plugin mount (steps 1-2-4).

Plugin-package foundation: `package.json` now declares the
`@deepseek-ai/*` framework packages as **peer + dev** (prerelease-inclusive
range `^0.1.0-rc.6 || ^0.1.1-rc.1`), adds `dsh.bundle.patch` → `cordis.patch.yml`
and an `./cordis.patch.yml` export, and ships `.npmrc` with
`legacy-peer-deps=true` so pnpm does not hard-fail on peer ranges that
prerelease versions cannot satisfy (`dsh-system-prompt@>=0.1.1`). This makes
the repo structurally an installable plugin package.

The in-process plugin (steps 1-2-4) is now skeleton-to-full-controller:
`src/plugin.tsx` (name/inject/Config/apply) creates/resumes an agent via
`ctx.agents.create`/`resume`, subscribes to `session/event`, and projects the
feed through the shared `eventsFor` + reducer. Its `InProcessController`
implements the full slash vocabulary via `src/commandRunner.ts` (reused from
the standalone set, without touching the working CLI path): `/model` switches
the compose default, `/new` re-creates a fresh session, `/resume <id>` resumes
a persisted session, `/clear`/`/status`/`/context`/`/exit` behave as in the
standalone. `cordis.patch.yml` overlays persona + shared session root and
inserts the `dsh-tui` row; MOUNT verified via `dsh --profile <test>
--dump-config` (composes over dsh-base, no `entry not found`).

**Remaining / needs a running harness to verify (live, not compile):** the
in-process `apply` actually booting — a real `dsh --profile <name>` with this
plugin creating an agent, rendering, and receiving session events; and the
model-switch/resume DSH-domain behavior against a live agent (the
`currentSessionId`-filtered subscription and re-create/resume plumbing are
compile-tested only). Standalone mode is the verified daily path.

## Commands

- Install deps: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Smoke/check: `pnpm check` (keyless, no runtime subprocess)
- Probe live runtime: `pnpm probe [harnessRepo] [outFile]`

## Rules

- **Keep the UI thin**: the JSON-RPC wire / Cordis boundary is the only edge the
  UI crosses into the agent core. Never modify Agent Core to fit the UI; the
  runtime owns agent/model/tool/session/persistence behavior.
- **Design reference, not code**: you may read `~/Developer/github/dsh-TUI` and
  `~/Developer/github/deepseek-harness` for design; do not copy their source,
  renderer, presets, bundled skills, branding, or plugin ecosystem files.
- **Official path**: prefer the official `@deepseek-ai/*` packages and the
  official profile/preset/host-plane model over bespoke replacements; where a
  bespoke piece exists, plan to move it behind the official equivalent.
  The runtime packages are declared as **peer + dev** dependencies at one
  `0.1.1-rc.2` line (`legacy-peer-deps=true` in `.npmrc` keeps pnpm from hard-
  failing on unsatisfiable peers). The profile / host plane provides the peers;`
  dev deps let this repo typecheck/build. Do not add a `@deepseek-ai/*` package
  to `dependencies` — put it in peer + dev.
- **Config source** (`src/config.ts`): dsh's `$DSH_HOME/settings.yaml`
  (`llm-pi-ai.providers` + `agent-default-model`) drives the model/provider
  options; env (`DSH_TUI_MODEL` / `DSH_TUI_PROVIDER` / `DSH_TUI_MODELS`) wins
  over settings.
- **Secret hygiene**: never log secret values; it is OK to report whether
  `DEEPSEEK_API_KEY` is present.
- **Version line**: the `@deepseek-ai/*` runtime packages stay pinned to one
  coherent `0.1.1-rc.2` line — do not upgrade them in isolation.
- `pnpm-workspace.yaml` carries `strictDepBuilds: false` and
  `verifyDepsBeforeRun: false`: native build-scripts (koffi/node-pty) are
  optional for boot and must not hard-fail `pnpm install`/scripts.
- After source changes, run `pnpm check` or explain why it could not run.
