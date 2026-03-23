import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { PresenceState } from "../types";

// ── Internal state ──────────────────────────────────────────────

export interface PresenceEvent {
  status: PresenceState["status"];
  timestamp: number;
  detail: string | null;
}

type PresenceCallback = (state: PresenceState, event: PresenceEvent) => void;

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

let state: PresenceState = {
  status: "closed",
  lastChange: Date.now(),
  currentSession: null,
};

let listeners: PresenceCallback[] = [];
let unlistenFocus: UnlistenFn | null = null;
let unlistenBlur: UnlistenFn | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let tracking = false;

// ── Helpers ─────────────────────────────────────────────────────

function emit(newStatus: PresenceState["status"], detail: string | null = null): void {
  if (newStatus === state.status) return;

  const event: PresenceEvent = {
    status: newStatus,
    timestamp: Date.now(),
    detail,
  };

  state = {
    status: newStatus,
    lastChange: event.timestamp,
    currentSession: state.currentSession,
  };

  for (const cb of listeners) {
    try { cb(state, event); } catch { /* swallow */ }
  }
}

function resetIdleTimer(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (state.status === "active") {
      emit("idle");
    }
  }, IDLE_TIMEOUT_MS);
}

function handleActivity(): void {
  if (!tracking) return;
  if (state.status === "idle") {
    emit("active");
  }
  resetIdleTimer();
}

// ── Public API ──────────────────────────────────────────────────

export function getPresenceState(): PresenceState {
  return { ...state };
}

export function setCurrentSession(sessionId: string | null): void {
  state = { ...state, currentSession: sessionId };
}

export function onPresenceChange(callback: PresenceCallback): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((cb) => cb !== callback);
  };
}

export async function startPresenceTracking(): Promise<void> {
  if (tracking) return;
  tracking = true;

  // Initial state: active (app just opened)
  emit("active");

  // Tauri window events
  unlistenFocus = await listen("tauri://focus", () => {
    if (state.status === "away") {
      emit("active");
    }
    resetIdleTimer();
  });

  unlistenBlur = await listen("tauri://blur", () => {
    if (idleTimer !== null) clearTimeout(idleTimer);
    emit("away");
  });

  // User activity for idle detection
  document.addEventListener("mousemove", handleActivity);
  document.addEventListener("keydown", handleActivity);
  document.addEventListener("mousedown", handleActivity);
  document.addEventListener("touchstart", handleActivity);

  resetIdleTimer();
}

export function stopPresenceTracking(): void {
  if (!tracking) return;
  tracking = false;

  unlistenFocus?.();
  unlistenBlur?.();
  unlistenFocus = null;
  unlistenBlur = null;

  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  document.removeEventListener("mousemove", handleActivity);
  document.removeEventListener("keydown", handleActivity);
  document.removeEventListener("mousedown", handleActivity);
  document.removeEventListener("touchstart", handleActivity);

  emit("closed");
  listeners = [];
}
