# AGENTS.md - dsh-tui

## Scope

This repository is an independent personal TUI for DeepSeek Harness. It is
not a fork of the community dsh-TUI project and does not copy its source
structure, branding, renderer, presets, bundled skills, or plugin ecosystem
files.

## Architecture Entry

- CLI entry: `bin/dsh-tui.js` → `src/cli.ts` (modes: interactive / one-shot /
  replay / dry-run)
- Harness boundary: spawn the official `dsh-jsonrpc-agent <runtime/cordis.yml>`
  runtime subprocess and speak the SDK JSON-RPC wire
  (`initialize` / `session/prompt` / `shutdown` requests;
  `session.event` / `session.status` / `subagent.*` notifications)
- Event interface: `src/events/types.ts` (TuiEvent) + `src/events/reducer.ts`
  (pure reducer); wire→event mapping documented in `docs/protocol.md`
- UI: Ink components under `src/ui/`; wiring hub `src/controller.ts`
- Docs: `README.md`, `docs/architecture.md`, `docs/protocol.md`, `docs/testing.md`
- Runtime composition: `runtime/cordis.yml` (dsh-tui-owned plugin tree)

## Commands

- Install deps: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Smoke/check: `pnpm check` (keyless, no runtime subprocess)
- Probe live runtime: `pnpm probe [harnessRepo] [outFile]`

## Rules

- Keep this project small and dependency-light; the JSON-RPC wire is the only
  boundary the UI may cross (Agent Core is never modified to fit the UI).
- Do not import or vendor source from
  `/home/hevin/Developer/github/deepseek-harness`; use it only as behavioral
  reference. The runtime packages are devDependencies pinned to one coherent
  `0.1.1-rc.2` line — do not upgrade them in isolation.
- Do not reintroduce fork-only files (`cordis.patch.yml`, packaged presets,
  packaged skills, vendored renderers, ecosystem submodules).
- Treat the runtime as the owner of agent, model, tool, session, permission,
  and persistence behavior. Session events are the single source of truth for
  rendering; the TUI keeps only UI metadata (session registry).
- `pnpm-workspace.yaml` carries `strictDepBuilds: false` and
  `verifyDepsBeforeRun: false`: native build-scripts (koffi/node-pty) are
  optional for boot and must not hard-fail `pnpm install`/scripts.
- Never log secret values. It is OK to report whether `DEEPSEEK_API_KEY` is
  present.
- After source changes, run `pnpm check` or explain why it could not run.