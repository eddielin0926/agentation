<picture>
  <source media="(prefers-color-scheme: dark)" srcset="package/logo-dark.svg">
  <img src="package/logo.svg" alt="Agentation" width="200">
</picture>

<br>

[![npm version](https://img.shields.io/npm/v/agentation)](https://www.npmjs.com/package/agentation)
[![downloads](https://img.shields.io/npm/dm/agentation)](https://www.npmjs.com/package/agentation)

**[Agentation](https://agentation.com)** is an agent-agnostic visual feedback tool. Click elements on your page, add notes, and copy structured output that helps AI coding agents find the exact code you're referring to.

## Install

```bash
npm install agentation -D
```

## Usage

```tsx
import { Agentation } from 'agentation';

function App() {
  return (
    <>
      <YourApp />
      <Agentation />
    </>
  );
}
```

The toolbar appears in the bottom-right corner. Click to activate, then click any element to annotate it.

## Vite dev bridge

This fork includes an experimental Vite dev bridge for component-comment agent
loops. The bridge exposes same-origin `__agentation` routes during local
development, so the browser toolbar can create comments, receive replies over
SSE, and hand work to a local agent adapter without CORS or manual proxy setup.

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import agentation from "vite-plugin-agentation";

export default defineConfig({
  plugins: [
    react(),
    agentation({
      agentCommand: ["node", "scripts/agentation-agent.js"],
    }),
  ],
});
```

The local loop is:

```text
component comment
  -> POST /__agentation/comments
  -> Vite dev bridge
  -> mock/custom/command agent adapter
  -> annotation reply + status events
  -> toolbar thread update
```

Run the Vite playground:

```bash
corepack pnpm@10 install
corepack pnpm@10 --filter agentation build
corepack pnpm@10 --filter vite-plugin-agentation build
corepack pnpm@10 vite:example
```

Then open the printed Vite URL and leave a comment on a component. See
[`vite-plugin/README.md`](vite-plugin/README.md) for the `__agentation` route
contract, mock adapter, command adapter, and fallback behavior.

## Features

- **Click to annotate** – Click any element with automatic selector identification
- **Text selection** – Select text to annotate specific content
- **Multi-select** – Drag to select multiple elements at once
- **Area selection** – Drag to annotate any region, even empty space
- **Animation pause** – Freeze all animations (CSS, JS, videos) to capture specific states
- **Structured output** – Copy markdown with selectors, positions, and context
- **Dark/light mode** – Matches your preference or set manually
- **Zero dependencies** – Pure CSS animations, no runtime libraries

## How it works

Agentation captures class names, selectors, and element positions so AI agents can `grep` for the exact code you're referring to. Instead of describing "the blue button in the sidebar," you give the agent `.sidebar > button.primary` and your feedback.

## Requirements

- React 18+
- Desktop browser (mobile not supported)

## Docs

Full documentation at [agentation.com](https://agentation.com)

## License

© 2026 Benji Taylor

Licensed under PolyForm Shield 1.0.0
