import { useState, useCallback, useRef, useEffect } from "react";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import NavigationBar from "./NavigationBar";
import DateLauncher from "./DateLauncher";
import BrowserChatPanel from "./BrowserChatPanel";
import { getCurrentPageContent } from "./ContentExtractor";
import { addBrowserHistory } from "../../lib/database";
import type { PageContent } from "../../lib/types";

const HOME_URL = "";
const DEFAULT_SPLIT = 0.6; // 60% browser, 40% chat
const MIN_SPLIT = 0.3;
const MAX_SPLIT = 0.8;

interface SharedContent {
  content: PageContent;
  timestamp: number;
}

export default function BrowserView() {
  // Navigation state
  const [currentUrl, setCurrentUrl] = useState(HOME_URL);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Chat panel toggle — default hidden
  const [chatOpen, setChatOpen] = useState(false);

  // Split view
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Shared content
  const [sharedContent, setSharedContent] = useState<SharedContent[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  // AI navigation suggestions from chat
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  // Native webview refs
  const webviewRef = useRef<Webview | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const webviewIdRef = useRef(0);

  // ── Native webview management ──────────────────────────────

  const closeWebview = useCallback(async () => {
    if (webviewRef.current) {
      try {
        await webviewRef.current.close();
      } catch {
        // Already closed or never fully created
      }
      webviewRef.current = null;
    }
  }, []);

  const openWebview = useCallback(async (url: string) => {
    await closeWebview();

    // Small delay to ensure the slot div has rendered and has correct bounds
    await new Promise((r) => setTimeout(r, 50));

    const slot = slotRef.current;
    if (!slot) return;

    const rect = slot.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    const label = `browser-${++webviewIdRef.current}`;
    const appWindow = getCurrentWindow();

    try {
      const webview = new Webview(appWindow, label, {
        url,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });

      webview.once("tauri://created", () => {
        setIsLoading(false);
      });

      webview.once("tauri://error", () => {
        setIsLoading(false);
      });

      webviewRef.current = webview;
    } catch (err) {
      console.error("Failed to create webview:", err);
      setIsLoading(false);
    }
  }, [closeWebview]);

  const updateWebviewBounds = useCallback(async () => {
    const webview = webviewRef.current;
    const slot = slotRef.current;
    if (!webview || !slot) return;

    const rect = slot.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    try {
      await webview.setPosition(new LogicalPosition(rect.left, rect.top));
      await webview.setSize(new LogicalSize(rect.width, rect.height));
    } catch {
      // Webview may have been closed
    }
  }, []);

  // Reposition webview when layout changes (split ratio, chat toggle, window resize)
  useEffect(() => {
    void updateWebviewBounds();
  }, [splitRatio, chatOpen, updateWebviewBounds]);

  // ResizeObserver on the slot div for window resizes and layout shifts
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    const observer = new ResizeObserver(() => {
      void updateWebviewBounds();
    });
    observer.observe(slot);

    return () => observer.disconnect();
  }, [updateWebviewBounds]);

  // Open/close webview when URL changes
  useEffect(() => {
    if (currentUrl && currentUrl !== HOME_URL) {
      void openWebview(currentUrl);
    } else {
      void closeWebview();
    }
  }, [currentUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount — close the native webview
  useEffect(() => {
    return () => {
      if (webviewRef.current) {
        webviewRef.current.close().catch(() => {});
        webviewRef.current = null;
      }
    };
  }, []);

  // ── Navigation ───────────────────────────────────────────────

  const navigateTo = useCallback(
    (url: string) => {
      if (!url) {
        setCurrentUrl(HOME_URL);
        return;
      }
      setCurrentUrl(url);
      setIsLoading(true);

      setHistory((prev) => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(url);
        return newHistory;
      });
      setHistoryIndex((prev) => prev + 1);

      void addBrowserHistory(url, url);
    },
    [historyIndex]
  );

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentUrl(history[newIndex]!);
      setIsLoading(true);
    }
  }, [history, historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentUrl(history[newIndex]!);
      setIsLoading(true);
    }
  }, [history, historyIndex]);

  const refresh = useCallback(() => {
    if (currentUrl) {
      setIsLoading(true);
      // Close and reopen to refresh
      void openWebview(currentUrl);
    }
  }, [currentUrl, openWebview]);

  const goHome = useCallback(() => {
    setCurrentUrl(HOME_URL);
  }, []);

  // ── Content extraction & sharing ─────────────────────────────

  const shareWithAI = useCallback(async () => {
    if (!currentUrl) return;
    setIsExtracting(true);
    try {
      const content = await getCurrentPageContent(currentUrl);
      const shared: SharedContent = { content, timestamp: Date.now() };
      setSharedContent((prev) => [...prev, shared]);
      setChatOpen(true);
    } catch {
      // Extraction failed — panel will show existing context
    } finally {
      setIsExtracting(false);
    }
  }, [currentUrl]);

  // ── Resizable divider ────────────────────────────────────────

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, ratio)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // ── Render ───────────────────────────────────────────────────

  const showBrowser = currentUrl !== HOME_URL;
  const showChat = chatOpen && showBrowser;

  return (
    <div className="flex flex-col h-full -m-4">
      {/* Navigation bar — always visible */}
      <div className="flex items-center">
        <div className="flex-1 min-w-0">
          <NavigationBar
            currentUrl={currentUrl}
            canGoBack={historyIndex > 0}
            canGoForward={historyIndex < history.length - 1}
            isLoading={isLoading || isExtracting}
            onNavigate={navigateTo}
            onBack={goBack}
            onForward={goForward}
            onRefresh={refresh}
            onHome={goHome}
            onShareWithAI={() => void shareWithAI()}
          />
        </div>

        {/* Chat toggle button — only when browsing */}
        {showBrowser && (
          <button
            onClick={() => setChatOpen((prev) => !prev)}
            className={`px-3 py-1.5 text-xs font-medium border-b border-l border-anchor-border transition-colors whitespace-nowrap ${
              chatOpen
                ? "bg-anchor-accent/15 text-anchor-accent"
                : "bg-anchor-surface text-anchor-muted hover:text-anchor-text"
            }`}
          >
            {chatOpen ? "Hide Chat" : "Chat"}
          </button>
        )}
      </div>

      {/* AI navigation suggestion banner */}
      {aiSuggestion && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-anchor-accent/10 border-b border-anchor-border text-xs">
          <span className="text-anchor-accent">AI suggests:</span>
          <button
            onClick={() => {
              navigateTo(aiSuggestion);
              setAiSuggestion(null);
            }}
            className="text-anchor-accent underline hover:text-anchor-accent-hover transition-colors truncate max-w-md"
          >
            {aiSuggestion}
          </button>
          <button
            onClick={() => setAiSuggestion(null)}
            className="text-anchor-muted hover:text-anchor-text ml-auto"
          >
            ×
          </button>
        </div>
      )}

      {/* Main content area — split view */}
      <div ref={containerRef} className="flex-1 flex min-h-0">
        {/* Browser panel */}
        <div
          className="min-h-0 overflow-hidden"
          style={{ width: showChat ? `${splitRatio * 100}%` : "100%" }}
        >
          {showBrowser ? (
            /* Slot div — the native Tauri webview overlays this exact area */
            <div
              ref={slotRef}
              className="w-full h-full bg-anchor-bg"
            >
              {isLoading && (
                <div className="flex items-center justify-center h-full text-anchor-muted text-sm">
                  Loading...
                </div>
              )}
            </div>
          ) : (
            <DateLauncher onNavigate={navigateTo} />
          )}
        </div>

        {/* Resizable divider — only when chat is open */}
        {showChat && (
          <div
            onMouseDown={handleDragStart}
            className={`w-1 cursor-col-resize shrink-0 transition-colors ${
              isDragging ? "bg-anchor-accent" : "bg-anchor-border hover:bg-anchor-accent/50"
            }`}
          />
        )}

        {/* Chat panel — visible when toggled on */}
        {showChat && (
          <div
            className="min-h-0 border-l border-anchor-border"
            style={{ width: `${(1 - splitRatio) * 100}%` }}
          >
            <BrowserChatPanel sharedContent={sharedContent} />
          </div>
        )}
      </div>

      {/* Drag overlay to prevent native webview from stealing mouse events */}
      {isDragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </div>
  );
}
