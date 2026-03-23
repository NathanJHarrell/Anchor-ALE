// ── Whisper Toast Manager ─────────────────────────────────────────
//
// Manages ephemeral toast notifications for whispers.
// Max 2 visible at once, auto-dismiss, in-memory history only.

import type { WhisperToast } from "../types";

type WhisperCallback = (toasts: WhisperToast[]) => void;

const MAX_VISIBLE = 2;
const DEFAULT_DURATION_MS = 6_000;

let visible: WhisperToast[] = [];
let history: WhisperToast[] = [];
let listeners: WhisperCallback[] = [];
let dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Public API ───────────────────────────────────────────────────

/** Push a new whisper toast. Oldest dismissed if at max. */
export function pushWhisper(toast: WhisperToast): void {
  history.push(toast);

  // Evict oldest if at capacity
  while (visible.length >= MAX_VISIBLE) {
    const oldest = visible.shift();
    if (oldest) {
      const timer = dismissTimers.get(oldest.id);
      if (timer) {
        clearTimeout(timer);
        dismissTimers.delete(oldest.id);
      }
    }
  }

  visible.push(toast);

  const duration = toast.duration > 0 ? toast.duration : DEFAULT_DURATION_MS;
  const timer = setTimeout(() => {
    dismissWhisper(toast.id);
  }, duration);
  dismissTimers.set(toast.id, timer);

  notify();
}

/** Dismiss a specific whisper toast by ID. */
export function dismissWhisper(id: string): void {
  const timer = dismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }

  visible = visible.filter((t) => t.id !== id);
  notify();
}

/** Subscribe to visible toast changes. Returns unsubscribe function. */
export function onWhisperEvent(callback: WhisperCallback): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

/** Get all whispers from this session (in-memory only). */
export function getWhisperHistory(): WhisperToast[] {
  return [...history];
}

/** Get currently visible toasts. */
export function getVisibleWhispers(): WhisperToast[] {
  return [...visible];
}

/** Clear all visible toasts and timers. */
export function clearWhispers(): void {
  for (const timer of dismissTimers.values()) {
    clearTimeout(timer);
  }
  dismissTimers.clear();
  visible = [];
  notify();
}

// ── Internal ─────────────────────────────────────────────────────

function notify(): void {
  const snapshot = [...visible];
  for (const cb of listeners) {
    try { cb(snapshot); } catch { /* swallow */ }
  }
}
