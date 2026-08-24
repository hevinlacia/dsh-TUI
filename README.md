# dsh-tui

Independent terminal UI for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

An event-driven Ink/React client that speaks the official Harness SDK
JSON-RPC wire to a runtime subprocess — **not** a plugin, and **not** a fork
of the community dsh-TUI project (no copied renderer, presets, or ecosystem
files). Agent Core stays untouched: the TUI consumes structured
`session.event` / `session.status` notifications and submits `session/prompt`.

## What Works (phase 1)

- **Chat (R2)** — user/assistant messages with live assistant streaming
- **Status line (R4)** — idle / working / thinking / tool-running, connection
  state, model, turn·step
- **Tool cards (A1)** — structured display of tool calls and results
  (name, args, lifecycle badge, output), not plain text dumps
- **Thinking stream (A2)** — live reasoning deltas, collapsible when done
  (`t` on an empty input line)
- **Completion (I1)** — Tab completes `/commands` and file paths
- **Session browser (W1)** — simplified `/sessions` + `/resume [id]`, backed
  by a UI metadata registry (the runtime owns the durable log)
- **Model switch (W7)** — `/model`, applies to new sessions (protocol-level
  `initialize` re-send, no Agent Core change)
- **Status commands (C1)** — `/status`, `/context`
- **Script mode** — `dsh-tui "one-shot task"` prints the final reply;
  `--dry-run` shows the spawn command; `--replay <jsonl>` renders a fixture
  keylessly (deterministic smoke path)

## Architecture

```text
user terminal
  -> dsh-tui process                    (TypeScript + Ink, src/)
  -> spawns dsh-jsonrpc-agent <runtime/cordis.yml>
  -> NDJSON JSON-RPC over stdio         (official wire, docs/protocol.md)
  -> session.event / session.status notifications
  -> src/events/reducer.ts       (pure: notification -> TuiEvent -> state)
  -> src/state/store.ts          (tiny external store)
  -> src/ui/*                    (Ink components)
```

Runtime owns agent/model/tool/session/durability/credentials; the TUI owns
rendering, input, session metadata, and model selection. See
[docs/architecture.md](docs/architecture.md) and [docs/protocol.md](docs/protocol.md).

## Requirements

- Node.js `>=22.19`, pnpm `11.x`
- Harness runtime packages (installed as devDependencies, `0.1.1-rc.2` line)
- `$DSH_HOME/settings.yaml` route (e.g. a local provider-router) or
  `DEEPSEEK_API_KEY` exported for live model calls

## Install And Run

```sh
cd ~/Developer/tools/dsh-tui
pnpm install
pnpm build
node ./bin/dsh-tui.js
```

Development and checks:

```sh
pnpm dev      # build + run
pnpm check    # build + keyless smoke (no model, no runtime)
```

Run a single task and exit:

```sh
dsh-tui "summarize this repository"
dsh-tui --dry-run "hello"
dsh-tui --replay fixtures/sample-conversation.jsonl
```

## Configuration

| Option | Env Var | Default | Meaning |
| --- | --- | --- | --- |
| `--jsonrpc-bin <path>` | `DSH_TUI_JSONRPC_BIN` | installed `dsh-jsonrpc-agent` | runtime executable (local harness clone as fallback) |
| `--cordis <path>` | `DSH_TUI_CORDIS` | `runtime/cordis.yml` | runtime composition |
| `--cwd <dir>` | `DSH_TUI_CWD` | current directory | session workspace for bash/fs |
| `--model <name>` | `DSH_TUI_MODEL` | first of list | model for new sessions |
| `--replay <file>` | — | — | keyless fixture render |
| — | `DSH_TUI_PROVIDER` | `deepseek-official` | provider route for new sessions |
| — | `DSH_TUI_MODELS` | `deepseek-v4-flash` | comma-separated switchable models |

## Commands inside the TUI

`/help` `/status` `/context` `/new` `/resume [id]` `/sessions` `/model [name]`
`/clear` `/exit` — plus `↑/↓` history, `Tab` completion, `t` thinking toggle.

## Deliberately out of scope (phase 1)

Clipboard, mouse, splash/logo animation, custom renderer, Yoga/layout engine,
full themes and i18n, rewind/fork, plugin system, subagent dashboard,
trajectory viewer, VS Code integration, self-update.