import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import agentation from "vite-plugin-agentation";

export default defineConfig({
  plugins: [
    react(),
    agentation({
      agentCommand: ["node", "scripts/agentation-agent.js"],
      agentCommandTimeoutMs: 15000,
    }),
  ],
});
