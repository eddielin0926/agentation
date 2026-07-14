import type { IncomingMessage, ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import type { Plugin } from "vite";

export type AgentationDevBridgeOptions = {
  /**
   * Local bridge URL to proxy to. Defaults to AGENTATION_BRIDGE_URL,
   * AGENTATION_ENDPOINT, or http://localhost:4747.
   */
  bridgeUrl?: string;
  /** Same-origin route prefix exposed by the Vite dev server. */
  prefix?: string;
  /** Return a local discovery response when the bridge is unavailable. */
  fallbackStatus?: boolean;
  /**
   * Optional local agent adapter. Use "mock" for a deterministic demo agent,
   * or provide a callback that forwards tasks to Codex/Claude/tmux/etc.
   */
  agent?: "mock" | AgentationAgentAdapter;
  /**
   * Runs a local command as the agent adapter. The formatted prompt is written
   * to stdin; stdout may be plain text or JSON: { "reply": "...", "status": "needs_review" }.
   */
  agentCommand?: string | string[];
  /** Working directory for agentCommand. Defaults to Vite's project root. */
  agentCommandCwd?: string;
  /** Kill agentCommand after this many milliseconds. */
  agentCommandTimeoutMs?: number;
};

export type AgentationAgentTask = {
  annotation: BridgeAnnotation;
  prompt: string;
};

export type AgentationAgentApi = {
  reply: (annotationId: string, content: string) => BridgeAnnotation | undefined;
  status: (
    annotationId: string,
    status: string,
    content?: string,
  ) => BridgeAnnotation | undefined;
};

export type AgentationAgentAdapter = (
  task: AgentationAgentTask,
  api: AgentationAgentApi,
) => void | Promise<void>;

type BridgeStatus = {
  ok: true;
  mode: "vite";
  bridge: {
    connected: boolean;
    url: string;
  };
  agent: {
    connected: boolean;
    type: "unknown" | "mock" | "command" | "custom";
  };
  capabilities: string[];
};

export type BridgeThreadMessage = {
  id: string;
  role: "human" | "agent" | "system";
  content: string;
  timestamp: number;
  kind?: string;
};

export type BridgeAnnotation = {
  id: string;
  comment?: string;
  status?: string;
  thread?: BridgeThreadMessage[];
  [key: string]: unknown;
};

type BridgeEvent = {
  type: string;
  timestamp: string;
  sequence: number;
  payload: unknown;
};

const DEFAULT_PREFIX = "/__agentation";
const DEFAULT_BRIDGE_URL = "http://localhost:4747";

function normalizePrefix(prefix: string) {
  const trimmed = prefix.trim();
  if (!trimmed || trimmed === "/") return DEFAULT_PREFIX;
  return trimmed.startsWith("/") ? trimmed.replace(/\/$/, "") : `/${trimmed.replace(/\/$/, "")}`;
}

function getBridgeUrl(options: AgentationDevBridgeOptions) {
  return (
    options.bridgeUrl ||
    process.env.AGENTATION_BRIDGE_URL ||
    process.env.AGENTATION_ENDPOINT ||
    DEFAULT_BRIDGE_URL
  ).replace(/\/$/, "");
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function sendFallbackStatus(
  res: ServerResponse,
  bridgeUrl: string,
  agentType: BridgeStatus["agent"]["type"],
) {
  const status: BridgeStatus = {
    ok: true,
    mode: "vite",
    bridge: {
      connected: false,
      url: bridgeUrl,
    },
    agent: {
      connected: agentType !== "unknown",
      type: agentType,
    },
    capabilities: ["status", "events", "comments", "replies", "status_updates", "sse"],
  };
  sendJson(res, 200, status);
}

function sendSseEvent(res: ServerResponse, event: BridgeEvent) {
  res.write(`event: ${event.type}\n`);
  res.write(`id: ${event.sequence}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sendFallbackEvents(
  req: IncomingMessage,
  res: ServerResponse,
  clients: Set<ServerResponse>,
) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected to vite fallback\n\n");
  clients.add(res);

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

async function proxyToBridge(
  req: IncomingMessage,
  res: ServerResponse,
  targetUrl: string,
  body: Buffer | undefined,
) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (key === "host" || key === "connection") continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: body ? toArrayBuffer(body) : undefined,
  });

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key === "content-encoding" || key === "transfer-encoding") return;
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  for await (const chunk of response.body) {
    res.write(chunk);
  }
  res.end();
}

function parseJsonBody<T>(body: Buffer | undefined): T {
  if (!body || body.byteLength === 0) return {} as T;
  return JSON.parse(body.toString("utf8")) as T;
}

function formatPrompt(annotation: BridgeAnnotation) {
  const lines = [
    "A user left an anchored UI comment for a coding agent.",
    "",
    `Comment: ${annotation.comment || "(empty)"}`,
    annotation.element ? `Element: ${annotation.element}` : undefined,
    annotation.reactComponents ? `React: ${annotation.reactComponents}` : undefined,
    annotation.sourceFile ? `Source: ${annotation.sourceFile}` : undefined,
    annotation.elementPath ? `DOM path: ${annotation.elementPath}` : undefined,
    annotation.url ? `URL: ${annotation.url}` : undefined,
    "",
    "Reply in the annotation thread with status updates as you work.",
  ].filter(Boolean);

  return lines.join("\n");
}

function parseCommand(command: string | string[]) {
  if (Array.isArray(command)) {
    const [file, ...args] = command;
    return { file, args, shell: false };
  }

  return { file: command, args: [] as string[], shell: true };
}

function parseCommandResult(stdout: string): { reply?: string; status?: string } {
  const trimmed = stdout.trim();
  if (!trimmed) return {};

  try {
    const json = JSON.parse(trimmed) as {
      reply?: string;
      content?: string;
      message?: string;
      status?: string;
    };
    return {
      reply: json.reply || json.content || json.message,
      status: json.status,
    };
  } catch {
    return { reply: trimmed };
  }
}

function createCommandAdapter(
  command: string | string[],
  getCwd: () => string,
  timeoutMs: number,
): AgentationAgentAdapter {
  return async ({ annotation, prompt }, api) => {
    const { file, args, shell } = parseCommand(command);
    if (!file) {
      api.status(annotation.id, "blocked", "Agent command is empty");
      return;
    }

    api.status(annotation.id, "working", "Agent command started");

    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
      (resolve, reject) => {
        const child = spawn(file, args, {
          cwd: getCwd(),
          shell,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error(`Agent command timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, code });
        });
        child.stdin.end(prompt);
      },
    );

    if (result.code !== 0) {
      api.status(
        annotation.id,
        "blocked",
        `Agent command exited with code ${result.code ?? "unknown"}${result.stderr ? `: ${result.stderr.trim()}` : ""}`,
      );
      return;
    }

    const parsed = parseCommandResult(result.stdout);
    if (parsed.reply) {
      api.reply(annotation.id, parsed.reply);
    }
    api.status(annotation.id, parsed.status || "needs_review", "Agent command finished");
  };
}

export function agentation(options: AgentationDevBridgeOptions = {}): Plugin {
  const prefix = normalizePrefix(options.prefix ?? DEFAULT_PREFIX);
  const bridgeUrl = getBridgeUrl(options);
  const fallbackStatus = options.fallbackStatus ?? true;
  const agentType: BridgeStatus["agent"]["type"] = options.agentCommand
    ? "command"
    : options.agent === "mock"
      ? "mock"
      : typeof options.agent === "function"
        ? "custom"
        : "unknown";
  const annotations = new Map<string, BridgeAnnotation>();
  const clients = new Set<ServerResponse>();
  let sequence = 0;
  let projectRoot = process.cwd();

  const emit = (type: string, payload: unknown) => {
    const event: BridgeEvent = {
      type,
      timestamp: new Date().toISOString(),
      sequence: ++sequence,
      payload,
    };

    for (const client of clients) {
      sendSseEvent(client, event);
    }
  };

  const createThreadMessage = (
    role: "human" | "agent" | "system",
    content: string,
    kind = "comment",
  ) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
    kind,
  });

  const appendReply = (
    annotationId: string,
    content: string,
    role: "human" | "agent" = "agent",
  ) => {
    const annotation = annotations.get(annotationId);
    if (!annotation) return undefined;

    const message = createThreadMessage(role, content);
    const nextAnnotation = {
      ...annotation,
      thread: [...(annotation.thread || []), message],
    };
    annotations.set(annotationId, nextAnnotation);
    emit("annotation.reply", { ...nextAnnotation, message });
    return nextAnnotation;
  };

  const updateStatus = (
    annotationId: string,
    status: string,
    content?: string,
  ) => {
    const annotation = annotations.get(annotationId);
    if (!annotation) return undefined;

    const message = content
      ? createThreadMessage("system", content, "status_change")
      : undefined;
    const nextAnnotation = {
      ...annotation,
      status,
      thread: message ? [...(annotation.thread || []), message] : annotation.thread,
    };
    annotations.set(annotationId, nextAnnotation);
    emit("annotation.updated", nextAnnotation);
    return nextAnnotation;
  };

  const mockAgent: AgentationAgentAdapter = async ({ annotation }, api) => {
    api.status(annotation.id, "acknowledged", "Agent acknowledged this comment");
    api.reply(
      annotation.id,
      `I can see this is anchored to ${String(annotation.element || "the selected UI")}. I would inspect ${String(annotation.sourceFile || "the related component")} next.`,
    );
    api.status(annotation.id, "needs_review", "Mock agent finished");
  };

  const runAgent = (annotation: BridgeAnnotation) => {
    const configuredAgent =
      options.agent ??
      (options.agentCommand
        ? createCommandAdapter(
            options.agentCommand,
            () => options.agentCommandCwd || projectRoot,
            options.agentCommandTimeoutMs ?? 120000,
          )
        : undefined);
    if (!configuredAgent) return;

    const adapter = configuredAgent === "mock" ? mockAgent : configuredAgent;
    Promise.resolve(
      adapter(
        {
          annotation,
          prompt: formatPrompt(annotation),
        },
        {
          reply: (annotationId, content) => appendReply(annotationId, content, "agent"),
          status: updateStatus,
        },
      ),
    ).catch((error) => {
      const message = error instanceof Error ? error.message : "Unknown agent error";
      updateStatus(annotation.id, "blocked", `Agent adapter failed: ${message}`);
    });
  };

  return {
    name: "vite-plugin-agentation",
    apply: "serve",
    configureServer(server) {
      projectRoot = server.config.root;

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!url.pathname.startsWith(prefix)) {
          next();
          return;
        }

        const targetUrl = `${bridgeUrl}${url.pathname}${url.search}`;
        const body = await readRequestBody(req);

        try {
          await proxyToBridge(req, res, targetUrl, body);
        } catch {
          if (fallbackStatus && req.method === "GET" && url.pathname === `${prefix}/status`) {
            sendFallbackStatus(res, bridgeUrl, agentType);
            return;
          }

          if (fallbackStatus && req.method === "GET" && url.pathname === `${prefix}/events`) {
            sendFallbackEvents(req, res, clients);
            return;
          }

          if (fallbackStatus && req.method === "POST" && url.pathname === `${prefix}/comments`) {
            const annotation = parseJsonBody<BridgeAnnotation>(body);
            const nextAnnotation: BridgeAnnotation = {
              ...annotation,
              id: annotation.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              status: annotation.status || "pending",
            };
            annotations.set(nextAnnotation.id, nextAnnotation);
            emit("annotation.created", nextAnnotation);
            sendJson(res, 201, nextAnnotation);
            runAgent(nextAnnotation);
            return;
          }

          const updateMatch = url.pathname.match(
            new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/comments/([^/]+)$`),
          );
          if (fallbackStatus && req.method === "PATCH" && updateMatch) {
            const id = decodeURIComponent(updateMatch[1]);
            const existing = annotations.get(id);
            if (!existing) {
              sendJson(res, 404, { ok: false, error: "Comment not found" });
              return;
            }

            const patch = parseJsonBody<Partial<BridgeAnnotation>>(body);
            const nextAnnotation = {
              ...existing,
              ...patch,
              id,
            };
            annotations.set(id, nextAnnotation);
            emit("annotation.updated", nextAnnotation);
            sendJson(res, 200, nextAnnotation);
            return;
          }

          const replyMatch = url.pathname.match(
            new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/comments/([^/]+)/reply$`),
          );
          if (fallbackStatus && req.method === "POST" && replyMatch) {
            const id = decodeURIComponent(replyMatch[1]);
            const annotation = annotations.get(id);
            if (!annotation) {
              sendJson(res, 404, { ok: false, error: "Comment not found" });
              return;
            }

            const bodyJson = parseJsonBody<Partial<BridgeThreadMessage> & { text?: string }>(body);
            const content = bodyJson.content || bodyJson.text;
            if (!content) {
              sendJson(res, 400, { ok: false, error: "Reply content is required" });
              return;
            }

            const role = bodyJson.role === "agent" ? "agent" : "human";
            const nextAnnotation = appendReply(id, content, role);
            sendJson(res, 201, nextAnnotation);
            if (role === "human" && nextAnnotation) {
              runAgent(nextAnnotation);
            }
            return;
          }

          const statusMatch = url.pathname.match(
            new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/comments/([^/]+)/status$`),
          );
          if (fallbackStatus && req.method === "POST" && statusMatch) {
            const id = decodeURIComponent(statusMatch[1]);
            const annotation = annotations.get(id);
            if (!annotation) {
              sendJson(res, 404, { ok: false, error: "Comment not found" });
              return;
            }

            const bodyJson = parseJsonBody<{ status?: string; resolvedAt?: string; resolvedBy?: string }>(body);
            if (!bodyJson.status) {
              sendJson(res, 400, { ok: false, error: "Status is required" });
              return;
            }

            const nextAnnotation = updateStatus(
              id,
              bodyJson.status,
              `Status changed to ${bodyJson.status}`,
            );
            if (!nextAnnotation) {
              sendJson(res, 404, { ok: false, error: "Comment not found" });
              return;
            }
            if (bodyJson.resolvedAt || bodyJson.resolvedBy) {
              Object.assign(nextAnnotation, {
                resolvedAt: bodyJson.resolvedAt,
                resolvedBy: bodyJson.resolvedBy,
              });
            }
            annotations.set(id, nextAnnotation);
            sendJson(res, 200, nextAnnotation);
            return;
          }

          sendJson(res, 502, {
            ok: false,
            error: "Agentation bridge unavailable",
            bridgeUrl,
          });
        }
      });
    },
  };
}

export default agentation;
