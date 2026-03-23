import { useState, useEffect, useCallback } from "react";
import {
  setNotificationUpdateCallback,
  clearNotificationUpdateCallback,
  dismissNotification,
  type VisibleNotification,
} from "../../lib/care/notifications";
import type { AftercareNotification, AftercareAction } from "../../lib/care/aftercare";

interface CareNotificationsProps {
  aftercare: AftercareNotification | null;
  onAftercareAction?: (action: AftercareAction) => void;
  onAftercareDismiss?: () => void;
}

export default function CareNotifications({
  aftercare,
  onAftercareAction,
  onAftercareDismiss,
}: CareNotificationsProps) {
  const [notifications, setNotifications] = useState<VisibleNotification[]>([]);

  useEffect(() => {
    setNotificationUpdateCallback(setNotifications);
    return () => clearNotificationUpdateCallback();
  }, []);

  const handleDismiss = useCallback((id: string) => {
    dismissNotification(id);
  }, []);

  if (notifications.length === 0 && !aftercare) return null;

  return (
    <div className="flex flex-col gap-1.5 px-4 py-2">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`
            flex items-center gap-3 px-3 py-2 rounded
            bg-anchor-surface/80 border border-anchor-border
            transition-all duration-300 ease-out
            ${n.fadingOut ? "opacity-0 -translate-y-1" : "opacity-100 translate-y-0"}
          `}
          style={{ animation: n.fadingOut ? undefined : "careSlideIn 0.3s ease-out" }}
        >
          <span className="text-base shrink-0">{n.icon}</span>
          <span className="text-sm text-anchor-text flex-1">{n.message}</span>
          <button
            onClick={() => handleDismiss(n.id)}
            className="text-anchor-muted hover:text-anchor-text text-xs px-1.5 py-0.5 rounded hover:bg-anchor-bg/50 transition-colors"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      ))}

      {aftercare && (
        <div
          className="flex items-center gap-3 px-3 py-2 rounded bg-anchor-accent/10 border border-anchor-accent/30 transition-all duration-300 ease-out"
          style={{ animation: "careSlideIn 0.3s ease-out" }}
        >
          <span className="text-sm text-anchor-text flex-1">
            {aftercare.message}
          </span>
          <div className="flex gap-2 shrink-0">
            {aftercare.actions.map((a) => (
              <button
                key={a.action}
                onClick={() => onAftercareAction?.(a.action)}
                className="text-xs px-2 py-1 rounded bg-anchor-accent/20 hover:bg-anchor-accent/30 text-anchor-text transition-colors"
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            onClick={onAftercareDismiss}
            className="text-anchor-muted hover:text-anchor-text text-xs px-1.5 py-0.5 rounded hover:bg-anchor-bg/50 transition-colors"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
