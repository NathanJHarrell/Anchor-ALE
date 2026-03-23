// ── Phone Whisper Manager ─────────────────────────────────────────
//
// Decides when to route whispers to the phone instead of toast.
// When the app window is NOT focused (away/idle/closed), whispers
// go to the phone via ntfy.sh. When focused, they go to toast.
//
// Cooldown: max 1 phone notification per 10 minutes to avoid spam.

import { invoke } from "@tauri-apps/api/core";
import { getPresenceState } from "../presence/tracker";
import { getSetting, setSetting } from "../database";
import { sendToPhone } from "./phone";

// ── Types ────────────────────────────────────────────────────────

export interface PhoneWhisperSettings {
  enabled: boolean;
  topic: string; // encrypted in storage
}

export interface PhoneWhisperHistoryEntry {
  message: string;
  timestamp: number;
  success: boolean;
}

const DEFAULT_SETTINGS: PhoneWhisperSettings = {
  enabled: false,
  topic: "",
};

const SETTINGS_KEY = "phoneWhisperSettings";
const TOPIC_KEY = "phoneWhisperTopic";
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// ── State ────────────────────────────────────────────────────────

let settings: PhoneWhisperSettings = { ...DEFAULT_SETTINGS };
let lastPhoneSendTime = 0;
let lastSuccessTime = 0;
const history: PhoneWhisperHistoryEntry[] = [];
const MAX_HISTORY = 5;

// ── Public API ───────────────────────────────────────────────────

export async function loadPhoneWhisperSettings(): Promise<PhoneWhisperSettings> {
  try {
    const raw = await getSetting(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { enabled?: boolean };
      settings.enabled = parsed.enabled ?? false;
    }

    const encryptedTopic = await getSetting(TOPIC_KEY);
    if (encryptedTopic) {
      settings.topic = await invoke<string>("decrypt_string", { ciphertext: encryptedTopic });
    }
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  return { ...settings };
}

export async function savePhoneWhisperSettings(next: PhoneWhisperSettings): Promise<void> {
  settings = { ...next };

  await setSetting(SETTINGS_KEY, JSON.stringify({ enabled: next.enabled }));

  if (next.topic) {
    const encrypted = await invoke<string>("encrypt_string", { plaintext: next.topic });
    await setSetting(TOPIC_KEY, encrypted);
  } else {
    await setSetting(TOPIC_KEY, "");
  }
}

export function getPhoneWhisperSettings(): PhoneWhisperSettings {
  return { ...settings };
}

export function getPhoneWhisperHistory(): PhoneWhisperHistoryEntry[] {
  return [...history];
}

export function getLastSuccessTime(): number {
  return lastSuccessTime;
}

/**
 * Check if a whisper should go to the phone.
 * Returns true if the app is not focused and phone whispers are enabled.
 */
export function shouldSendToPhone(): boolean {
  if (!settings.enabled || !settings.topic) return false;

  const presence = getPresenceState();
  return presence.status === "away" || presence.status === "idle" || presence.status === "closed";
}

/**
 * Try to send a whisper to the phone. Respects cooldown.
 * Returns true if the message was sent (or attempted).
 * Returns false if on cooldown or disabled.
 */
export async function trySendToPhone(message: string): Promise<boolean> {
  if (!settings.enabled || !settings.topic) return false;

  const now = Date.now();
  if (now - lastPhoneSendTime < COOLDOWN_MS) return false;

  lastPhoneSendTime = now;

  const success = await sendToPhone(message, settings.topic);

  if (success) {
    lastSuccessTime = now;
  }

  // Track history (in-memory only, capped at 5)
  history.unshift({ message, timestamp: now, success });
  if (history.length > MAX_HISTORY) {
    history.pop();
  }

  return success;
}

/**
 * Force-send to phone, ignoring cooldown and focus state.
 * Used for [PHONE: message] tags from the companion.
 */
export async function forceSendToPhone(message: string): Promise<boolean> {
  if (!settings.topic) return false;

  const now = Date.now();
  const success = await sendToPhone(message, settings.topic);

  if (success) {
    lastSuccessTime = now;
  }

  history.unshift({ message, timestamp: now, success });
  if (history.length > MAX_HISTORY) {
    history.pop();
  }

  return success;
}
