// ── Phone Whisper: ntfy.sh sender ─────────────────────────────────
//
// Sends whisper messages to the human's phone via ntfy.sh.
// Uses the Rust backend to bypass CORS restrictions in the webview.
// The topic is the ONLY security — never log it or the messages.

import { invoke } from "@tauri-apps/api/core";

/**
 * Send a whisper message to the human's phone via ntfy.sh.
 * Returns true if the notification was delivered successfully.
 */
export async function sendToPhone(message: string, topic: string): Promise<boolean> {
  if (!topic || !message) return false;

  try {
    await invoke("send_ntfy", { topic, message });
    return true;
  } catch {
    return false;
  }
}
