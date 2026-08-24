# Testing

## Local Checks

```sh
pnpm check
```

`pnpm check` compiles TypeScript and runs a keyless smoke test. The smoke test does not call the model; it verifies CLI help output and dry-run command formatting.

## Manual Harness Check

After `pnpm build`, run:

```sh
node ./bin/dsh-tui.js --dry-run "hello"
node ./bin/dsh-tui.js "reply with the word ok"
```

The second command requires a working DeepSeek Harness profile and credentials.
