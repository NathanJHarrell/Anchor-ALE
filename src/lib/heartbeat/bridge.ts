import type { Message, BridgeEvent, HeartbeatStatus } from "../types";
import { logBridgeEvent } from "../database";
import { HeartbeatMonitor } from "./monitor";
import { generateSummary } from "./summarizer";
import { generateHandoffLetter, writeHandoffLetter, readLatestLetter } from "../journal";

export type BridgeListener = (event: BridgeEvent) => void;
export type MessageSwapFn = (newMessages: Message[]) => void;

/**
 * Orchestrates the invisible session bridge when context fills up.
 *
 * Flow:
 * 1. Monitor detects threshold reached
 * 2. Summarizer generates conversation summary
 * 3. Bridge builds new message array with system prompt + vault context + summary
 * 4. Swaps the active API message array (chat display stays unchanged)
 * 5. Logs event to SQLite and emits for UI
 */
export class HeartbeatBridge {
  private monitor: HeartbeatMonitor;
  private systemPrompt = "";
  private vaultContext = "";
  private onSwap: MessageSwapFn | null = null;
  private bridgeListeners = new Set<BridgeListener>();
  private bridging = false;

  constructor(monitor: HeartbeatMonitor) {
    this.monitor = monitor;
    this.monitor.onThresholdReached((status) => {
      const config = this.monitor.getConfig();
      if (config.autoBridge) {
        void this.executeBridge(status);
      }
    });
  }

  // ── Configuration ───────────────────────────────────────────

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  setVaultContext(context: string): void {
    this.vaultContext = context;
  }

  onMessageSwap(fn: MessageSwapFn): void {
    this.onSwap = fn;
  }

  onBridge(listener: BridgeListener): () => void {
    this.bridgeListeners.add(listener);
    return () => this.bridgeListeners.delete(listener);
  }

  isBridging(): boolean {
    return this.bridging;
  }

  // ── Core bridge execution ───────────────────────────────────

  /**
   * Manually trigger a bridge. Use this when auto_bridge is false
   * or to force a bridge at any time.
   */
  async triggerBridge(messages: Message[]): Promise<BridgeEvent> {
    const status = this.monitor.getStatus();
    return this.executeBridge(status, messages);
  }

  private async executeBridge(
    status: HeartbeatStatus,
    currentMessages?: Message[],
  ): Promise<BridgeEvent> {
    if (this.bridging) {
      throw new Error("Bridge already in progress");
    }

    this.bridging = true;

    try {
      // Generate summary from current conversation
      const messages = currentMessages ?? [];
      const summary = messages.length > 0
        ? await generateSummary(messages)
        : "No conversation history to summarize.";

      // Generate handoff letter — companion writes to her next self
      if (messages.length > 0) {
        try {
          const letter = await generateHandoffLetter(messages);
          if (letter) {
            await writeHandoffLetter(letter, status.sessionId);
          }
        } catch {
          // Handoff letter generation failed — bridge continues without it
        }
      }

      // Create new session
      const newSessionId = crypto.randomUUID();

      // Build bridged message array (includes handoff letter if available)
      const bridgedMessages = await this.buildBridgedMessages(summary);

      // Swap the active message array (display stays unchanged)
      this.onSwap?.(bridgedMessages);

      // Log to SQLite
      await logBridgeEvent(status.tokensUsed, summary, newSessionId);

      // Update monitor state
      this.monitor.recordBridge(newSessionId);
      this.monitor.setTokens(
        this.estimateNewTokens(bridgedMessages),
      );

      // Build and emit event
      const event: BridgeEvent = {
        timestamp: Date.now(),
        tokenCount: status.tokensUsed,
        summary,
        sessionId: newSessionId,
      };

      this.emitBridgeEvent(event);

      return event;
    } finally {
      this.bridging = false;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async buildBridgedMessages(summary: string): Promise<Message[]> {
    const messages: Message[] = [];

    if (this.systemPrompt) {
      messages.push({ role: "system", content: this.systemPrompt });
    }

    if (this.vaultContext) {
      messages.push({
        role: "system",
        content: this.vaultContext,
      });
    }

    messages.push({
      role: "system",
      content: `[BRIDGE_CONTEXT]${summary}[/BRIDGE_CONTEXT]`,
    });

    // Inject handoff letter from the previous companion
    try {
      const letter = await readLatestLetter();
      if (letter) {
        messages.push({
          role: "system",
          content: `[HANDOFF_LETTER]The previous companion wrote: ${letter}[/HANDOFF_LETTER]`,
        });
      }
    } catch {
      // Handoff letter unavailable — continue without
    }

    return messages;
  }

  private estimateNewTokens(messages: Message[]): number {
    let totalWords = 0;
    for (const msg of messages) {
      totalWords += msg.content.split(/\s+/).filter(Boolean).length;
    }
    return Math.ceil(totalWords * 1.3);
  }

  private emitBridgeEvent(event: BridgeEvent): void {
    for (const listener of this.bridgeListeners) {
      listener(event);
    }
  }
}
