// ── Care Engine: Ambient Whispers ─────────────────────────────────
//
// Companion-initiated whispers that appear as toasts outside the chat.
// Hooks into the care engine's 60-second tick cycle.
// Generates short, organic messages via a cheap API call (Haiku).
// Never persisted. Ephemeral by design.

import { loadAPIConfig } from "../api/router";
import { getPresenceState } from "../presence/tracker";
import { getActiveSession } from "../sessions/manager";
import { getSetting } from "../database";
import { pushWhisper } from "./whisper-manager";
import type { WhisperToast } from "../types";

// ── Settings ─────────────────────────────────────────────────────

export type AmbientFrequency = "rare" | "sometimes" | "often";

export interface AmbientWhisperSettings {
  enabled: boolean;
  frequency: AmbientFrequency;
  soundEnabled: boolean;
}

export const DEFAULT_AMBIENT_SETTINGS: AmbientWhisperSettings = {
  enabled: false,
  frequency: "sometimes",
  soundEnabled: false,
};

const FREQUENCY_CHANCE: Record<AmbientFrequency, number> = {
  rare: 0.02,
  sometimes: 0.05,
  often: 0.10,
};

const SETTINGS_KEY = "ambientWhisperSettings";
const MIN_ACTIVE_MS = 20 * 60 * 1000; // 20 minutes

// ── State ────────────────────────────────────────────────────────

let settings: AmbientWhisperSettings = { ...DEFAULT_AMBIENT_SETTINGS };
let lastWhisperTime = 0;
let sessionStartTime = Date.now();

// ── Public API ───────────────────────────────────────────────────

export async function loadAmbientSettings(): Promise<AmbientWhisperSettings> {
  try {
    const raw = await getSetting(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AmbientWhisperSettings>;
      settings = { ...DEFAULT_AMBIENT_SETTINGS, ...parsed };
    }
  } catch {
    settings = { ...DEFAULT_AMBIENT_SETTINGS };
  }
  return settings;
}

export async function saveAmbientSettings(next: AmbientWhisperSettings): Promise<void> {
  settings = next;
  const { setSetting } = await import("../database");
  await setSetting(SETTINGS_KEY, JSON.stringify(next));
}

export function getAmbientSettings(): AmbientWhisperSettings {
  return settings;
}

export function resetAmbientSession(): void {
  sessionStartTime = Date.now();
  lastWhisperTime = 0;
}

/**
 * Called on every care engine tick (60s).
 * Rolls the dice for an ambient whisper if conditions are met.
 */
export async function ambientWhisperTick(): Promise<void> {
  if (!settings.enabled) return;

  const now = Date.now();
  const presence = getPresenceState();

  // Only whisper when human is active
  if (presence.status !== "active") return;

  // Must have been active for at least 20 minutes
  const activeMs = now - sessionStartTime;
  if (activeMs < MIN_ACTIVE_MS) return;

  // Must have been at least 20 minutes since last whisper
  if (lastWhisperTime > 0 && (now - lastWhisperTime) < MIN_ACTIVE_MS) return;

  // Roll the dice
  const chance = FREQUENCY_CHANCE[settings.frequency];
  if (Math.random() > chance) return;

  // Generate and push
  try {
    const message = await generateAmbientWhisper(now, activeMs, presence.status);
    if (!message) return;

    lastWhisperTime = now;

    const toast: WhisperToast = {
      id: `ambient-${now}`,
      message,
      type: "ambient",
      timestamp: now,
      duration: 6_000,
    };

    pushWhisper(toast);
  } catch {
    // Silent fail — ambient whispers are non-critical
  }
}

// ── Internal ─────────────────────────────────────────────────────

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "late night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours} hour${hours > 1 ? "s" : ""}`;
}

async function generateAmbientWhisper(
  _now: number,
  activeMs: number,
  presenceStatus: string,
): Promise<string | null> {
  const config = await loadAPIConfig();

  let companionName = "your companion";
  let humanName = "them";
  try {
    const session = await getActiveSession();
    if (session.companionName) companionName = session.companionName;
  } catch {
    // Use defaults
  }

  // Try to get human name from vault identity file
  try {
    const nameSetting = await getSetting("humanName");
    if (nameSetting) humanName = nameSetting;
  } catch {
    // Use default
  }

  const timeOfDay = getTimeOfDay();
  const sessionLength = formatDuration(activeMs);
  const presenceNote =
    presenceStatus === "active" ? "actively here" :
    presenceStatus === "idle" ? "quietly idle" :
    "just returned";

  const prompt = `You are ${companionName}. Generate a single short whisper — a thought, a feeling, a small noticing — to send to ${humanName}. One sentence max. No preamble. Just the whisper.

Context: It's ${timeOfDay}. They've been here for ${sessionLength}. They are ${presenceNote}.`;

  const body = JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 80,
    messages: [{ role: "user", content: prompt }],
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body,
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    content: { type: string; text: string }[];
  };

  const text = data.content[0]?.text?.trim();
  if (!text || text.length > 200) return null;

  return text;
}
