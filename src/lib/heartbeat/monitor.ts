import { estimateTokens } from "../api/token-counter";
import { getSetting } from "../database";
import type { Message, HeartbeatConfig, HeartbeatStatus } from "../types";
import {
  CONTEXT_WINDOW_SIZES,
  DEFAULT_HEARTBEAT_CONFIG,
} from "../types";

export type ThresholdCallback = (status: HeartbeatStatus) => void;

/**
 * Monitors cumulative token usage for a session and fires a callback
 * when the configured threshold is reached.
 */
export class HeartbeatMonitor {
  private config: HeartbeatConfig = { ...DEFAULT_HEARTBEAT_CONFIG };
  private contextWindow = 1_000_000;
  private tokensUsed = 0;
  private bridgeCount = 0;
  private sessionId: string;
  private thresholdFired = false;
  private onThreshold: ThresholdCallback | null = null;
  private listeners = new Set<(status: HeartbeatStatus) => void>();

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? crypto.randomUUID();
  }

  // ── Lifecycle ───────────────────────────────────────────────

  async init(): Promise<void> {
    await this.loadConfig();
  }

  /** Reload config from SQLite settings. */
  async loadConfig(): Promise<void> {
    const [threshold, summaryModel, showIndicator, autoBridge, provider] =
      await Promise.all([
        getSetting("heartbeat_threshold"),
        getSetting("heartbeat_summary_model"),
        getSetting("heartbeat_show_indicator"),
        getSetting("heartbeat_auto_bridge"),
        getSetting("provider"),
      ]);

    this.config = {
      thresholdPercentage: threshold
        ? parseInt(threshold, 10)
        : DEFAULT_HEARTBEAT_CONFIG.thresholdPercentage,
      summaryModel: summaryModel ?? DEFAULT_HEARTBEAT_CONFIG.summaryModel,
      showIndicator: showIndicator
        ? showIndicator === "true"
        : DEFAULT_HEARTBEAT_CONFIG.showIndicator,
      autoBridge: autoBridge
        ? autoBridge === "true"
        : DEFAULT_HEARTBEAT_CONFIG.autoBridge,
    };

    if (provider && provider in CONTEXT_WINDOW_SIZES) {
      this.contextWindow = CONTEXT_WINDOW_SIZES[provider]!;
    }
  }

  // ── Token tracking ──────────────────────────────────────────

  /**
   * Update token count from the current message array.
   * Call this after every assistant response completes.
   */
  update(messages: Message[]): HeartbeatStatus {
    this.tokensUsed = estimateTokens(messages);
    const status = this.getStatus();
    this.notifyListeners(status);

    if (
      !this.thresholdFired &&
      status.percentage >= this.config.thresholdPercentage
    ) {
      this.thresholdFired = true;
      this.onThreshold?.(status);
    }

    return status;
  }

  /**
   * Manually set token count (e.g. after a bridge resets the session).
   */
  setTokens(count: number): HeartbeatStatus {
    this.tokensUsed = count;
    this.thresholdFired = false;
    const status = this.getStatus();
    this.notifyListeners(status);
    return status;
  }

  // ── Status ──────────────────────────────────────────────────

  getStatus(): HeartbeatStatus {
    return {
      tokensUsed: this.tokensUsed,
      contextWindow: this.contextWindow,
      percentage: Math.min(
        100,
        Math.round((this.tokensUsed / this.contextWindow) * 100),
      ),
      bridgeCount: this.bridgeCount,
      sessionId: this.sessionId,
    };
  }

  getConfig(): Readonly<HeartbeatConfig> {
    return { ...this.config };
  }

  getSessionId(): string {
    return this.sessionId;
  }

  // ── Bridge bookkeeping ──────────────────────────────────────

  /** Called by the bridge after a successful handoff. */
  recordBridge(newSessionId: string): void {
    this.bridgeCount++;
    this.sessionId = newSessionId;
    this.thresholdFired = false;
  }

  // ── Context window ─────────────────────────────────────────

  setProvider(provider: string): void {
    if (provider in CONTEXT_WINDOW_SIZES) {
      this.contextWindow = CONTEXT_WINDOW_SIZES[provider]!;
    }
  }

  setContextWindow(size: number): void {
    this.contextWindow = size;
  }

  // ── Callbacks ───────────────────────────────────────────────

  onThresholdReached(cb: ThresholdCallback): void {
    this.onThreshold = cb;
  }

  /** Subscribe to every status update (for UI). */
  subscribe(cb: (status: HeartbeatStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyListeners(status: HeartbeatStatus): void {
    for (const cb of this.listeners) {
      cb(status);
    }
  }
}
