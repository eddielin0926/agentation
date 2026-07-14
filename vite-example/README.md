# Agentation Vite Example

Small Vite React playground for the experimental Agentation dev bridge.

## Run

From the repo root:

```bash
corepack pnpm@10 install
corepack pnpm@10 --filter agentation build
corepack pnpm@10 --filter vite-plugin-agentation build
corepack pnpm@10 vite:example
```

Open the Vite URL, enable the Agentation toolbar, and leave a comment on a
component. The Vite plugin exposes `__agentation` routes from the same origin,
runs `scripts/agentation-agent.js`, and streams the command reply back into the
annotation thread.

## Adapter

`scripts/agentation-agent.js` is intentionally tiny:

- stdin: formatted annotation prompt
- stdout: JSON with `reply` and `status`
- no file edits

It is a safe demo shape for replacing the script with a Codex, Claude Code,
tmux, or other local agent wrapper later.
