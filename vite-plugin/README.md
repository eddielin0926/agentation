# vite-plugin-agentation

Vite dev bridge for Agentation.

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

The plugin exposes same-origin `__agentation` routes in Vite dev mode:

- `GET /__agentation/status`
- `GET /__agentation/events`
- `POST /__agentation/comments`
- `PATCH /__agentation/comments/:id`
- `POST /__agentation/comments/:id/reply`
- `POST /__agentation/comments/:id/status`

When the configured bridge is unavailable, the plugin keeps an in-memory
fallback store and broadcasts annotation events over SSE. This makes the UI loop
testable before a real Codex, Claude Code, or tmux adapter exists.

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
