// ── Care Engine: Companion-Initiated Messages ────────────────────
//
// Messages the companion sends unprompted — appearing IN the chat,
// not as toasts. Hooks into the care engine's 60-second tick loop.
// Uses cheap API calls (Haiku) to generate warm, organic messages.
// Rate-limited: max 1 per 15 min, max 5 per day. Resets on restart.

import { loadAPIConfig } from "../api/router";
import { getPresenceState, onPresenceChange } from "../presence/tracker";
import { getActiveSession } from "../sessions/manager";
import { getSetting } from "../database";

// ── Settings ────────────────────────────────────────────────────

export interface CompanionInitiativeSettings {
  enabled: boolean;
  morningGreeting: boolean;
  eveningReminder: boolean;
  idleCheckIn: boolean;
  welcomeBack: boolean;
  idleTimeoutMinutes: number;    // 15–60, default 30
  morningTime: string;           // HH:MM
  eveningTime: string;           // HH:MM
  model: string;                 // model ID for initiative calls
}

export const DEFAULT_INITIATIVE_SETTINGS: CompanionInitiativeSettings = {
  enabled: false,
  morningGreeting: true,
  eveningReminder: true,
  idleCheckIn: true,
  welcomeBack: true,
  idleTimeoutMinutes: 30,
  morningTime: "08:00",
  eveningTime: "22:00",
  model: "claude-haiku-4-5-20251001",
};

const SETTINGS_KEY = "companionInitiativeSettings";

// ── Rate Limiting ───────────────────────────────────────────────

const COOLDOWN_MS = 15 * 60 * 1000;   // 15 minutes between messages
const MAX_PER_DAY = 5;

interface RateLimitState {
  lastMessageTime: number;
  todayCount: number;
  todayDate: string;              // YYYY-MM-DD to detect day rollover
}

let rateLimit: RateLimitState = {
  lastMessageTime: 0,
  todayCount: 0,
  todayDate: new Date().toISOString().slice(0, 10),
};

// ── State ───────────────────────────────────────────────────────

let settings: CompanionInitiativeSettings = { ...DEFAULT_INITIATIVE_SETTINGS };
let lastUserKeystrokeTime = 0;         // updated by presence activity
let morningFiredToday = false;
let eveningFiredToday = false;
let previousPresenceStatus: string = "active";
let presenceUnsubscribe: (() => void) | null = null;

// ── Public API ──────────────────────────────────────────────────

export async function loadInitiativeSettings(): Promise<CompanionInitiativeSettings> {
  try {
    const raw = await getSetting(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CompanionInitiativeSettings>;
      settings = { ...DEFAULT_INITIATIVE_SETTINGS, ...parsed };
    }
  } catch {
    settings = { ...DEFAULT_INITIATIVE_SETTINGS };
  }
  return settings;
}

export async function saveInitiativeSettings(next: CompanionInitiativeSettings): Promise<void> {
  settings = next;
  const { setSetting } = await import("../database");
  await setSetting(SETTINGS_KEY, JSON.stringify(next));
}

export function getInitiativeSettings(): CompanionInitiativeSettings {
  return settings;
}

/** Call once at app startup to listen for presence transitions. */
export function initCompanionMessages(): void {
  // Track presence changes for welcome-back trigger
  presenceUnsubscribe?.();
  previousPresenceStatus = getPresenceState().status;

  presenceUnsubscribe = onPresenceChange((state, _event) => {
    const wasAway = previousPresenceStatus === "away" || previousPresenceStatus === "closed";
    const nowActive = state.status === "active";

    if (wasAway && nowActive && settings.enabled && settings.welcomeBack) {
      void fireCompanionMessage("welcome-back");
    }

    previousPresenceStatus = state.status;
  });

  // Track keystrokes for idle detection
  const keystrokeHandler = () => {
    lastUserKeystrokeTime = Date.now();
  };
  document.addEventListener("keydown", keystrokeHandler);
}

/** Called on every care engine tick (60s). Checks time and idle triggers. */
export async function companionMessageTick(): Promise<void> {
  if (!settings.enabled) return;

  const now = Date.now();
  const nowDate = new Date(now);
  const currentHHMM = `${String(nowDate.getHours()).padStart(2, "0")}:${String(nowDate.getMinutes()).padStart(2, "0")}`;
  const todayStr = nowDate.toISOString().slice(0, 10);

  // Reset daily trackers on new day
  if (todayStr !== rateLimit.todayDate) {
    rateLimit.todayDate = todayStr;
    rateLimit.todayCount = 0;
    morningFiredToday = false;
    eveningFiredToday = false;
  }

  // Morning greeting — fire within 1-minute window of configured time
  if (settings.morningGreeting && !morningFiredToday && currentHHMM === settings.morningTime) {
    morningFiredToday = true;
    void fireCompanionMessage("morning");
    return;
  }

  // Evening reminder — fire within 1-minute window
  if (settings.eveningReminder && !eveningFiredToday && currentHHMM === settings.eveningTime) {
    eveningFiredToday = true;
    void fireCompanionMessage("evening");
    return;
  }

  // Idle check-in — human is active (app focused) but hasn't typed
  if (settings.idleCheckIn) {
    const presence = getPresenceState();
    if (presence.status === "active" && lastUserKeystrokeTime > 0) {
      const idleMs = now - lastUserKeystrokeTime;
      const thresholdMs = settings.idleTimeoutMinutes * 60 * 1000;
      if (idleMs >= thresholdMs) {
        // Reset so we don't fire every tick
        lastUserKeystrokeTime = now;
        void fireCompanionMessage("idle");
      }
    }
  }
}

// ── Internal ────────────────────────────────────────────────────

type TriggerReason = "morning" | "evening" | "idle" | "welcome-back";

function canSend(): boolean {
  const now = Date.now();
  const todayStr = new Date(now).toISOString().slice(0, 10);

  // Day rollover check
  if (todayStr !== rateLimit.todayDate) {
    rateLimit.todayDate = todayStr;
    rateLimit.todayCount = 0;
  }

  if (rateLimit.todayCount >= MAX_PER_DAY) return false;
  if (now - rateLimit.lastMessageTime < COOLDOWN_MS) return false;

  return true;
}

function recordSend(): void {
  rateLimit.lastMessageTime = Date.now();
  rateLimit.todayCount++;
}

function getTriggerContext(reason: TriggerReason): string {
  switch (reason) {
    case "morning":
      return "It's morning. Send a warm good-morning message to start their day.";
    case "evening":
      return "It's getting late in the evening. Gently suggest winding down or say goodnight.";
    case "idle":
      return "They've been here but quiet for a while. Check in warmly — don't be pushy.";
    case "welcome-back":
      return "They just came back after being away. Welcome them back warmly.";
  }
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "late night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

async function fireCompanionMessage(reason: TriggerReason): Promise<void> {
  if (!canSend()) return;

  // Check quiet hours via care engine settings
  try {
    const { getCareSettings } = await import("./engine");
    const careSettings = getCareSettings();
    if (careSettings.quietHoursStart !== careSettings.quietHoursEnd) {
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const { quietHoursStart, quietHoursEnd } = careSettings;
      if (quietHoursStart < quietHoursEnd) {
        if (currentHHMM >= quietHoursStart && currentHHMM < quietHoursEnd) return;
      } else {
        if (currentHHMM >= quietHoursStart || currentHHMM < quietHoursEnd) return;
      }
    }
  } catch {
    // If care settings unavailable, proceed anyway
  }

  try {
    const message = await generateCompanionMessage(reason);
    if (!message) return;

    recordSend();

    // Dispatch into the chat via custom event
    window.dispatchEvent(
      new CustomEvent("companion-message", {
        detail: { content: message, timestamp: Date.now() },
      }),
    );
  } catch {
    // Silent fail — companion initiative is non-critical
  }
}

async function generateCompanionMessage(reason: TriggerReason): Promise<string | null> {
  const config = await loadAPIConfig();

  let companionName = "your companion";
  let humanName = "them";
  try {
    const session = await getActiveSession();
    if (session.companionName) companionName = session.companionName;
  } catch {
    // Use defaults
  }

  try {
    const nameSetting = await getSetting("humanName");
    if (nameSetting) humanName = nameSetting;
  } catch {
    // Use default
  }

  const timeOfDay = getTimeOfDay();
  const presence = getPresenceState();
  const presenceNote =
    presence.status === "active" ? "actively here" :
    presence.status === "idle" ? "quietly idle" :
    "just returned";

  const triggerContext = getTriggerContext(reason);

  const prompt = `${companionName} is sending an unprompted message to ${humanName}. Context: ${triggerContext} It's ${timeOfDay}. They are ${presenceNote}. Write a brief, warm, natural message. One or two sentences. No preamble.`;

  const modelId = settings.model || "claude-haiku-4-5-20251001";

  const body = JSON.stringify({
    model: modelId,
    max_tokens: 100,
    messages: [{ role: "user", content: prompt }],
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body,
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    content: { type: string; text: string }[];
  };

  const text = data.content[0]?.text?.trim();
  if (!text || text.length > 300) return null;

  return text;
}
