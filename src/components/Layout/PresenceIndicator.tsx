import { useState, useEffect } from "react";
import { getPresenceState, onPresenceChange } from "../../lib/presence/tracker";
import type { PresenceState } from "../../lib/types";

const STATUS_COLORS: Record<PresenceState["status"], string> = {
  active: "bg-green-400",
  idle: "bg-yellow-400",
  away: "bg-gray-400",
  closed: "bg-gray-400",
};

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

function formatTooltip(state: PresenceState): string {
  const elapsed = formatDuration(Date.now() - state.lastChange);
  switch (state.status) {
    case "active":
      return `Active since ${new Date(state.lastChange).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    case "idle":
      return `Idle for ${elapsed}`;
    case "away":
      return `Away for ${elapsed}`;
    case "closed":
      return "Offline";
  }
}

export default function PresenceIndicator() {
  const [presence, setPresence] = useState<PresenceState>(getPresenceState);
  const [tooltip, setTooltip] = useState(() => formatTooltip(getPresenceState()));

  useEffect(() => {
    const unsub = onPresenceChange((newState) => {
      setPresence(newState);
      setTooltip(formatTooltip(newState));
    });

    // Update tooltip every 30s for duration text
    const interval = setInterval(() => {
      setTooltip(formatTooltip(getPresenceState()));
    }, 30_000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex items-center gap-2" title={tooltip}>
      <span
        className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[presence.status]} transition-colors duration-300`}
      />
      <span className="text-xs text-anchor-muted capitalize">{presence.status}</span>
    </div>
  );
}
