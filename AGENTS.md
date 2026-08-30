# AGENTS.md - dsh-tui

## Scope

This repository is an **official-client terminal UI for DeepSeek Harness**. It
is a client of the official Harness ecosystem: it uses the official
`@deepseek-ai/*` runtime packages, the official profile / agent-preset /
host-plane architecture, and official DSH services.

It is **not** a fork of, and does not copy the code of, the community
`dsh-TUI` (`@deepseek-harness-tui/dsh-tui`) — which is no longer used or
cloned here. All implementation is our own, aligned to the official Harness
plugin model (mount a zero-core-change TUI plugin onto the official harness
and keep the UI thin).

## Architecture

### Official-client model

```text
dsh --profile <name>                     # official CLI: boots $DSH_HOME/profiles/<name>
  -> dsh-base                            # official host plane: tools/subagents/skills/goals/web
                                         #   registries, sandbox+approval, persistence, model route
  -> dsh-tui (cordis.patch.yml)          # our client plugin: mounts the TUI into the profile
  -> Agent preset (standard/minimal/code/cordis)
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
adapter layer (`src/official.ts`). `src/ui/*`, `src/plugin.tsx`, hooks and
screens reach official types only through that facade. Keep the version line
coherent (`0.1.1-rc.2`) and pin the `@deepseek-ai/*` framework packages as
both peer and dev dependencies.

## Architecture Entry (current code)

- CLI launcher: `bin/dsh-tui.js` → ensures the profile owns this package, then
  boots `dsh --profile <name>` (default `tui`, `DSH_TUI_PROFILE` overrides).
- Profile patch: `cordis.patch.yml` (agent-presets roster default `standard`,
  the 23 host tool rows the web profile also disables, shared session root,
  and the `dsh-tui` front door).
- Plugin entry: `src/plugin.tsx` (`name`/`inject`/`Config`/`apply`) creates or
  resumes an Agent via `ctx.agents.create`/`resume`, subscribes to the
  in-process `session/event` feed, and renders the TUI through the shared
  reducer + store. Its controller implements the full slash vocabulary via
  `src/commandRunner.ts`.
- Event interface: `src/events/types.ts` (TuiEvent) + `src/events/reducer.ts`
  (pure reducer).
- UI: Ink components under `src/ui/`; wiring hub is the plugin controller.
- Model/provider config: `src/config.ts` reads `$DSH_HOME/settings.yaml`
  (`llm-pi-ai.providers` + `agent-default-model`) — see `loadDshSettings`.
- Adapter boundary: `src/official.ts` — the only place official
  `@deepseek-ai/*` imports may appear; `src/ui/*` never imports them directly.

## State

The plugin is the **only** client entry. The official `dsh --profile tui`
host plane is booted with this package as a profile bundle; sessions share the
`~/.dsh/sessions` store with `dsh --profile web`. Live boot, session sharing,
and `/resume` are verified daily paths (see README.md → Sharing Sessions With
Web).

## Commands

- Install deps: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Smoke/check: `pnpm check` (keyless, no runtime subprocess)

## Rules

- **Keep the UI thin**: the Cordis boundary is the only edge the UI crosses
  into the agent core. Never modify Agent Core to fit the UI; the runtime owns
  agent/model/tool/session/persistence behavior.
- **Design reference, not code**: you may read `~/Developer/github/deepseek-harness`
  for design; do not copy its source, renderer, presets, bundled skills,
  branding, or plugin ecosystem files.
- **Official path**: prefer the official `@deepseek-ai/*` packages and the
  official profile/preset/host-plane model over bespoke replacements; where a
  bespoke piece exists, plan to move it behind the official equivalent.
  The runtime packages are declared as **peer + dev** dependencies at one
  `0.1.1-rc.2` line (`legacy-peer-deps=true` in `.npmrc` keeps pnpm from hard-
  failing on unsatisfiable peers). The profile / host plane provides the peers;
  dev deps let this repo typecheck/build. Do not add a `@deepseek-ai/*` package
  to `dependencies` — put it in peer + dev.
- **Config source** (`src/config.ts`): dsh's `$DSH_HOME/settings.yaml`
  (`llm-pi-ai.providers` + `agent-default-model`) drives the model/provider
  options; env (`DSH_TUI_MODEL` / `DSH_TUI_PROVIDER` / `DSH_TUI_MODELS`) wins
  over settings and the dsh-tui config file.
- **Secret hygiene**: never log secret values; it is OK to report whether
  `DEEPSEEK_API_KEY` is present.
- **Version line**: the `@deepseek-ai/*` runtime packages stay pinned to one
  coherent `0.1.1-rc.2` line — do not upgrade them in isolation.
- `pnpm-workspace.yaml` carries `strictDepBuilds: false` and
  `verifyDepsBeforeRun: false`: native build-scripts (koffi/node-pty) are
  optional for boot and must not hard-fail `pnpm install`/scripts.
- After source changes, run `pnpm check` or explain why it could not run.
