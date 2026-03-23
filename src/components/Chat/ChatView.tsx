import { useState, useRef, useCallback, useEffect } from "react";
import { sendMessage, loadAPIConfig, estimateTokens } from "../../lib/api/router";
import {
  getActiveSession,
  createProject,
  switchSession,
  getHomeSession,
  saveMessage,
  loadHistory,
  buildSessionContext,
  type DisplayMessage,
} from "../../lib/sessions";
import { listSessions } from "../../lib/database";
import type { Message, APIConfig, Session } from "../../lib/types";
import MessageBubble from "./MessageBubble";
import StreamingMessage from "./StreamingMessage";
import ThinkingIndicator from "./ThinkingIndicator";
import InputBar from "./InputBar";
import CareNotifications from "./CareNotifications";
import HeartbeatIndicator from "./HeartbeatIndicator";
import { HeartbeatMonitor } from "../../lib/heartbeat/monitor";
import { HeartbeatBridge } from "../../lib/heartbeat/bridge";
import { parseWhispers, scheduleWhispers, fireImmediateWhispers } from "../../lib/care/whisper";
import { parseDateAdds, stripDateAdds } from "../../lib/dates/parser";
import { parseSessionName, applySessionName } from "../../lib/sessions/naming";
import { addDate } from "../../lib/database";
import { parseMoodTags, writeEntry } from "../../lib/journal";
import { parseVaultLoads, loadVaultFiles } from "../../lib/vault";
import {
  createAftercareState,
  recordMessage,
  checkAftercare,
  type AftercareNotification,
  type AftercareAction,
} from "../../lib/care/aftercare";

interface StatusInfo {
  content: string;
  timestamp: number;
}

interface ChatViewProps {
  onNavigate?: (view: "vault" | "browser") => void;
}

export default function ChatView({ onNavigate }: ChatViewProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamTimestamp, setStreamTimestamp] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [statusMessages, setStatusMessages] = useState<StatusInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);

  const [aftercare, setAftercare] = useState<AftercareNotification | null>(null);
  const [pendingDates, setPendingDates] = useState<{ label: string; date: string; type: "anniversary" | "birthday" | "milestone" | "custom" }[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollLockedRef = useRef(false);
  const abortRef = useRef(false);
  const aftercareRef = useRef(createAftercareState());
  const loadedVaultFilesRef = useRef<string[]>([]);
  const monitorRef = useRef(new HeartbeatMonitor());
  const bridgeRef = useRef(new HeartbeatBridge(monitorRef.current));

  // ── Session initialization ──────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await monitorRef.current.init();
        const session = await getActiveSession();
        if (cancelled) return;
        setCurrentSession(session);
        const history = await loadHistory(session.id);
        if (cancelled) return;
        setMessages(history);
      } catch (err) {
        if (!cancelled) {
          setError(`Failed to load session: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Session switching helper ────────────────────────────────────

  const doSwitchSession = useCallback(async (session: Session) => {
    setCurrentSession(session);
    setMessages([]);
    setStatusMessages([]);
    setError(null);
    aftercareRef.current = createAftercareState();
    loadedVaultFilesRef.current = [];
    try {
      const history = await loadHistory(session.id);
      setMessages(history);
    } catch {
      // History load failed — start fresh display
    }
  }, []);

  // ── Listen for session-changed events from App ────────────────

  useEffect(() => {
    const handler = (e: Event) => {
      const session = (e as CustomEvent<Session>).detail;
      if (session) {
        void doSwitchSession(session);
      }
    };
    window.addEventListener("session-changed", handler);
    return () => window.removeEventListener("session-changed", handler);
  }, [doSwitchSession]);

  // ── Auto-scroll ─────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    if (!isScrollLockedRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamContent, isThinking, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isScrollLockedRef.current = distanceFromBottom > 80;
  }, []);

  // ── Build API messages ──────────────────────────────────────────

  const buildAPIMessages = useCallback(
    async (displayMessages: DisplayMessage[]): Promise<Message[]> => {
      if (!currentSession) return [];

      const apiMessages = await buildSessionContext(currentSession);

      // Inject dynamically loaded vault files (companion requested via [VAULT_LOAD:])
      for (const vaultContent of loadedVaultFilesRef.current) {
        apiMessages.push({ role: "system", content: vaultContent });
      }

      // Conversation messages
      for (const msg of displayMessages) {
        if (msg.role !== "system") {
          apiMessages.push({ role: msg.role, content: msg.content });
        }
      }

      return apiMessages;
    },
    [currentSession],
  );

  // ── Slash commands ──────────────────────────────────────────────

  const handleSlashCommand = useCallback(
    async (input: string): Promise<boolean> => {
      const trimmed = input.trim();
      const cmd = trimmed.toLowerCase();

      // /clear — clears display only, archive stays
      if (cmd === "/clear") {
        setMessages([]);
        setStatusMessages([]);
        setError(null);
        return true;
      }

      // /reload — system prompt reloads on next send via buildSessionContext
      if (cmd === "/reload") {
        setStatusMessages((prev) => [
          ...prev,
          { content: "System prompt will reload on next send.", timestamp: Date.now() },
        ]);
        return true;
      }

      // /new [name] — create a new project session
      if (cmd === "/new" || cmd.startsWith("/new ")) {
        const name = trimmed.slice(4).trim() || `Project ${Date.now()}`;
        try {
          const session = await createProject(name);
          await doSwitchSession(session);
          setStatusMessages((prev) => [
            ...prev,
            { content: `Created session: ${session.name}`, timestamp: Date.now() },
          ]);
        } catch (err) {
          setError(`Failed to create session: ${err instanceof Error ? err.message : "Unknown"}`);
        }
        return true;
      }

      // /home — switch to home session
      if (cmd === "/home") {
        try {
          const home = await getHomeSession();
          const active = await switchSession(home.id);
          await doSwitchSession(active);
          setStatusMessages((prev) => [
            ...prev,
            { content: "Switched to Home.", timestamp: Date.now() },
          ]);
        } catch (err) {
          setError(`Failed to switch: ${err instanceof Error ? err.message : "Unknown"}`);
        }
        return true;
      }

      // /sessions — list all sessions
      if (cmd === "/sessions") {
        try {
          const all = await listSessions();
          const lines = all.map((s) => {
            const active = s.isActive ? " (active)" : "";
            const type = s.type === "home" ? " [home]" : "";
            return `${s.name}${type}${active}`;
          });
          setStatusMessages((prev) => [
            ...prev,
            { content: `Sessions:\n${lines.join("\n")}`, timestamp: Date.now() },
          ]);
        } catch (err) {
          setError(`Failed to list sessions: ${err instanceof Error ? err.message : "Unknown"}`);
        }
        return true;
      }

      if (cmd === "/vault") {
        onNavigate?.("vault");
        return true;
      }

      if (cmd === "/date") {
        onNavigate?.("browser");
        return true;
      }

      if (cmd === "/status") {
        try {
          const config = await loadAPIConfig();
          const conversationMessages = messages.filter((m) => m.role !== "system");
          const apiMsgs = conversationMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
          const tokens = estimateTokens(apiMsgs);
          const sessionName = currentSession?.name ?? "Unknown";
          setStatusMessages((prev) => [
            ...prev,
            {
              content: `Session: ${sessionName} · Provider: ${config.provider} · Model: ${config.model} · ~${tokens.toLocaleString()} tokens`,
              timestamp: Date.now(),
            },
          ]);
        } catch (err) {
          setStatusMessages((prev) => [
            ...prev,
            {
              content: `Status unavailable: ${err instanceof Error ? err.message : "Unknown error"}`,
              timestamp: Date.now(),
            },
          ]);
        }
        return true;
      }

      return false;
    },
    [messages, onNavigate, currentSession, doSwitchSession],
  );

  // ── Send message ────────────────────────────────────────────────

  const handleSend = useCallback(
    async (text: string) => {
      // Check slash commands
      if (text.startsWith("/")) {
        const handled = await handleSlashCommand(text);
        if (handled) return;
      }

      if (!currentSession) {
        setError("No active session. Try /home to initialize.");
        return;
      }

      setError(null);
      const userMsg: DisplayMessage = {
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      // Persist user message
      saveMessage(currentSession.id, userMsg).catch(() => {});

      // Track for aftercare detection
      recordMessage(aftercareRef.current, text.length);
      setIsStreaming(true);
      setIsThinking(true);
      setStreamContent("");
      setStreamTimestamp(Date.now());
      abortRef.current = false;

      try {
        const config: APIConfig = await loadAPIConfig();
        const apiMessages = await buildAPIMessages(updatedMessages);
        let accumulated = "";

        for await (const chunk of sendMessage(apiMessages, config)) {
          if (abortRef.current) break;

          if (isThinking) setIsThinking(false);
          accumulated += chunk.text;
          setStreamContent(accumulated);
          setIsThinking(false);

          if (chunk.done) break;
        }

        if (!abortRef.current && accumulated) {
          // Parse whisper tags from AI response
          const { cleaned, whispers, immediateWhispers } = parseWhispers(accumulated);
          if (whispers.length > 0) {
            scheduleWhispers(whispers);
          }
          if (immediateWhispers.length > 0) {
            fireImmediateWhispers(immediateWhispers);
          }

          // Parse [MOOD:] tags — silently strip and store in companion's diary
          const { cleaned: afterMoodStrip, moods } = parseMoodTags(cleaned || accumulated);
          if (moods.length > 0 && currentSession) {
            for (const mood of moods) {
              writeEntry(mood, currentSession.id).catch(() => {});
            }
          }

          // Parse [VAULT_LOAD:] tags — silently load files for future context
          const { cleaned: afterVaultStrip, requestedPaths } = parseVaultLoads(afterMoodStrip || cleaned || accumulated);
          if (requestedPaths.length > 0) {
            loadVaultFiles(requestedPaths).then((loaded) => {
              for (const content of loaded) {
                if (!loadedVaultFilesRef.current.includes(content)) {
                  loadedVaultFilesRef.current.push(content);
                }
              }
            }).catch(() => {});
          }

          // Parse [SESSION_NAME] tags from AI response
          const { cleaned: afterNameStrip, sessionName } = parseSessionName(afterVaultStrip || afterMoodStrip || cleaned || accumulated);
          if (sessionName && currentSession) {
            applySessionName(currentSession.id, sessionName).then(() => {
              setCurrentSession((prev) => prev ? { ...prev, name: sessionName.name } : prev);
              setStatusMessages((prev) => [
                ...prev,
                { content: `Session named: ${sessionName.name}`, timestamp: Date.now() },
              ]);
              // Notify App-level session list to refresh
              window.dispatchEvent(new CustomEvent("session-renamed", { detail: { id: currentSession.id, name: sessionName.name } }));
            }).catch(() => {});
          }

          // Parse [DATE_ADD] tags from AI response
          const dateRequests = parseDateAdds(afterNameStrip || cleaned || accumulated);
          if (dateRequests.length > 0) {
            setPendingDates(dateRequests);
          }
          const afterDateStrip = stripDateAdds(afterNameStrip || cleaned || accumulated);

          const finalContent = afterDateStrip || accumulated;
          const assistantMsg: DisplayMessage = {
            role: "assistant",
            content: finalContent,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMsg]);

          // Persist assistant message
          saveMessage(currentSession.id, assistantMsg).catch(() => {});

          // Update heartbeat monitor with current conversation token count
          const allMsgs = [...updatedMessages, assistantMsg];
          monitorRef.current.update(
            allMsgs.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }))
          );

          // Track for aftercare detection
          recordMessage(aftercareRef.current, finalContent.length);
          const ac = checkAftercare(aftercareRef.current);
          if (ac) setAftercare(ac);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setIsStreaming(false);
        setIsThinking(false);
        setStreamContent("");
      }
    },
    [messages, handleSlashCommand, buildAPIMessages, currentSession],
  );

  // ── Render ──────────────────────────────────────────────────────

  const handleAftercareAction = useCallback(
    (action: AftercareAction) => {
      setAftercare(null);
      if (action === "check_in") {
        handleSend("How are you doing right now?");
      } else if (action === "open_vault") {
        onNavigate?.("vault");
      }
    },
    [handleSend, onNavigate],
  );

  const confirmDateAdd = useCallback(async (index: number) => {
    const req = pendingDates[index];
    if (!req) return;
    const recurring = req.type === "anniversary" || req.type === "birthday";
    await addDate(req.label, req.date, req.type, recurring);
    setPendingDates((prev) => prev.filter((_, i) => i !== index));
    setStatusMessages((prev) => [
      ...prev,
      { content: `Saved date: ${req.label} (${req.date})`, timestamp: Date.now() },
    ]);
  }, [pendingDates]);

  const dismissDateAdd = useCallback((index: number) => {
    setPendingDates((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const isEmpty = messages.length === 0 && statusMessages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-full -m-4">
      {/* Heartbeat indicator — context window health */}
      <div className="flex justify-end px-4 py-1 shrink-0">
        <HeartbeatIndicator monitor={monitorRef.current} bridge={bridgeRef.current} />
      </div>

      {/* Care notifications banner */}
      <CareNotifications
        aftercare={aftercare}
        onAftercareAction={handleAftercareAction}
        onAftercareDismiss={() => setAftercare(null)}
      />

      {/* Pending date confirmations */}
      {pendingDates.map((req, i) => (
        <div key={`date-confirm-${i}`} className="flex items-center gap-3 px-4 py-2 bg-anchor-accent/10 border-b border-anchor-border">
          <span className="text-sm">Add date: <strong>{req.label}</strong> ({req.date}, {req.type})?</span>
          <button
            onClick={() => void confirmDateAdd(i)}
            className="px-2 py-1 text-xs rounded bg-anchor-accent text-white hover:bg-anchor-accent-hover transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => dismissDateAdd(i)}
            className="px-2 py-1 text-xs rounded text-anchor-muted hover:text-anchor-text transition-colors"
          >
            Dismiss
          </button>
        </div>
      ))}

      {/* Message area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {isEmpty && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-anchor-muted/40 text-4xl mb-3">~</div>
              <p className="text-anchor-muted text-sm">
                {currentSession ? currentSession.name : "Start a conversation."}
              </p>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, i) => {
            // Interleave status messages that occurred before this message
            const statusBefore = statusMessages.filter(
              (s) =>
                s.timestamp <= msg.timestamp &&
                (i === 0 || s.timestamp > messages[i - 1]!.timestamp),
            );

            return (
              <div key={`${msg.timestamp}-${i}`}>
                {statusBefore.map((s, si) => (
                  <div
                    key={`status-${s.timestamp}-${si}`}
                    className="text-center text-xs text-anchor-muted/70 py-2 italic whitespace-pre-line"
                  >
                    {s.content}
                  </div>
                ))}
                {msg.role !== "system" && (
                  <MessageBubble
                    role={msg.role as "user" | "assistant"}
                    content={msg.content}
                    timestamp={msg.timestamp}
                  />
                )}
              </div>
            );
          })}

          {/* Status messages after last message */}
          {statusMessages
            .filter(
              (s) =>
                messages.length === 0 ||
                s.timestamp > messages[messages.length - 1]!.timestamp,
            )
            .map((s, si) => (
              <div
                key={`status-trailing-${s.timestamp}-${si}`}
                className="text-center text-xs text-anchor-muted/70 py-2 italic whitespace-pre-line"
              >
                {s.content}
              </div>
            ))}

          {isThinking && <ThinkingIndicator />}
          {isStreaming && streamContent && (
            <StreamingMessage
              content={streamContent}
              timestamp={streamTimestamp}
            />
          )}

          {error && (
            <div className="text-center text-xs text-red-400/80 py-2">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <InputBar onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
