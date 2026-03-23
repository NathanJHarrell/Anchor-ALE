import type { NormalizedConversation, NormalizedMessage } from "../types";

/**
 * Shape of a single conversation in Claude.ai's data export (conversations.json).
 * Each conversation has a chat_messages array with the full message history.
 */
interface ClaudeMessage {
  uuid: string;
  text: string;
  sender: "human" | "assistant";
  created_at: string;
  attachments?: unknown[];
}

interface ClaudeConversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  chat_messages: ClaudeMessage[];
}

function parseTimestamp(iso: string): number {
  const ts = new Date(iso).getTime();
  return Number.isNaN(ts) ? Date.now() : ts;
}

function mapRole(sender: string): NormalizedMessage["role"] {
  if (sender === "human") return "user";
  if (sender === "assistant") return "assistant";
  return "system";
}

/**
 * Parse a Claude.ai JSON export. Accepts the raw JSON string and yields
 * conversations one at a time to avoid holding the entire parsed result
 * in memory alongside the normalized output.
 */
export function parseClaudeExport(jsonText: string): NormalizedConversation[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error("Invalid JSON — could not parse the Claude export file.");
  }

  if (!Array.isArray(raw)) {
    throw new Error("Expected an array of conversations in the Claude export.");
  }

  const results: NormalizedConversation[] = [];

  for (const conv of raw as ClaudeConversation[]) {
    if (!conv || typeof conv !== "object") continue;

    const name = conv.name?.trim() || "Untitled conversation";
    const createdAt = parseTimestamp(conv.created_at);

    const messages: NormalizedMessage[] = [];
    const chatMessages = Array.isArray(conv.chat_messages) ? conv.chat_messages : [];

    for (const msg of chatMessages) {
      if (!msg || typeof msg !== "object") continue;
      const text = typeof msg.text === "string" ? msg.text : "";
      if (!text.trim()) continue;

      messages.push({
        role: mapRole(msg.sender),
        content: text,
        timestamp: parseTimestamp(msg.created_at),
      });
    }

    results.push({ name, createdAt, messages });
  }

  return results;
}
