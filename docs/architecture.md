# Architecture

`dsh-tui` is currently a small command-line TUI wrapper around the official DeepSeek Harness CLI.

## Current Boundary

```text
user terminal
  -> dsh-tui prompt loop
  -> child process: dsh --profile <profile> <task>
  -> DeepSeek Harness owns agent/model/tool/session behavior
  -> child stdout/stderr streamed back into the terminal
```

The project does not mount a Cordis plugin yet. It uses the `headless` profile because that is the smallest official surface that accepts one task, runs an agent, prints the final assistant text, and exits.

## Why This Is Not A Fork

The implementation keeps no copied renderer, packaged presets, packaged skills, `cordis.patch.yml`, ecosystem submodule, or upstream TUI file layout. DeepSeek Harness source is used only to understand stable behavior:

- UI plugins eventually render from `session/event`.
- User input eventually maps to `agent.followup()` or `agent.steer()`.
- Agent, session, model, tool, approval, and persistence logic stay inside Harness.

## MVP Trade-Offs

- Each submitted task is a new `dsh --profile headless` run.
- Conversation continuity is approximated by prepending recent transcript text to the next task.
- Streaming is process-level stdout/stderr, not token-level `session/event` rendering.
- Ctrl+C cancels the current child process by normal process signaling.

## Likely Next Step

When the basic UX is stable, replace the child-process boundary with a real Harness UI plugin or protocol driver:

1. Create/resume one Harness agent.
2. Subscribe to `session/event`.
3. Render assistant chunks, tool calls, and turn boundaries directly.
4. Submit input via `agent.followup()`.
5. Dispose the agent handle cleanly on exit.
