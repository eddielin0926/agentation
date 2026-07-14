import type { Annotation, AnnotationStatus, ThreadMessage } from "../types";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export type DevBridgeInfo = {
  ok?: boolean;
  mode?: string;
  bridge?: string | { connected?: boolean; [key: string]: unknown };
  agent?: { connected?: boolean; type?: string; session?: string; [key: string]: unknown };
  capabilities?: string[];
};

const DEV_BRIDGE_PREFIX = "/__agentation";

export async function getDevBridgeStatus(): Promise<DevBridgeInfo | null> {
  const response = await fetch(`${DEV_BRIDGE_PREFIX}/status`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`status ${response.status}`);

  const info = (await response.json()) as DevBridgeInfo;
  return info.ok === false ? null : info;
}

export function hasDevBridgeEventStream(info: DevBridgeInfo | null): boolean {
  const capabilities = info?.capabilities ?? [];
  return capabilities.length === 0 || capabilities.includes("sse") || capabilities.includes("events");
}

async function postJson<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const response = await fetch(`${DEV_BRIDGE_PREFIX}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return (await response.json()) as T;
}

export function createDevBridgeEventSource(): EventSource {
  return new EventSource(`${DEV_BRIDGE_PREFIX}/events`);
}

export function createDevBridgeComment(annotation: Annotation): Promise<Annotation> {
  return postJson<Annotation>("/comments", annotation);
}

export function updateDevBridgeComment(annotation: Annotation): Promise<Annotation> {
  return postJson<Annotation>(`/comments/${annotation.id}`, annotation, "PATCH");
}

export function replyToDevBridgeComment(
  annotationId: string,
  message: ThreadMessage,
): Promise<Annotation> {
  return postJson<Annotation>(`/comments/${annotationId}/reply`, message);
}

export function updateDevBridgeCommentStatus(
  annotationId: string,
  status: AnnotationStatus,
  data: Pick<Annotation, "resolvedAt" | "resolvedBy"> = {},
): Promise<Annotation> {
  return postJson<Annotation>(`/comments/${annotationId}/status`, {
    status,
    resolvedAt: data.resolvedAt,
    resolvedBy: data.resolvedBy,
  });
}
