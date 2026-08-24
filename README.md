# dsh-tui

Independent minimal terminal UI for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

This project is intentionally **not** a fork of the community dsh-TUI implementation. The current MVP uses the official `dsh --profile headless` command as the integration boundary, then layers a small terminal conversation loop on top.

## What Works

- Interactive prompt loop in the terminal
- `/help`, `/clear`, `/profile <name>`, and `/exit` commands
- One-shot mode for scripts: `dsh-tui "your task"`
- Configurable Harness command/profile via flags or env vars
- Optional in-process transcript prefixing so follow-up prompts have lightweight context
- Dependency-light TypeScript implementation with no copied renderer or fork assets

## Requirements

- Node.js `>=22.19`
- pnpm `11.x`
- Official `dsh` CLI available on `PATH`
- DeepSeek Harness configured for the selected profile
- `DEEPSEEK_API_KEY` set for real model calls, unless your profile uses another credential provider

## Install And Run

```sh
cd /home/hevin/Developer/tools/dsh-tui
pnpm install
pnpm build
node ./bin/dsh-tui.js
```

Development mode:

```sh
pnpm dev
```

Run a single task and exit:

```sh
dsh-tui "summarize this repository"
```

Use a different Harness profile:

```sh
dsh-tui --profile headless "run the tests"
dsh-tui --profile my-profile
```

Print the command without calling Harness:

```sh
dsh-tui --dry-run "hello"
```

## Configuration

| Option | Env Var | Default | Meaning |
| --- | --- | --- | --- |
| `--profile <name>` | `DSH_TUI_PROFILE` | `headless` | Harness profile passed to `dsh --profile` |
| `--dsh <path>` | `DSH_TUI_DSH_BIN` | `dsh` | Harness executable |
| `--cwd <path>` | — | current directory | Child process working directory |
| `--no-history` | — | off | Do not prepend prior turns to follow-up tasks |
| `--dry-run` | — | off | Show the command instead of executing it |

## Design Notes

The MVP deliberately avoids the full Cordis UI-plugin path. DeepSeek Harness documents that a full UI plugin should render from `session/event` and drive the agent through `agent.followup()`. This project starts with the simpler `headless` command boundary so it can be maintained independently and expanded later.

See `docs/architecture.md` for the current boundary and likely next steps.
