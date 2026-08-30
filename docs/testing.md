# Testing

## Keyless local checks

```sh
pnpm check
```

`pnpm check` = `pnpm build` + `node scripts/smoke.mjs`. It needs no API key and
no runtime subprocess. It covers:

- command parsing and completion engine (`/help` → command, `src/…` → files)
- reducer + replay of `fixtures/sample-conversation.jsonl` (rich conversation
  with thinking stream, bash tool cards, usage, two turns) — asserts the A1
  tool-card shape, A2 thinking markers, R2 chat lines, and R4 status line
- replay of `fixtures/sample-session-error.jsonl` (a real captured error turn:
  `assistant/chunk finish error` + `turn/end error`) — graceful failure render
- `dsh-tui --dry-run` prints the resolved `dsh --profile tui` boot command

The fixtures are deterministic session-event JSONL fed through the same
reducer pipeline the plugin uses, so the smoke is stable across harness
releases until the session-event vocabulary changes.

## Live harness check

Requires the official `dsh` CLI and a working model route.

```sh
dsh-tui --dry-run                      # print the boot command, don't run
dsh --profile tui                      # the canonical entry: boot the TUI
dsh-tui                                # same as `dsh --profile tui`
```

Credentials: the profile composes `settings` + `credentials` + `llm-pi-ai`
(same rows as `dsh-base`), so an existing `$DSH_HOME/settings.yaml` route
works; the official adapter fallback needs `DEEPSEEK_API_KEY` exported in the
launching environment. Without either, turns end with a clear
`MISSING_CREDENTIAL` error — a good end-to-end smoke for the event pipeline.

## Manual UI checklist

- `/help`, `/status`, `/context` show their notices
- typing `/new` resets the chat view; `/sessions` opens the browser and
  Enter resumes a listed session (the same sessions `dsh --profile web` lists)
- `/model` opens the switcher; selection applies to new sessions
- Tab completes `/he` → `/help` and `sr` → `src/…`; ↑/↓ walk history
- `t` (with an empty input line) toggles completed thinking blocks
- Ctrl+C exits cleanly (the host profile disposes the root before exit)
