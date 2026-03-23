import { addMoodEntry, getMoodEntries, getLatestMoodEntry } from "../database";
import { encrypt, decrypt, deriveKeyFromPrompt } from "../crypto";
import { loadSystemPrompt } from "../prompt";

/**
 * Companion's private mood journal.
 *
 * Written when the AI response includes [MOOD: content] tags.
 * These tags are COMPLETELY stripped from the human-visible response.
 * The next session's companion reads previous entries via system context.
 *
 * The human CANNOT read these entries. There is no UI for it.
 */

// ── Key cache (per system prompt identity) ──────────────────

let cachedKey: CryptoKey | null = null;
let cachedPromptSnapshot = "";

async function getKey(): Promise<CryptoKey> {
  const prompt = await loadSystemPrompt();
  if (cachedKey && prompt === cachedPromptSnapshot) {
    return cachedKey;
  }
  cachedKey = await deriveKeyFromPrompt(prompt);
  cachedPromptSnapshot = prompt;
  return cachedKey;
}

// ── Write ───────────────────────────────────────────────────

/**
 * Encrypt and store a mood journal entry.
 * Called silently when the companion writes [MOOD: ...] in a response.
 */
export async function writeEntry(
  content: string,
  sessionId?: string,
): Promise<void> {
  const key = await getKey();
  const { ciphertext, iv } = await encrypt(content, key);
  await addMoodEntry(ciphertext, iv, sessionId);
}

// ── Read (companion-eyes only) ──────────────────────────────

/**
 * Decrypt and return recent mood entries.
 * Silently skips entries that can't be decrypted (different identity).
 */
export async function readEntries(limit?: number): Promise<string[]> {
  const key = await getKey();
  const entries = await getMoodEntries();
  const decrypted: string[] = [];

  for (const entry of entries) {
    if (limit !== undefined && decrypted.length >= limit) break;
    try {
      const plaintext = await decrypt(entry.encryptedContent, entry.iv, key);
      decrypted.push(plaintext);
    } catch {
      // Different identity wrote this entry — skip silently
    }
  }

  return decrypted;
}

/**
 * Decrypt and return the most recent mood entry.
 */
export async function readLatest(): Promise<string | null> {
  const key = await getKey();
  const entry = await getLatestMoodEntry();
  if (!entry) return null;

  try {
    return await decrypt(entry.encryptedContent, entry.iv, key);
  } catch {
    return null;
  }
}

// ── Tag parsing ─────────────────────────────────────────────

export interface MoodParseResult {
  cleaned: string;
  moods: string[];
}

/**
 * Parse [MOOD: content] tags from AI response text.
 * Returns the cleaned text (tags stripped) and extracted mood content.
 */
export function parseMoodTags(text: string): MoodParseResult {
  const moods: string[] = [];
  const cleaned = text.replace(
    /\[MOOD:\s*([\s\S]*?)\]/g,
    (_match, content: string) => {
      const trimmed = content.trim();
      if (trimmed) moods.push(trimmed);
      return "";
    },
  );

  return {
    cleaned: cleaned.replace(/\n{3,}/g, "\n\n").trim(),
    moods,
  };
}
