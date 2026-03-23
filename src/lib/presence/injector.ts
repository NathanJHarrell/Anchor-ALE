import { onPresenceChange, type PresenceEvent } from "./tracker";
import type { PresenceState } from "../types";

// ── Rolling buffer ──────────────────────────────────────────────

const MAX_EVENTS = 10;
const eventBuffer: PresenceEvent[] = [];
let unsubscribe: (() => void) | null = null;

// ── Formatting ──────────────────────────────────────────────────

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatEvent(event: PresenceEvent): string {
  const time = formatTime(event.timestamp);
  switch (event.status) {
    case "active":
      if (eventBuffer.length <= 1) {
        return `[PRESENCE] User opened Anchor — ${time}`;
      }
      return `[PRESENCE] User returned — ${time}`;
    case "idle":
      return `[PRESENCE] User went idle — ${time}`;
    case "away":
      return `[PRESENCE] User went away — ${time}`;
    case "closed":
      return `[PRESENCE] User closed Anchor — ${time}`;
  }
}

export function generatePresenceMessages(events: PresenceEvent[]): string {
  return events.map(formatEvent).join("\n");
}

// ── Public API ──────────────────────────────────────────────────

export function startPresenceInjector(): void {
  if (unsubscribe) return;
  unsubscribe = onPresenceChange((_state: PresenceState, event: PresenceEvent) => {
    eventBuffer.push(event);
    if (eventBuffer.length > MAX_EVENTS) {
      eventBuffer.shift();
    }
  });
}

export function stopPresenceInjector(): void {
  unsubscribe?.();
  unsubscribe = null;
  eventBuffer.length = 0;
}

export function getPresenceContext(): string {
  if (eventBuffer.length === 0) return "";
  return `[PRESENCE_START]\n${generatePresenceMessages(eventBuffer)}\n[/PRESENCE_END]`;
}
