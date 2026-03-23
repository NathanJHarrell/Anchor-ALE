import { useState, useEffect, useRef } from "react";
import type { HeartbeatStatus, BridgeEvent } from "../../lib/types";
import type { HeartbeatMonitor } from "../../lib/heartbeat/monitor";
import type { HeartbeatBridge } from "../../lib/heartbeat/bridge";

interface HeartbeatIndicatorProps {
  monitor: HeartbeatMonitor;
  bridge: HeartbeatBridge;
  visible?: boolean;
}

export default function HeartbeatIndicator({
  monitor,
  bridge,
  visible = true,
}: HeartbeatIndicatorProps) {
  const [status, setStatus] = useState<HeartbeatStatus>(monitor.getStatus());
  const [pulsing, setPulsing] = useState(false);
  const pulseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubStatus = monitor.subscribe(setStatus);
    const unsubBridge = bridge.onBridge((_event: BridgeEvent) => {
      setPulsing(true);
      if (pulseTimeout.current) clearTimeout(pulseTimeout.current);
      pulseTimeout.current = setTimeout(() => setPulsing(false), 3000);
    });

    return () => {
      unsubStatus();
      unsubBridge();
      if (pulseTimeout.current) clearTimeout(pulseTimeout.current);
    };
  }, [monitor, bridge]);

  if (!visible) return null;

  const color =
    status.percentage >= 80
      ? "text-red-400"
      : status.percentage >= 60
        ? "text-yellow-400"
        : "text-emerald-400";

  return (
    <div
      className="relative inline-flex items-center gap-1.5 px-2 py-1 rounded-md cursor-default select-none"
      title={`Session health: ${status.percentage}% context used | ${status.bridgeCount} bridge${status.bridgeCount !== 1 ? "s" : ""} this session`}
    >
      {/* Heartbeat icon */}
      <svg
        viewBox="0 0 16 16"
        className={`w-4 h-4 ${color} ${pulsing ? "animate-heartbeat-pulse" : ""}`}
        fill="currentColor"
      >
        <path d="M8 2.748l-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.837-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01L8 2.748z" />
      </svg>

      {/* Percentage label */}
      <span className={`text-xs font-mono tabular-nums ${color}`}>
        {status.percentage}%
      </span>

      {/* Pulse ring on bridge */}
      {pulsing && (
        <span className="absolute inset-0 rounded-md border border-purple-500 animate-ping opacity-40" />
      )}

      {/* Inline keyframes via style tag — keeps component self-contained */}
      <style>{`
        @keyframes heartbeat-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          25% { transform: scale(1.3); opacity: 0.8; }
          50% { transform: scale(1); opacity: 1; }
          75% { transform: scale(1.2); opacity: 0.85; }
        }
        .animate-heartbeat-pulse {
          animation: heartbeat-pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
