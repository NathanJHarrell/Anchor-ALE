import { useState, useCallback, useEffect } from "react";
import Sidebar from "./components/Layout/Sidebar";
import ChatView from "./components/Chat/ChatView";
import BrowserView from "./components/Browser/BrowserView";
import VaultManager from "./components/Vault/VaultManager";
import SettingsView from "./components/Settings/SettingsView";
import AboutModal from "./components/Layout/AboutModal";
import {
  startCareEngine,
  stopCareEngine,
  onCareNotification,
} from "./lib/care/engine";
import { pushNotification } from "./lib/care/notifications";

type View = "chat" | "browser" | "vault" | "settings";

export default function App() {
  const [activeView, setActiveView] = useState<View>("chat");
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Start care engine on mount, stop on unmount
  useEffect(() => {
    startCareEngine().catch(() => {});
    const unsub = onCareNotification(pushNotification);
    return () => {
      unsub();
      stopCareEngine();
    };
  }, []);

  const toggleRightPanel = useCallback(() => {
    setRightPanelOpen((prev) => !prev);
  }, []);

  // Browser view manages its own split layout, so we hide the generic right panel
  const showRightPanel = rightPanelOpen && activeView !== "browser";

  return (
    <div className="flex h-screen bg-anchor-bg text-anchor-text overflow-hidden">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        onAbout={() => setAboutOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center justify-between px-4 border-b border-anchor-border shrink-0">
          <h1 className="text-sm font-medium capitalize">{activeView}</h1>
          {activeView !== "browser" && (
            <button
              onClick={toggleRightPanel}
              className="text-xs text-anchor-muted hover:text-anchor-text transition-colors px-2 py-1 rounded hover:bg-anchor-surface"
            >
              {rightPanelOpen ? "Close Panel" : "Open Panel"}
            </button>
          )}
        </header>

        <div className="flex-1 overflow-auto p-4">
          {activeView === "chat" && <ChatView onNavigate={setActiveView} />}
          {activeView === "browser" && <BrowserView />}
          {activeView === "vault" && <VaultManager />}
          {activeView === "settings" && <SettingsView />}
        </div>
      </main>

      {showRightPanel && (
        <aside className="w-72 border-l border-anchor-border bg-anchor-surface p-4 shrink-0">
          <div className="text-sm text-anchor-muted">Context panel</div>
        </aside>
      )}

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
