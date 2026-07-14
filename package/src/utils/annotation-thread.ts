import type { Annotation, AnnotationStatus, ThreadMessage } from "../types";

export const ANNOTATION_STATUS_OPTIONS: AnnotationStatus[] = [
  "pending",
  "acknowledged",
  "working",
  "needs_review",
  "blocked",
  "resolved",
];

export function getAnnotationStatusLabel(status: AnnotationStatus) {
  switch (status) {
    case "pending":
      return "Open";
    case "acknowledged":
      return "Acknowledged";
    case "working":
      return "Working";
    case "needs_review":
      return "Needs review";
    case "resolved":
      return "Resolved";
    case "blocked":
      return "Blocked";
    case "dismissed":
      return "Dismissed";
  }
}

export function getThreadRoleLabel(role: ThreadMessage["role"]) {
  switch (role) {
    case "human":
      return "You";
    case "agent":
      return "Agent";
    case "system":
      return "System";
  }
}

export function isRenderableAnnotation(annotation: Annotation): boolean {
  return annotation.status !== "resolved" && annotation.status !== "dismissed";
}

export function createThreadMessage(
  role: ThreadMessage["role"],
  content: string,
  kind: ThreadMessage["kind"] = "comment",
): ThreadMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
    kind,
  };
}

export function getAnnotationThread(annotation: Annotation): ThreadMessage[] {
  if (annotation.thread?.length) return annotation.thread;
  if (!annotation.comment) return [];
  return [
    {
      id: `${annotation.id}-initial-comment`,
      role: "human",
      content: annotation.comment,
      timestamp: annotation.timestamp,
      kind: "comment",
    },
  ];
}

export function withThread(annotation: Annotation): Annotation {
  return {
    ...annotation,
    status: annotation.status ?? "pending",
    thread: getAnnotationThread(annotation),
  };
}

export function updateAnnotationComment(annotation: Annotation, comment: string): Annotation {
  const thread = getAnnotationThread(annotation);
  const firstHumanIndex = thread.findIndex((message) => message.role === "human");
  const nextThread =
    firstHumanIndex >= 0
      ? thread.map((message, index) =>
          index === firstHumanIndex ? { ...message, content: comment } : message,
        )
      : [createThreadMessage("human", comment), ...thread];

  return {
    ...annotation,
    comment,
    status: annotation.status ?? "pending",
    thread: nextThread,
    updatedAt: new Date().toISOString(),
  };
}
