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

The canonical client is the **in-process Cordis plugin**: `dsh-tui` boots the
official dsh profile host plane and loads this package as a plugin inside the
harness (one command — it auto-creates the profile on first run).

```sh
cd ~/Developer/tools/dsh-tui
pnpm install
pnpm build

dsh-tui                     # boot the dsh-tui profile (in-process plugin)
dsh-tui --profile NAME      # boot a specific profile
dsh-tui --dry-run           # print the boot command, don't run
dsh-tui "summarize this repo"  # one-shot task
```

Under the hood `dsh-tui` runs `dsh --profile <name>`; the first run installs
THIS package into the profile (`dsh plugin --profile <name> add <this pkg>`).
The legacy **JSON-RPC subprocess client** is still available at
`dsh-tui-standalone` (spawns `dsh-jsonrpc-agent`, no approval/permission/sandbox
switching).

Development and checks:

```sh
pnpm dev      # build + run
pnpm check    # build + keyless smoke (no model, no runtime)
```

## Configuration

### Default config file

A dsh-tui config file (default `~/.config/dsh-tui/config.yaml`, overridable via
`DSH_TUI_CONFIG`) holds shared defaults for **both** the standalone CLI and the
in-process plugin. Copy `config.example.yaml` to that path and set the fields
you want. Resolve chain for provider/model/cwd:

```
explicit (env / --flag / cordis patch)  >  config file  >  dsh settings  >  built-in default
```

```yaml
# ~/.config/dsh-tui/config.yaml
provider: llm-provider-router
model: high-model-auto
cwd: /home/hevin/Developer
preset: standard
```

### Env / flags

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
`/permission [mode]` `/preset [name]` `/clear` `/exit` — plus `↑/↓` history,
`Tab` completion, `t` thinking toggle.

`/permission` (no arg) opens a picker for the three DSH sandbox levels
(`read-only` / `workspace-write` / `danger-full-access`); `/permission <mode>`
switches directly. Full access also turns the approval policy off (`never`), the
others stay `ask`. The footer badge (`ro`/`ws`/`full`) shows the live level.
`/preset` picks the agent preset (`standard`/`code`/`minimal`/`cordis`) for new
sessions — the choice is passed to the agent factory (`meta.agentPreset`);
mounting the agent-presets roster (a deliberate profile change, like the web
profile) makes it change the tool world.

Known `/` commands not handled by the TUI (e.g. `/plan`, `/goal`) are routed to
the harness command registry, so they execute without a model round-trip. A
single-word `/foo` that resolves to neither the TUI nor a harness command is
reported as unknown; a path like `/a/b` is submitted as text.

## Deliberately out of scope (phase 1)

Clipboard, mouse, splash/logo animation, custom renderer, Yoga/layout engine,
full themes and i18n, rewind/fork, plugin system, subagent dashboard,
trajectory viewer, VS Code integration, self-update.