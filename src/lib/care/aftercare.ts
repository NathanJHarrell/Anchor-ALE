// ── Care Engine: Aftercare Detection ─────────────────────────────
//
// Heuristic: if session > 2 hours AND average message length > 200 chars
// over the last 10 messages, suggest aftercare.

export interface AftercareState {
  sessionStarted: number;
  messageLengths: number[];
  aftercareSuggested: boolean;
}

export type AftercareAction = "check_in" | "open_vault";

export interface AftercareNotification {
  message: string;
  actions: { label: string; action: AftercareAction }[];
}

const SESSION_THRESHOLD_MS = 2 * 60 * 60_000; // 2 hours
const AVG_LENGTH_THRESHOLD = 200;
const WINDOW_SIZE = 10;

export function createAftercareState(): AftercareState {
  return {
    sessionStarted: Date.now(),
    messageLengths: [],
    aftercareSuggested: false,
  };
}

/**
 * Record a message length. Call for every user or assistant message.
 */
export function recordMessage(state: AftercareState, length: number): void {
  state.messageLengths.push(length);
  // Only keep the last WINDOW_SIZE entries
  if (state.messageLengths.length > WINDOW_SIZE) {
    state.messageLengths = state.messageLengths.slice(-WINDOW_SIZE);
  }
}

/**
 * Check if aftercare should be suggested. Returns notification or null.
 * Only triggers once per session.
 */
export function checkAftercare(state: AftercareState): AftercareNotification | null {
  if (state.aftercareSuggested) return null;

  const elapsed = Date.now() - state.sessionStarted;
  if (elapsed < SESSION_THRESHOLD_MS) return null;

  if (state.messageLengths.length < WINDOW_SIZE) return null;

  const avg =
    state.messageLengths.reduce((sum, len) => sum + len, 0) /
    state.messageLengths.length;

  if (avg < AVG_LENGTH_THRESHOLD) return null;

  state.aftercareSuggested = true;

  return {
    message:
      "This has been a deep conversation. How are you feeling?",
    actions: [
      { label: "Check in", action: "check_in" },
      { label: "Open Vault", action: "open_vault" },
    ],
  };
}

/**
 * Reset aftercare state (e.g. on new session).
 */
export function resetAftercare(state: AftercareState): void {
  state.sessionStarted = Date.now();
  state.messageLengths = [];
  state.aftercareSuggested = false;
}
