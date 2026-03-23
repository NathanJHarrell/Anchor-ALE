import { useState, useEffect, useCallback } from "react";
import {
  onWhisperEvent,
  dismissWhisper,
} from "../../lib/care/whisper-manager";
import type { WhisperToast as WhisperToastType } from "../../lib/types";

export default function WhisperToastContainer() {
  const [toasts, setToasts] = useState<WhisperToastType[]>([]);
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onWhisperEvent((visible) => {
      setToasts(visible);
    });
    return unsub;
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setDismissing((prev) => new Set(prev).add(id));
    setTimeout(() => {
      dismissWhisper(id);
      setDismissing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 300);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <WhisperToastItem
          key={toast.id}
          toast={toast}
          fading={dismissing.has(toast.id)}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
}

function WhisperToastItem({
  toast,
  fading,
  onDismiss,
}: {
  toast: WhisperToastType;
  fading: boolean;
  onDismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger slide-up animation on next frame
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const time = new Date(toast.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <button
      onClick={() => onDismiss(toast.id)}
      className={`
        pointer-events-auto max-w-xs w-72
        bg-anchor-surface border border-anchor-border rounded-lg
        shadow-lg overflow-hidden cursor-pointer
        transition-all duration-300 ease-out
        ${mounted && !fading ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}
      `}
      style={{ borderLeftColor: "#9333EA", borderLeftWidth: "3px" }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-purple-400">whisper</span>
          <span className="text-[10px] text-anchor-muted">{timeStr}</span>
        </div>
        <p className="text-sm text-anchor-text leading-snug">{toast.message}</p>
      </div>
    </button>
  );
}
