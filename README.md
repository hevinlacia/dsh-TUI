# dsh-tui

A terminal UI for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness),
shipped as a Cordis plugin mounted into the official `dsh --profile tui`. It is
the web profile's shared core minus the browser transport: the same host plane,
the same agent presets, and the same durable session store — so sessions here
and in `dsh --profile web` see each other.

This is **not** a fork of, and does not copy the code of, the community
`dsh-TUI` (`@deepseek-harness-tui/dsh-tui`). All implementation is our own,
aligned to the official Harness plugin model (mount a zero-core-change TUI
plugin onto the official harness and keep the UI thin).

## How It Works

```text
dsh --profile tui
  -> dsh-base                              # official host plane (dsh web shares this)
       session persistence  -> ~/.dsh/sessions   (same store web writes)
       sandbox + approval, skills/goals registries, model route
  -> dsh-tui (cordis.patch.yml)            # this package's patch layer
       mounts agent-presets roster + the dsh-tui front door
  -> src/plugin.tsx                         # in-process Cordis plugin
       creates/resumes an Agent via ctx.agents, subscribes to session/event
  -> src/events/* reducer                   # official event -> TuiEvent -> state
  -> src/ui/* (Ink components)             # the TUI we own
  -> terminal
```

The runtime owns agent/model/tool/session/permission/persistence; the TUI owns
rendering, input, session browsing metadata, and model/preset selection. See
[AGENTS.md](AGENTS.md) and [docs/architecture.md](docs/architecture.md).

## Requirements

- Node.js `>=22.19`, pnpm `11.x`
- The `dsh` CLI (the official DeepSeek Harness app) on `PATH`
- A model route: `~/.dsh/settings.yaml` (e.g. a local provider-router) or
  `DEEPSEEK_API_KEY` exported for live model calls

## Install And Run

```sh
cd ~/Developer/tools/dsh-tui
pnpm install
pnpm build

dsh-tui                     # boot the dsh-tui profile (in-process plugin)
dsh-tui --profile NAME      # boot a specific profile
dsh-tui --dry-run           # print the boot command, don't run
```

Under the hood `dsh-tui` runs `dsh --profile <name>`; the first run installs
THIS package into the profile (`dsh plugin --profile <name> add <this pkg>`).
The default profile is `tui`, so `dsh --profile tui` and `dsh-tui` are the same
front door.

Development and checks:

```sh
pnpm dev      # build + run
pnpm check    # build + keyless smoke (no model, no runtime)
```

## Configuration

### Default config file

A dsh-tui config file (default `~/.config/dsh-tui/config.yaml`, overridable via
`DSH_TUI_CONFIG`) holds shared defaults for the plugin. Copy
`config.example.yaml` to that path and set the fields you want. Resolve chain
for provider/model/cwd:

```
explicit (env / plugin config / cordis patch)  >  config file  >  dsh settings  >  built-in default
```

```yaml
# ~/.config/dsh-tui/config.yaml
provider: llm-provider-router
model: high-model-auto
cwd: /home/hevin/Developer
preset: standard
```

### Model + preset memory

The provider + model pair you switch to (`/model <id>` or the picker) AND the
agent preset you switch to (`/preset <id>` or the picker) are remembered in
dsh-tui's own state file (`~/.dsh-tui/last-model.json`) and restored on the
next start — the model only when the pair still exists in the dsh settings
options, the preset as-is (unknown ids surface visibly at session creation).
Resolve chain on boot:

```
env / cordis patch  >  config file  >  last-used memory  >  dsh settings  >  built-in default
```

The status footer shows the resolved provider/model from boot (no more
"no-model" on a fresh start). To pin a model or preset permanently, set it in
the config file or via `DSH_TUI_MODEL` / the cordis patch; explicit values
outrank the memory.

### Env / flags

| Option | Env Var | Default | Meaning |
| --- | --- | --- | --- |
| `--profile <name>` | `DSH_TUI_PROFILE` | `tui` | profile to boot |
| — | `DSH_TUI_PROVIDER` | settings default | provider route for new sessions |
| — | `DSH_TUI_MODEL` | settings default | model for new sessions |
| — | `DSH_TUI_MODELS` | settings list | comma-separated switchable models |
| — | `DSH_TUI_PRESET` | `standard` | agent preset for new sessions |
| — | `DSH_TUI_RESUME_SESSION` | — | session id to resume on boot |
| — | `DSH_TUI_CWD` | config `cwd` / `process.cwd()` | session workspace |
| — | `DSH_TUI_PERSONA` | `You are a coding agent.` | deployment persona |

## Sharing Sessions With Web

Both `dsh --profile web` and `dsh --profile tui` compose the same base row
`session-persistence-jsonl` rooted at `dshHomePath('sessions')`
(`~/.dsh/sessions`), so `/resume` here and the web session list read the same
durable logs. The profile patch re-points the root only when
`DSH_TUI_SESSION_ROOT` is set (test isolation).

## Commands inside the TUI

`/help` `/status` `/context` `/new` `/resume [id]` `/sessions` `/model [name]`
`/permission [mode]` `/preset [name]` `/commands` `/clear` `/exit` — plus
`↑/↓` history, `Tab` completion, `t` thinking toggle.

The input box follows pi's command interaction: typing `/` opens a dropdown
that fuzzy-narrows commands (subsequence scoring; initial highlight = exact >
prefix match), `/model `/`/permission `/`/preset `/`/resume ` each surface
second-level argument candidates, and path-like tokens complete from the
workspace. `↑/↓` move the (centered, wrapped) highlight, `Tab`/`Enter` apply
the highlighted row — Enter also submits it (pi fall-through), while an empty
argument query submits the bare command so `/model` opens the picker instead
of switching to the first entry. `Esc` dismisses the menu. In chat context
Enter always sends — a path menu never blocks submitting.

- `/permission` (no arg) opens a picker for the three DSH sandbox levels
  (`read-only` / `workspace-write` / `danger-full-access`); full access also
  turns the approval policy off (`never`), the others stay `ask`.
- `/preset` picks the agent preset (`standard`/`code`/`minimal`/`cordis`) for
  new sessions — mounted through the agent-presets roster
  (`ctx.agentPresets.mount`), so it changes the tool world (the host tool rows
  are disabled and the preset owns the tools, like the web profile).
- Known `/` commands not handled by the TUI (e.g. `/plan`, `/goal`) are routed
  to the harness command registry, so they execute without a model round-trip.
