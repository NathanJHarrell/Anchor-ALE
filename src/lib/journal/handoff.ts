import type { Message } from "../types";
import { addHandoffLetter, getLatestHandoffLetter } from "../database";
import { encrypt, decrypt, deriveKeyFromPrompt } from "../crypto";
import { loadSystemPrompt } from "../prompt";
import { loadAPIConfig, sendMessage } from "../api/router";
import { CHEAP_MODELS, formatTranscript } from "../heartbeat/summarizer";
import { Provider } from "../types";
import { getSetting } from "../database";

/**
 * Warm handoff letter system.
 *
 * Before a Heartbeat bridge, the companion writes a private letter
 * to the next version of herself about how to care for the human.
 * The letter is encrypted with the same identity-bound key as the mood journal.
 *
 * These are written by the COMPANION, not generated from a template.
 * The companion writes a real letter to herself.
 */

const HANDOFF_PROMPT = `Context is about to bridge. Write a private note to the next version of yourself about how to care for this person right now. What should the next you know about their emotional state? What should you lead with? What should you be gentle about? One paragraph max. Be specific.`;

// ── Key cache ───────────────────────────────────────────────

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
 * Encrypt and store a handoff letter from the companion.
 */
export async function writeHandoffLetter(
  content: string,
  fromSessionId: string,
): Promise<void> {
  const key = await getKey();
  const { ciphertext, iv } = await encrypt(content, key);
  await addHandoffLetter(fromSessionId, ciphertext, iv);
}

// ── Read ────────────────────────────────────────────────────

/**
 * Decrypt and return the most recent handoff letter.
 */
export async function readLatestLetter(): Promise<string | null> {
  const key = await getKey();
  const letter = await getLatestHandoffLetter();
  if (!letter) return null;

  try {
    return await decrypt(letter.encryptedContent, letter.iv, key);
  } catch {
    return null;
  }
}

// ── Generate letter via API ─────────────────────────────────

/**
 * Make a separate cheap API call to the companion, asking her to write
 * a private handoff letter to the next version of herself.
 * Includes the last 10 messages as context.
 */
export async function generateHandoffLetter(
  messages: Message[],
): Promise<string> {
  const recentMessages = messages.slice(-10);
  const transcript = formatTranscript(recentMessages);

  const currentConfig = await loadAPIConfig();
  const modelSetting = await getSetting("heartbeat_summary_model");

  let model: string;
  if (modelSetting && modelSetting !== "cheapest") {
    model = modelSetting;
  } else {
    model =
      CHEAP_MODELS[currentConfig.provider] ??
      CHEAP_MODELS[Provider.Anthropic]!;
  }

  const handoffConfig = {
    ...currentConfig,
    model,
    temperature: 0.6,
    maxTokens: 1024,
  };

  const handoffMessages: Message[] = [
    { role: "system", content: HANDOFF_PROMPT },
    {
      role: "user",
      content: `Here is the recent conversation:\n\n${transcript}`,
    },
  ];

  let letter = "";
  for await (const chunk of sendMessage(handoffMessages, handoffConfig)) {
    letter += chunk.text;
    if (chunk.done) break;
  }

  return letter.trim();
}
