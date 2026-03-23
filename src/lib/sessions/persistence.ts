import type { SessionMessage } from "../types";
import {
  addSessionMessage,
  getSessionMessages,
  getSessionMessageCount,
  clearSessionMessages,
} from "../database";

export interface DisplayMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

/** Rough token estimate: ~4 chars per token. */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Persist a display message to SQLite. */
export async function saveMessage(sessionId: string, msg: DisplayMessage): Promise<void> {
  const tokens = estimateTokenCount(msg.content);
  await addSessionMessage(sessionId, msg.role as SessionMessage["role"], msg.content, tokens);
}

/** Load recent message history for a session, converted to DisplayMessage format. */
export async function loadHistory(sessionId: string, limit = 100): Promise<DisplayMessage[]> {
  // We want the most recent N messages, but in chronological order.
  // getSessionMessages already returns ASC order with LIMIT, but from the start.
  // To get the *last* N, we need to know the total count.
  const total = await getSessionMessageCount(sessionId);
  const offset = Math.max(0, total - limit);
  const rows = await getSessionMessages(sessionId, limit, offset);
  return rows.map(toDisplayMessage);
}

/** Load ALL messages for a session (archive viewing). */
export async function getFullHistory(sessionId: string): Promise<DisplayMessage[]> {
  const rows = await getSessionMessages(sessionId, 999_999, 0);
  return rows.map(toDisplayMessage);
}

/** Clear all persisted messages for a session. */
export async function clearHistory(sessionId: string): Promise<void> {
  await clearSessionMessages(sessionId);
}

function toDisplayMessage(row: SessionMessage): DisplayMessage {
  return {
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
  };
}
