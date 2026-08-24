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
- `--dry-run` prints the resolved spawn command

The fixtures are deterministic notification JSONL (same shape the probe
records), so the smoke is stable across harness releases until the wire
changes.

## Live harness check

Requires the DeepSeek Harness runtime packages (installed as devDependencies)
and a working model route.

```sh
node bin/dsh-tui.js --dry-run "hello"          # spawn command resolution
node bin/dsh-tui.js --replay fixtures/sample-conversation.jsonl
node bin/dsh-tui.js "reply with the word OK"   # one-shot, prints the reply
node bin/dsh-tui.js                            # interactive TUI
```

Credentials: the runtime composition mounts `settings` + `credentials` +
`llm-pi-ai` (same rows as `dsh-base`), so an existing `$DSH_HOME/settings.yaml`
route works; the official adapter fallback needs `DEEPSEEK_API_KEY` exported
in the launching environment. Without either, turns end with a clear
`MISSING_CREDENTIAL` error — a good end-to-end smoke for the event pipeline.

## Probing the runtime

`scripts/probe-runtime.mjs` spawns the official runtime, performs the
handshake, sends one real prompt, and records every notification to a JSONL
fixture. It uses a live model (needs credentials). Rerun it after upstream
wire changes to refresh the error-path fixture:

```sh
node scripts/probe-runtime.mjs [harnessRepo] [outFile]
```

## Manual UI checklist

- `/help`, `/status`, `/context` show their notices
- typing `/new` resets the chat view; `/sessions` opens the browser and
  Enter resumes a listed session
- `/model` opens the switcher; selection applies to new sessions
- Tab completes `/he` → `/help` and `sr` → `src/…`; ↑/↓ walk history
- `t` (with an empty input line) toggles completed thinking blocks
- Ctrl+C exits cleanly (runtime shutdown → child reaped)