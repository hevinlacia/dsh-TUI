# AGENTS.md - dsh-tui

## Scope

This repository is an independent personal TUI for DeepSeek Harness. It is not a fork of the community dsh-TUI project and should not copy its source structure, branding, renderer, presets, bundled skills, or plugin ecosystem files.

## Architecture Entry

- CLI entry: `bin/dsh-tui.js`
- TypeScript source: `src/`
- Harness boundary: spawn the official `dsh --profile <profile> <task>` command; default profile is `headless`
- Docs: `README.md`, `docs/architecture.md`, `docs/testing.md`

## Commands

- Install deps: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Smoke/check: `pnpm check`

## Rules

- Keep this project small and dependency-light until the integration boundary changes.
- Do not import or vendor source from `/home/hevin/Developer/github/deepseek-harness`; use it only as behavioral reference.
- Do not reintroduce fork-only files such as `cordis.patch.yml`, packaged presets, packaged skills, vendored renderers, or ecosystem submodules unless the project explicitly adopts that design later.
- Treat `dsh` as the owner of agent, model, tool, session, permission, and persistence behavior.
- Never log secret values. It is OK to report whether `DEEPSEEK_API_KEY` is present.
- After source changes, run `pnpm check` or explain why it could not run.
