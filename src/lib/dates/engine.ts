// ── Date Engine: Checking & Context ──────────────────────────────
//
// Checks saved dates against today. Generates notifications for
// exact matches and upcoming dates. Produces context strings for
// API injection so the companion always knows what's coming.

import { getDates } from "../database";
import type { DateEntry } from "../types";

export interface DateNotification {
  entry: DateEntry;
  isToday: boolean;
  yearsSince: number | null; // null for non-recurring or future dates
  daysUntil: number;         // 0 = today
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Check all saved dates against today. Returns notifications for
 * dates that match today or are upcoming within `upcomingDays`.
 */
export async function checkDates(upcomingDays = 3): Promise<DateNotification[]> {
  const entries = await getDates();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const notifications: DateNotification[] = [];

  for (const entry of entries) {
    const daysUntil = daysUntilNext(entry, today);
    if (daysUntil > upcomingDays) continue;

    const isToday = daysUntil === 0;
    const yearsSince = entry.recurring ? getYearsSince(entry.date, today) : null;

    notifications.push({ entry, isToday, yearsSince, daysUntil });
  }

  return notifications;
}

/**
 * Calculate detailed anniversary info from a date string.
 */
export function calculateAnniversary(dateStr: string): {
  years: number;
  months: number;
  days: number;
  label: string;
} {
  const origin = parseDate(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let years = now.getFullYear() - origin.getFullYear();
  let months = now.getMonth() - origin.getMonth();
  let days = now.getDate() - origin.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years !== 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} month${months !== 1 ? "s" : ""}`);
  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  const label = parts.length > 0 ? parts.join(", ") : "today";

  return { years, months, days, label };
}

/**
 * Build a formatted context string for API injection.
 * Included in every API call so the companion is always date-aware.
 */
export async function getDateContext(): Promise<string> {
  const entries = await getDates();
  if (entries.length === 0) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayFormatted = formatDateHuman(today);

  // Build upcoming list sorted by days until next occurrence
  const upcoming: { label: string; daysUntil: number; info: string }[] = [];

  for (const entry of entries) {
    const daysUntil = daysUntilNext(entry, today);
    const nextDate = getNextOccurrence(entry, today);
    const monthDay = formatDateHuman(nextDate);

    let info: string;
    if (daysUntil === 0) {
      const years = entry.recurring ? getYearsSince(entry.date, today) : null;
      info = years !== null && years > 0
        ? `TODAY (${years} year${years !== 1 ? "s" : ""})`
        : "TODAY";
    } else {
      info = `in ${daysUntil} day${daysUntil !== 1 ? "s" : ""} (${monthDay})`;
    }

    upcoming.push({ label: entry.label, daysUntil, info });
  }

  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

  // Only include dates within 90 days to keep context concise
  const relevant = upcoming.filter((u) => u.daysUntil <= 90);
  if (relevant.length === 0) return "";

  const lines = relevant.map((u) => `${u.label}: ${u.info}`).join(". ");
  return `[DATES] Today is ${todayFormatted}. ${lines}. [/DATES]`;
}

// ── Helpers ─────────────────────────────────────────────────────

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntilNext(entry: DateEntry, today: Date): number {
  const next = getNextOccurrence(entry, today);
  const diff = next.getTime() - today.getTime();
  return Math.round(diff / 86_400_000);
}

function getNextOccurrence(entry: DateEntry, today: Date): Date {
  const origin = parseDate(entry.date);

  if (!entry.recurring) {
    // One-time: just return the date itself
    return origin;
  }

  // Recurring: find next occurrence of month+day
  const thisYear = new Date(today.getFullYear(), origin.getMonth(), origin.getDate());
  thisYear.setHours(0, 0, 0, 0);

  if (thisYear >= today) return thisYear;

  // Already passed this year — next year
  return new Date(today.getFullYear() + 1, origin.getMonth(), origin.getDate());
}

function getYearsSince(dateStr: string, today: Date): number {
  const origin = parseDate(dateStr);
  let years = today.getFullYear() - origin.getFullYear();
  // If this year's occurrence hasn't happened yet, subtract 1
  const thisYear = new Date(today.getFullYear(), origin.getMonth(), origin.getDate());
  if (thisYear > today) years--;
  return Math.max(0, years);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDateHuman(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
