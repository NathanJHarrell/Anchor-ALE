import { useState, useCallback, useRef, useEffect } from "react";
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

  const iframeRef = useRef<HTMLIFrameElement>(null);

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

      const title = url;
      void addBrowserHistory(url, title);
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
    if (iframeRef.current && currentUrl) {
      setIsLoading(true);
      iframeRef.current.src = currentUrl;
    }
  }, [currentUrl]);

  const goHome = useCallback(() => {
    setCurrentUrl(HOME_URL);
  }, []);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // ── Content extraction & sharing ─────────────────────────────

  const shareWithAI = useCallback(async () => {
    if (!currentUrl) return;
    setIsExtracting(true);
    try {
      const content = await getCurrentPageContent(currentUrl);
      const shared: SharedContent = { content, timestamp: Date.now() };
      setSharedContent((prev) => [...prev, shared]);
      // Auto-open chat panel when sharing
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
            <iframe
              ref={iframeRef}
              src={currentUrl}
              onLoad={handleIframeLoad}
              className="w-full h-full border-none bg-white"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
              title="Anchor Browser"
            />
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

      {/* Drag overlay to prevent iframe from stealing mouse events */}
      {isDragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </div>
  );
}
