// ── Care Engine: Whisper Interface ────────────────────────────────
//
// Parses AI responses for [REMIND: time | message] tags and
// schedules them in the care engine.
//
// Supported time formats:
//   Xm  — minutes from now (e.g. 30m)
//   Xh  — hours from now (e.g. 2h)
//   HH:MM — specific time today (or tomorrow if already past)

import { addWhisperReminder } from "./engine";
import { pushWhisper } from "./whisper-manager";
import type { ScheduledReminder } from "./reminders";
import type { WhisperToast } from "../types";

const REMIND_PATTERN = /\[REMIND:\s*([^\]|]+?)\s*\|\s*([^\]]+?)\s*\]/g;
const WHISPER_PATTERN = /\[WHISPER:\s*([^\]]+?)\s*\]/g;

export interface ParsedWhisper {
  timeSpec: string;
  message: string;
  fireAt: number;
}

export interface ParsedImmediateWhisper {
  message: string;
}

/**
 * Scan an AI response string for whisper tags.
 * Returns the cleaned text (tags removed), parsed reminders, and immediate whispers.
 *
 * [REMIND: time | message] — scheduled reminder (existing behavior)
 * [WHISPER: message]        — immediate toast, fires right now
 */
export function parseWhispers(text: string): {
  cleaned: string;
  whispers: ParsedWhisper[];
  immediateWhispers: ParsedImmediateWhisper[];
} {
  const whispers: ParsedWhisper[] = [];
  const immediateWhispers: ParsedImmediateWhisper[] = [];

  // Strip [REMIND: ...] tags
  let cleaned = text.replace(REMIND_PATTERN, (_match, timeSpec: string, message: string) => {
    const fireAt = resolveTime(timeSpec.trim());
    if (fireAt > 0) {
      whispers.push({ timeSpec: timeSpec.trim(), message: message.trim(), fireAt });
    }
    return "";
  });

  // Strip [WHISPER: ...] tags
  cleaned = cleaned.replace(WHISPER_PATTERN, (_match, message: string) => {
    immediateWhispers.push({ message: message.trim() });
    return "";
  });

  return { cleaned: cleaned.trim(), whispers, immediateWhispers };
}

/**
 * Fire immediate whispers as toasts. Call after parseWhispers().
 */
export function fireImmediateWhispers(whispers: ParsedImmediateWhisper[]): void {
  const now = Date.now();
  for (const w of whispers) {
    const toast: WhisperToast = {
      id: `companion-${now}-${Math.random().toString(36).slice(2, 8)}`,
      message: w.message,
      type: "companion",
      timestamp: now,
      duration: 6_000,
    };
    pushWhisper(toast);
  }
}

/**
 * Schedule all parsed whispers in the care engine.
 */
export function scheduleWhispers(whispers: ParsedWhisper[]): void {
  for (const w of whispers) {
    const sr: ScheduledReminder = {
      key: `whisper-${w.fireAt}`,
      icon: "\u{1F4AC}",
      message: w.message,
      lastFired: w.fireAt,   // engine treats this as target time
      oneShot: true,
    };
    addWhisperReminder(sr);
  }
}

// ── Time resolution ──────────────────────────────────────────────

function resolveTime(spec: string): number {
  const now = Date.now();

  // Xm — minutes
  const minMatch = /^(\d+)\s*m$/i.exec(spec);
  if (minMatch) {
    return now + parseInt(minMatch[1]!, 10) * 60_000;
  }

  // Xh — hours
  const hourMatch = /^(\d+)\s*h$/i.exec(spec);
  if (hourMatch) {
    return now + parseInt(hourMatch[1]!, 10) * 3_600_000;
  }

  // HH:MM — specific time
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(spec);
  if (timeMatch) {
    const target = new Date();
    target.setHours(parseInt(timeMatch[1]!, 10), parseInt(timeMatch[2]!, 10), 0, 0);
    // If already past, schedule for tomorrow
    if (target.getTime() <= now) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  return -1;
}
