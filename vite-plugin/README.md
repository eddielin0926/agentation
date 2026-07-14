# vite-plugin-agentation

Vite dev bridge for Agentation.

The plugin is meant for local development. It exposes same-origin
`/__agentation/*` routes from the Vite dev server so the toolbar can talk to a
local bridge or fallback adapter without requiring the user to configure CORS,
ports, or a manual Vite proxy.

## Install in a Vite app

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import agentation from "vite-plugin-agentation";

export default defineConfig({
  plugins: [
    react(),
    agentation({
      // Proxies /__agentation/* to this bridge when available.
      bridgeUrl: "http://localhost:4747",

      // Optional deterministic demo agent for the component-comment loop.
      agent: "mock",
    }),
  ],
});
```

Use the toolbar normally:

```tsx
import { Agentation } from "agentation";

export function App() {
  return (
    <>
      <YourApp />
      <Agentation />
    </>
  );
}
```

When no explicit `endpoint` prop is provided, the toolbar can discover the
same-origin dev bridge by calling `GET /__agentation/status`.

## Route contract

The plugin exposes same-origin `__agentation` routes in Vite dev mode:

- `GET /__agentation/status`
- `GET /__agentation/events`
- `POST /__agentation/comments`
- `PATCH /__agentation/comments/:id`
- `POST /__agentation/comments/:id/reply`
- `POST /__agentation/comments/:id/status`

The intended loop is:

```text
browser toolbar
  -> /__agentation/comments
  -> Vite dev bridge
  -> local bridge or fallback store
  -> agent adapter
  -> /__agentation/events
  -> toolbar thread/status update
```

When the configured bridge is unavailable, the plugin keeps an in-memory
fallback store and broadcasts annotation events over SSE. This makes the UI loop
testable before a real Codex, Claude Code, or tmux adapter exists.

## Status response

`GET /__agentation/status` returns a discovery payload:

```json
{
  "ok": true,
  "mode": "vite",
  "bridge": {
    "connected": false,
    "url": "http://localhost:4747"
  },
  "agent": {
    "connected": true,
    "type": "command"
  },
  "capabilities": ["status", "events", "comments", "replies", "status_updates", "sse"]
}
```

`bridge.connected` means the plugin successfully proxied to the configured
bridge. When it is `false`, the Vite fallback store is handling the route.
`agent.type` is one of `unknown`, `mock`, `custom`, or `command`.

## Mock adapter

Use `agent: "mock"` when you want a deterministic browser demo without running
any external command:

```ts
agentation({
  agent: "mock",
});
```

The mock adapter acknowledges a comment, adds one agent reply, and marks it as
`needs_review`.

## Custom adapter

Custom adapters receive a structured task and can reply through the bridge API:

```ts
agentation({
  agent: async ({ annotation, prompt }, api) => {
    api.status(annotation.id, "working", "Agent started");
    // Forward `prompt` to a local coding agent here.
    api.reply(annotation.id, "I found the related component.");
    api.status(annotation.id, "needs_review", "Agent finished");
  },
});
```

The adapter is called when a new component comment is created and when a human
reply is added to an existing comment thread.

## Command adapter

For a first real local adapter, run a command. The formatted prompt is written
to stdin. Stdout may be plain text, or JSON with `reply` and optional `status`.

```ts
agentation({
  agentCommand: ["node", "scripts/agentation-agent.js"],
  agentCommandTimeoutMs: 120_000,
});
```

Example command output:

```json
{
  "reply": "I found the related component and would adjust the button hover state.",
  "status": "needs_review"
}
```

Non-zero exits and timeouts mark the annotation as `blocked`.

## Local playground

This repository includes a Vite playground that uses the command adapter:

```bash
corepack pnpm@10 install
corepack pnpm@10 --filter agentation build
corepack pnpm@10 --filter vite-plugin-agentation build
corepack pnpm@10 vite:example
```

The playground command adapter lives at:

```text
vite-example/scripts/agentation-agent.js
```

It reads the formatted prompt from stdin and returns JSON:

```json
{
  "reply": "Demo command adapter received the comment...",
  "status": "needs_review"
}
```

You can smoke test the route loop without a browser:

```bash
curl http://localhost:5173/__agentation/status

curl -N http://localhost:5173/__agentation/events

curl -X POST http://localhost:5173/__agentation/comments \
  -H 'content-type: application/json' \
  --data '{"comment":"Tighten this card spacing","element":"section.metric-card"}'
```

Expected SSE events:

```text
annotation.created
annotation.updated   # working
annotation.reply
annotation.updated   # needs_review
```
