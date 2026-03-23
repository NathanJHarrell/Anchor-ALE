import type { SessionMessage, MessageImage } from "../types";
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
  images?: MessageImage[];
}

/** Rough token estimate: ~4 chars per token. */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Persist a display message to SQLite. Optional timestamp override for imports. */
export async function saveMessage(sessionId: string, msg: DisplayMessage, timestamp?: number): Promise<void> {
  const tokens = estimateTokenCount(msg.content);
  const imagesJson = msg.images && msg.images.length > 0
    ? JSON.stringify(msg.images.map((img) => ({ media_type: img.media_type, data: img.data })))
    : null;
  await addSessionMessage(sessionId, msg.role as SessionMessage["role"], msg.content, tokens, imagesJson, timestamp);
}

/** Load recent message history for a session, converted to DisplayMessage format. */
export async function loadHistory(sessionId: string, limit = 100): Promise<DisplayMessage[]> {
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
  const msg: DisplayMessage = {
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
  };
  if (row.imagesJson) {
    try {
      msg.images = JSON.parse(row.imagesJson) as MessageImage[];
    } catch {
      // Corrupted JSON — ignore
    }
  }
  return msg;
}
