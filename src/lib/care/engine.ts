// ── Care Engine: Main Loop ────────────────────────────────────────
//
// Runs independently of chat on a 60-second interval.
// Checks each enabled reminder against its schedule and fires when due.
// Minimal resource usage — no logging of reminder interactions.

import { getSetting, setSetting } from "../database";
import {
  REMINDER_TYPES,
  DEFAULT_CARE_SETTINGS,
  type CareSettings,
  type ScheduledReminder,
  type ReminderConfig,
} from "./reminders";
import { checkDates, type DateNotification } from "../dates/engine";
import { ambientWhisperTick } from "./ambient-whisper";

export type CareNotification = {
  id: string;
  icon: string;
  message: string;
  timestamp: number;
};

type NotificationCallback = (notification: CareNotification) => void;

// ── State ────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let listeners: NotificationCallback[] = [];
let scheduled: Map<string, ScheduledReminder> = new Map();
let settings: CareSettings = { ...DEFAULT_CARE_SETTINGS };
let whisperReminders: ScheduledReminder[] = [];

// Track last date check — only check once per day (resets on restart, which is fine)
let lastDateCheckDay = -1;

const TICK_MS = 60_000;
const SETTINGS_KEY = "careSettings";

// ── Public API ───────────────────────────────────────────────────

export function onCareNotification(cb: NotificationCallback): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export async function startCareEngine(): Promise<void> {
  if (timer) return;
  await loadCareSettings();
  initScheduled();
  timer = setInterval(tick, TICK_MS);
  // Run first tick immediately
  tick();
}

export function stopCareEngine(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  listeners = [];
  scheduled.clear();
  whisperReminders = [];
  lastDateCheckDay = -1;
}

export function isCareEngineRunning(): boolean {
  return timer !== null;
}

export async function reloadCareSettings(): Promise<void> {
  await loadCareSettings();
  initScheduled();
}

export function getCareSettings(): CareSettings {
  return settings;
}

export async function saveCareSettings(next: CareSettings): Promise<void> {
  settings = next;
  await setSetting(SETTINGS_KEY, JSON.stringify(next));
  initScheduled();
}

/** Add a one-shot whisper reminder from the AI */
export function addWhisperReminder(reminder: ScheduledReminder): void {
  whisperReminders.push(reminder);
}

// ── Internal ─────────────────────────────────────────────────────

async function loadCareSettings(): Promise<void> {
  const raw = await getSetting(SETTINGS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<CareSettings>;
      settings = { ...DEFAULT_CARE_SETTINGS, ...parsed };
    } catch {
      settings = { ...DEFAULT_CARE_SETTINGS };
    }
  }
}

function initScheduled(): void {
  scheduled.clear();
  for (const rt of REMINDER_TYPES) {
    const cfg: ReminderConfig | undefined = settings.reminders[rt.key];
    if (!cfg?.enabled) continue;
    scheduled.set(rt.key, {
      key: rt.key,
      icon: rt.icon,
      message: cfg.customMessage || rt.defaultMessage,
      lastFired: 0,
    });
  }
}

function tick(): void {
  if (!settings.enabled) return;

  const now = Date.now();
  const nowDate = new Date(now);
  const currentHHMM = formatHHMM(nowDate);

  if (isQuietHours(currentHHMM)) return;

  // Check interval-based and time-based reminders
  for (const [key, sr] of scheduled) {
    const cfg = settings.reminders[key];
    if (!cfg) continue;

    if (cfg.interval > 0) {
      // Interval-based: check if enough time has passed
      const elapsed = now - sr.lastFired;
      if (elapsed >= cfg.interval * 60_000) {
        fire(sr, now);
      }
    } else if (cfg.times.length > 0) {
      // Time-based: check if current time matches any configured time
      // Fire if within 1-minute window and hasn't fired in this window
      for (const t of cfg.times) {
        if (isWithinMinute(currentHHMM, t) && !firedInWindow(sr, now)) {
          fire(sr, now);
          break;
        }
      }
    }
  }

  // Check whisper reminders (one-shot)
  const remaining: ScheduledReminder[] = [];
  for (const wr of whisperReminders) {
    const elapsed = now - wr.lastFired;
    if (elapsed <= 0) {
      // lastFired is set to the target fire time for whisper reminders
      remaining.push(wr);
    } else {
      // Time has passed the target — fire it
      fire(wr, now);
    }
  }
  whisperReminders = remaining;

  // Date checks — once per day only
  const todayDay = nowDate.getDate();
  if (todayDay !== lastDateCheckDay) {
    lastDateCheckDay = todayDay;
    void runDateChecks(now);
  }

  // Ambient whisper check
  void ambientWhisperTick();
}

async function runDateChecks(now: number): Promise<void> {
  try {
    const notifications = await checkDates(3);
    for (const dn of notifications) {
      fireDateNotification(dn, now);
    }
  } catch {
    // Date check failed — will retry next day
  }
}

function fireDateNotification(dn: DateNotification, now: number): void {
  let icon: string;
  let message: string;

  if (dn.isToday) {
    icon = "\u{1F389}"; // 🎉
    const yearsPart = dn.yearsSince !== null && dn.yearsSince > 0
      ? ` Today marks ${dn.yearsSince} year${dn.yearsSince !== 1 ? "s" : ""}.`
      : "";
    message = `Happy ${dn.entry.type}! ${dn.entry.label}.${yearsPart}`;
  } else {
    icon = "\u{1F4C5}"; // 📅
    message = `${dn.entry.label} is in ${dn.daysUntil} day${dn.daysUntil !== 1 ? "s" : ""}.`;
  }

  const notification: CareNotification = {
    id: `date-${dn.entry.id}-${now}`,
    icon,
    message,
    timestamp: now,
  };
  for (const cb of listeners) {
    cb(notification);
  }
}

function fire(sr: ScheduledReminder, now: number): void {
  sr.lastFired = now;
  const notification: CareNotification = {
    id: `${sr.key}-${now}`,
    icon: sr.icon,
    message: sr.message,
    timestamp: now,
  };
  for (const cb of listeners) {
    cb(notification);
  }
}

function isQuietHours(current: string): boolean {
  const { quietHoursStart, quietHoursEnd } = settings;
  if (quietHoursStart === quietHoursEnd) return false;

  if (quietHoursStart < quietHoursEnd) {
    // Same-day range: e.g. 22:00 - 23:00 (doesn't wrap midnight)
    // Actually this is normal range
    return current >= quietHoursStart && current < quietHoursEnd;
  }
  // Wraps midnight: e.g. 23:00 - 07:00
  return current >= quietHoursStart || current < quietHoursEnd;
}

function formatHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isWithinMinute(current: string, target: string): boolean {
  return current === target;
}

function firedInWindow(sr: ScheduledReminder, now: number): boolean {
  // Consider "window" as 2 minutes to avoid double-firing
  return now - sr.lastFired < 120_000;
}
