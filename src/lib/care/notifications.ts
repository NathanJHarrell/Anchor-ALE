// ── Care Engine: Notification Manager ─────────────────────────────
//
// Manages a stack of up to 2 notifications.
// Older ones auto-dismiss when a third arrives.
// Each notification auto-dismisses after 30 seconds.

import type { CareNotification } from "./engine";

const MAX_VISIBLE = 2;
const AUTO_DISMISS_MS = 30_000;

export interface VisibleNotification extends CareNotification {
  dismissTimer: ReturnType<typeof setTimeout>;
  fadingOut: boolean;
}

export type NotificationUpdate = (notifications: VisibleNotification[]) => void;

let stack: VisibleNotification[] = [];
let updateCallback: NotificationUpdate | null = null;

export function setNotificationUpdateCallback(cb: NotificationUpdate): void {
  updateCallback = cb;
}

export function clearNotificationUpdateCallback(): void {
  updateCallback = null;
}

export function pushNotification(notification: CareNotification): void {
  // If at max, dismiss the oldest
  while (stack.length >= MAX_VISIBLE) {
    const oldest = stack.shift();
    if (oldest) clearTimeout(oldest.dismissTimer);
  }

  const visible: VisibleNotification = {
    ...notification,
    fadingOut: false,
    dismissTimer: setTimeout(() => {
      dismissNotification(notification.id);
    }, AUTO_DISMISS_MS),
  };

  stack.push(visible);
  notify();
}

export function dismissNotification(id: string): void {
  const idx = stack.findIndex((n) => n.id === id);
  if (idx === -1) return;

  const item = stack[idx]!;
  clearTimeout(item.dismissTimer);

  // Mark as fading out, then remove after animation
  item.fadingOut = true;
  notify();

  setTimeout(() => {
    stack = stack.filter((n) => n.id !== id);
    notify();
  }, 300); // match CSS transition duration
}

export function getVisibleNotifications(): VisibleNotification[] {
  return [...stack];
}

export function clearAllNotifications(): void {
  for (const n of stack) clearTimeout(n.dismissTimer);
  stack = [];
  notify();
}

function notify(): void {
  if (updateCallback) {
    updateCallback([...stack]);
  }
}
