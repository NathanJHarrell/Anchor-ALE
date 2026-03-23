import type { NormalizedConversation, ImportOptions, ImportResult } from "../types";
import { createSession, listSessions } from "../database";
import { saveMessage } from "../sessions/persistence";

export type ProgressCallback = (current: number, total: number, name: string) => void;

/**
 * Import normalized conversations into Anchor's session system.
 * Creates a project session for each conversation and saves all messages
 * using the persistence layer so they're immediately searchable.
 */
export async function importConversations(
  parsed: NormalizedConversation[],
  options: ImportOptions,
  onProgress?: ProgressCallback,
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  // Build a set of existing session names for deduplication
  let existingNames: Set<string> | null = null;
  if (options.deduplicate) {
    const sessions = await listSessions();
    existingNames = new Set(sessions.map((s) => s.name.toLowerCase()));
  }

  const total = parsed.length;

  for (let i = 0; i < total; i++) {
    const conv = parsed[i]!;
    onProgress?.(i + 1, total, conv.name);

    // Skip empty conversations
    if (options.skipEmpty && conv.messages.length === 0) {
      result.skipped++;
      continue;
    }

    // Skip duplicates
    if (existingNames?.has(conv.name.toLowerCase())) {
      result.skipped++;
      continue;
    }

    try {
      // Create a new project session (don't set active — bulk import)
      const session = await createSession(conv.name, "project");

      // Determine how many messages to import
      const limit = options.maxMessagesPerSession > 0
        ? Math.min(conv.messages.length, options.maxMessagesPerSession)
        : conv.messages.length;

      // Save messages in order, preserving original timestamps
      for (let j = 0; j < limit; j++) {
        const msg = conv.messages[j]!;
        await saveMessage(
          session.id,
          { role: msg.role, content: msg.content, timestamp: msg.timestamp },
          msg.timestamp,
        );
      }

      // Track name so we don't create duplicates within the same batch
      existingNames?.add(conv.name.toLowerCase());
      result.imported++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      result.errors.push(`"${conv.name}": ${errMsg}`);
    }

    // Yield to event loop every 5 conversations to keep UI responsive
    if (i % 5 === 4) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return result;
}
