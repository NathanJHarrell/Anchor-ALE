import type { NormalizedConversation, NormalizedMessage } from "../types";

/**
 * ChatGPT export uses a tree structure: each conversation has a `mapping`
 * object where keys are node IDs and values contain a `message` object
 * (or null for the root node). Messages have author.role and content.parts[].
 */
interface ChatGPTMessage {
  id: string;
  author: { role: string };
  create_time: number | null;
  content: {
    content_type: string;
    parts?: unknown[];
  };
}

interface ChatGPTNode {
  id: string;
  message: ChatGPTMessage | null;
  parent: string | null;
  children: string[];
}

interface ChatGPTConversation {
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, ChatGPTNode>;
}

function mapRole(role: string): NormalizedMessage["role"] {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  return "system";
}

function extractText(parts: unknown[]): string {
  const textParts: string[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      textParts.push(part);
    }
  }
  return textParts.join("\n");
}

/**
 * Walk the message tree from root to leaves following the first child path.
 * ChatGPT's mapping is a tree — we follow children in order to reconstruct
 * the linear conversation.
 */
function linearize(mapping: Record<string, ChatGPTNode>): ChatGPTMessage[] {
  // Find root node (no parent or parent not in mapping)
  let rootId: string | null = null;
  for (const [id, node] of Object.entries(mapping)) {
    if (!node.parent || !(node.parent in mapping)) {
      rootId = id;
      break;
    }
  }
  if (!rootId) return [];

  const messages: ChatGPTMessage[] = [];
  const visited = new Set<string>();
  const queue: string[] = [rootId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = mapping[id];
    if (!node) continue;

    if (node.message) {
      messages.push(node.message);
    }

    // Follow children in order
    for (const childId of node.children) {
      queue.push(childId);
    }
  }

  return messages;
}

export function parseChatGPTExport(jsonText: string): NormalizedConversation[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error("Invalid JSON — could not parse the ChatGPT export file.");
  }

  if (!Array.isArray(raw)) {
    throw new Error("Expected an array of conversations in the ChatGPT export.");
  }

  const results: NormalizedConversation[] = [];

  for (const conv of raw as ChatGPTConversation[]) {
    if (!conv || typeof conv !== "object") continue;

    const name = conv.title?.trim() || "Untitled conversation";
    // ChatGPT uses Unix seconds
    const createdAt = typeof conv.create_time === "number"
      ? conv.create_time * 1000
      : Date.now();

    const mapping = conv.mapping;
    if (!mapping || typeof mapping !== "object") {
      results.push({ name, createdAt, messages: [] });
      continue;
    }

    const rawMessages = linearize(mapping);
    const messages: NormalizedMessage[] = [];

    for (const msg of rawMessages) {
      const role = msg.author?.role;
      // Skip system/tool messages that aren't user or assistant
      if (role !== "user" && role !== "assistant") continue;

      const parts = msg.content?.parts;
      if (!Array.isArray(parts)) continue;

      const text = extractText(parts);
      if (!text.trim()) continue;

      const timestamp = typeof msg.create_time === "number"
        ? msg.create_time * 1000
        : createdAt;

      messages.push({
        role: mapRole(role),
        content: text,
        timestamp,
      });
    }

    results.push({ name, createdAt, messages });
  }

  return results;
}
