// ── Session Archive: Search, summarize, and export sessions ──────
//
// The archive is a read-only bookshelf of past conversations.
// Sessions are books. Messages are pages. Names are titles.

import type { Session, SessionMessage } from "../types";
import { getDatabase } from "../database";
import { listSessions, getSession } from "../database";
import { getSessionMessages } from "../database";

// ── Search ──────────────────────────────────────────────────────

interface SessionMessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  token_estimate: number;
}

/**
 * Full-text search across all sessions or within a single session.
 * Uses SQLite LIKE for broad compatibility; fast enough for thousands of messages.
 */
export async function searchMessages(
  query: string,
  sessionId?: string,
): Promise<SessionMessage[]> {
  const db = await getDatabase();
  const likePattern = `%${query}%`;

  let rows: SessionMessageRow[];
  if (sessionId) {
    rows = await db.select<SessionMessageRow[]>(
      "SELECT * FROM session_messages WHERE session_id = $1 AND content LIKE $2 ORDER BY timestamp DESC LIMIT 200",
      [sessionId, likePattern],
    );
  } else {
    rows = await db.select<SessionMessageRow[]>(
      "SELECT * FROM session_messages WHERE content LIKE $1 ORDER BY timestamp DESC LIMIT 200",
      [likePattern],
    );
  }

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role as SessionMessage["role"],
    content: row.content,
    timestamp: row.timestamp,
    tokenEstimate: row.token_estimate,
  }));
}

// ── Summary ─────────────────────────────────────────────────────

export interface SessionSummary {
  messageCount: number;
  firstMessage: number;
  lastMessage: number;
  duration: number;
}

/**
 * Get a statistical summary of a session's conversation.
 */
export async function getSessionSummary(sessionId: string): Promise<SessionSummary> {
  const db = await getDatabase();

  const countRows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM session_messages WHERE session_id = $1",
    [sessionId],
  );
  const messageCount = countRows[0]?.count ?? 0;

  const rangeRows = await db.select<{ first_ts: number | null; last_ts: number | null }[]>(
    "SELECT MIN(timestamp) as first_ts, MAX(timestamp) as last_ts FROM session_messages WHERE session_id = $1",
    [sessionId],
  );

  const firstMessage = rangeRows[0]?.first_ts ?? 0;
  const lastMessage = rangeRows[0]?.last_ts ?? 0;
  const duration = lastMessage > 0 && firstMessage > 0 ? lastMessage - firstMessage : 0;

  return { messageCount, firstMessage, lastMessage, duration };
}

// ── Export ───────────────────────────────────────────────────────

/**
 * Export a full session as clean markdown with timestamps and roles.
 */
export async function exportSession(sessionId: string): Promise<string> {
  const session = await getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const messages = await getSessionMessages(sessionId, 999_999, 0);

  const lines: string[] = [];
  lines.push(`# ${session.name}`);
  lines.push("");
  lines.push(`**Created:** ${new Date(session.createdAt).toLocaleString()}`);
  lines.push(`**Messages:** ${messages.length}`);
  if (messages.length > 0) {
    const first = messages[0]!.timestamp;
    const last = messages[messages.length - 1]!.timestamp;
    lines.push(`**Duration:** ${formatDuration(last - first)}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const msg of messages) {
    const time = new Date(msg.timestamp).toLocaleString();
    const role = msg.role === "user" ? "You" : msg.role === "assistant" ? "Companion" : "System";
    lines.push(`### ${role} — ${time}`);
    lines.push("");
    lines.push(msg.content);
    lines.push("");
  }

  return lines.join("\n");
}

// ── List ────────────────────────────────────────────────────────

/**
 * Paginated list of all sessions, sorted by most recently active.
 */
export async function listArchivedSessions(
  limit = 50,
  offset = 0,
): Promise<Session[]> {
  const all = await listSessions();
  return all.slice(offset, offset + limit);
}

// ── Helpers ─────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
