import { readTextFile } from "@tauri-apps/plugin-fs";
import type { Message, Session } from "../types";
import { getSetting } from "../database";
import { getHandoffLetter } from "../database";
import { buildVaultContext } from "../vault/injector";
import { getPresenceContext } from "../presence/injector";
import { getDateContext } from "../dates/engine";

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

  // 5. Latest handoff letter for this session (if any)
  try {
    const handoff = await getHandoffLetter(session.id);
    if (handoff && handoff.summaryContext) {
      apiMessages.push({
        role: "system",
        content: `[Handoff context from previous session]\n${handoff.summaryContext}`,
      });
    }
  } catch {
    // Handoff unavailable — continue without
  }

  return apiMessages;
}
