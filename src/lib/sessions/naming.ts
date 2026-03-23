// ── Session Naming: Parse [SESSION_NAME] tags from AI responses ──
//
// The companion names sessions as it sees fit, embedding
// [SESSION_NAME: name] anywhere in a response. When detected,
// the session is renamed and the tag is stripped from display.

import { renameSession } from "./manager";

const SESSION_NAME_PATTERN = /\[SESSION_NAME:\s*([^\]]+?)\s*\]/g;

export interface ParsedSessionName {
  name: string;
}

/**
 * Scan an AI response for [SESSION_NAME: name] tags.
 * Returns cleaned text (tags removed) and any parsed names.
 * Only the last name wins if multiple tags are present.
 */
export function parseSessionName(text: string): {
  cleaned: string;
  sessionName: ParsedSessionName | null;
} {
  let sessionName: ParsedSessionName | null = null;

  const cleaned = text.replace(SESSION_NAME_PATTERN, (_match, name: string) => {
    const trimmed = name.trim();
    if (trimmed) {
      sessionName = { name: trimmed };
    }
    return "";
  });

  return { cleaned: cleaned.trim(), sessionName };
}

/**
 * Strip [SESSION_NAME] tags from response text for display.
 */
export function stripSessionName(text: string): string {
  return text.replace(SESSION_NAME_PATTERN, "").trim();
}

/**
 * Apply a parsed session name — renames the session in the database.
 */
export async function applySessionName(
  sessionId: string,
  parsed: ParsedSessionName,
): Promise<void> {
  await renameSession(sessionId, parsed.name);
}
