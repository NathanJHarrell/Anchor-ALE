// ── Care Engine: Reminder Definitions ─────────────────────────────

export type ReminderTone = "gentle" | "direct" | "playful";

export interface ReminderType {
  readonly key: string;
  readonly icon: string;
  readonly defaultMessage: string;
  /** Interval in minutes (0 = time-of-day based, see `times`) */
  readonly defaultInterval: number;
  /** Fixed times of day (HH:MM 24h). Used when defaultInterval is 0. */
  readonly times?: readonly string[];
  enabled: boolean;
}

export interface CareSettings {
  enabled: boolean;
  quietHoursStart: string;   // HH:MM
  quietHoursEnd: string;     // HH:MM
  tone: ReminderTone;
  reminders: Record<string, ReminderConfig>;
}

export interface ReminderConfig {
  enabled: boolean;
  interval: number;          // minutes (ignored for time-based)
  times: string[];           // HH:MM entries (for time-based like food/sleep)
  customMessage: string;     // empty = use default
}

export interface ScheduledReminder {
  key: string;
  icon: string;
  message: string;
  lastFired: number;         // epoch ms
  /** For whisper-created reminders */
  oneShot?: boolean;
}

// ── Built-in reminder types ──────────────────────────────────────

export const REMINDER_TYPES: readonly ReminderType[] = [
  {
    key: "hydration",
    icon: "\u{1F4A7}",
    defaultMessage: "Time for water",
    defaultInterval: 120,
    enabled: true,
  },
  {
    key: "food",
    icon: "\u{1F37D}\uFE0F",
    defaultMessage: "Have you eaten?",
    defaultInterval: 0,
    times: ["12:00", "18:00"],
    enabled: true,
  },
  {
    key: "movement",
    icon: "\u{1F6B6}",
    defaultMessage: "Stretch break",
    defaultInterval: 90,
    enabled: true,
  },
  {
    key: "sleep",
    icon: "\u{1F319}",
    defaultMessage: "Getting late",
    defaultInterval: 0,
    times: ["23:00"],
    enabled: true,
  },
  {
    key: "vault_pulse",
    icon: "\u{1F4CB}",
    defaultMessage: "Check in with the vault",
    defaultInterval: 360,
    enabled: true,
  },
] as const;

// ── Defaults ─────────────────────────────────────────────────────

export const DEFAULT_CARE_SETTINGS: CareSettings = {
  enabled: true,
  quietHoursStart: "00:00",
  quietHoursEnd: "07:00",
  tone: "gentle",
  reminders: Object.fromEntries(
    REMINDER_TYPES.map((r) => [
      r.key,
      {
        enabled: r.enabled,
        interval: r.defaultInterval,
        times: r.times ? [...r.times] : [],
        customMessage: "",
      },
    ])
  ),
};
