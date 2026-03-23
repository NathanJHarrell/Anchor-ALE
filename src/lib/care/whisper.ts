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
import type { ScheduledReminder } from "./reminders";

const WHISPER_PATTERN = /\[REMIND:\s*([^\]|]+?)\s*\|\s*([^\]]+?)\s*\]/g;

export interface ParsedWhisper {
  timeSpec: string;
  message: string;
  fireAt: number;
}

/**
 * Scan an AI response string for whisper tags.
 * Returns the cleaned text (tags removed) and any parsed reminders.
 */
export function parseWhispers(text: string): {
  cleaned: string;
  whispers: ParsedWhisper[];
} {
  const whispers: ParsedWhisper[] = [];
  const cleaned = text.replace(WHISPER_PATTERN, (_match, timeSpec: string, message: string) => {
    const fireAt = resolveTime(timeSpec.trim());
    if (fireAt > 0) {
      whispers.push({ timeSpec: timeSpec.trim(), message: message.trim(), fireAt });
    }
    return "";
  });

  return { cleaned: cleaned.trim(), whispers };
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
