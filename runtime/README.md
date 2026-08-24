# runtime/

The plugin tree dsh-tui boots as the Harness runtime subprocess
(`runtime/cordis.yml`). It is dsh-tui's own composition — the official
`examples/jsonrpc-agent/cordis.yml` is the reference for its structure; the
credential rows (`settings`, `credentials`, `llm-pi-ai`) mirror `dsh-base` so
an existing `$DSH_HOME/settings.yaml` works unchanged.

## Resolution

Bare `@deepseek-ai/*` plugin names resolve relative to this directory, i.e.
from this project's `node_modules` (the `devDependencies` block of
`package.json`, pinned to the `0.1.1-rc.2` harness line). Do not upgrade these
packages in isolation; keep the set on one coherent rc line.

## Env contract

| Env | Used for |
| --- | --- |
| `DSH_CWD` | workspace cwd for bash/fs rows (defaults to runtime cwd) |
| `DSH_SESSION_ROOT` | durable session log root (dsh-tui sets its own) |
| `DSH_SYSTEM_PROMPT` | deployment persona |
| `DSH_MAX_TOKENS_AS_SUCCESS` | max-token turn → success mapping (default true) |
| `DSH_HOME` | user settings/credentials/`settings.yaml` (default `~/.dsh`) |

Model and provider arrive per session over JSON-RPC `initialize`; nothing is
pinned in this file on purpose.