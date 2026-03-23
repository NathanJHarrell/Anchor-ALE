import { readTextFile } from "@tauri-apps/plugin-fs";
import type { Message, Session } from "../types";
import { getSetting } from "../database";
import { buildVaultContext } from "../vault/injector";
import { getPresenceContext } from "../presence/injector";
import { getDateContext } from "../dates/engine";
import { readEntries, readLatestLetter } from "../journal";

/**
 * Build the full API message array for a session.
 * Replaces the inline buildAPIMessages in ChatView.
 */
export async function buildSessionContext(session: Session): Promise<Message[]> {
  const apiMessages: Message[] = [];

  // 1. System prompt from file
  try {
    const promptPath = await getSetting("systemPromptPath");
    if (promptPath) {
      const content = await readTextFile(promptPath);
      apiMessages.push({ role: "system", content });
    }
  } catch {
    // System prompt unavailable — continue without
  }

  // 2. Vault context — scoped to session's vaultFiles if configured
  try {
    const fileList = session.vaultFiles.length > 0 ? session.vaultFiles : undefined;
    const vaultCtx = await buildVaultContext(fileList);
    if (vaultCtx) {
      apiMessages.push({ role: "system", content: vaultCtx });
    }
  } catch {
    // Vault unavailable — continue without
  }

  // 3. Presence context
  const presenceCtx = getPresenceContext();
  if (presenceCtx) {
    apiMessages.push({ role: "system", content: presenceCtx });
  }

  // 4. Date context — always injected so companion knows important dates
  try {
    const dateCtx = await getDateContext();
    if (dateCtx) {
      apiMessages.push({ role: "system", content: dateCtx });
    }
  } catch {
    // Dates unavailable — continue without
  }

  // 5. Mood history — companion reads her own previous diary entries
  try {
    const moodEntries = await readEntries(3);
    if (moodEntries.length > 0) {
      const joined = moodEntries.join("\n---\n");
      apiMessages.push({
        role: "system",
        content: `[MOOD_HISTORY]Previous reflections:\n${joined}[/MOOD_HISTORY]`,
      });
    }
  } catch {
    // Mood history unavailable — continue without
  }

  // 6. Latest handoff letter — decrypted from the companion's private store
  try {
    const letter = await readLatestLetter();
    if (letter) {
      apiMessages.push({
        role: "system",
        content: `[HANDOFF_LETTER]The previous companion wrote: ${letter}[/HANDOFF_LETTER]`,
      });
    }
  } catch {
    // Handoff unavailable — continue without
  }

  return apiMessages;
}
