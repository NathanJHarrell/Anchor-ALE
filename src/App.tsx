import { useState, useCallback, useEffect } from "react";
import Sidebar from "./components/Layout/Sidebar";
import SessionHeader from "./components/Sessions/SessionHeader";
import ChatView from "./components/Chat/ChatView";
import BrowserView from "./components/Browser/BrowserView";
import VaultManager from "./components/Vault/VaultManager";
import ArchiveView from "./components/Archive/ArchiveView";
import SettingsView from "./components/Settings/SettingsView";
import AboutModal from "./components/Layout/AboutModal";
import {
  startCareEngine,
  stopCareEngine,
  onCareNotification,
} from "./lib/care/engine";
import { pushNotification } from "./lib/care/notifications";
import { startPresenceTracking, stopPresenceTracking } from "./lib/presence/tracker";
import { startPresenceInjector, stopPresenceInjector } from "./lib/presence/injector";
import { loadAmbientSettings, resetAmbientSession } from "./lib/care/ambient-whisper";
import { loadPhoneWhisperSettings } from "./lib/whisper/phone-manager";
import { loadInitiativeSettings, initCompanionMessages } from "./lib/care/companion-messages";
import WhisperToastContainer from "./components/Whisper/WhisperToast";
import {
  createProject,
  switchSession,
  getActiveSession,
  getHomeSession,
  renameSession,
  deleteProject,
} from "./lib/sessions/manager";
import { listSessions } from "./lib/database";
import type { Session } from "./lib/types";

type View = "chat" | "browser" | "vault" | "archive" | "settings";

export default function App() {
  const [activeView, setActiveView] = useState<View>("chat");
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionVersion, setSessionVersion] = useState(0);

  // Load sessions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listSessions();
        if (!cancelled) setSessions(all);
        const active = await getActiveSession();
        if (!cancelled) setActiveSession(active);
      } catch {
        // Session load failed — will retry on interaction
      }
    })();
    return () => { cancelled = true; };
  }, [sessionVersion]);

  // Start care engine + presence tracking on mount
  useEffect(() => {
    startCareEngine().catch(() => {});
    startPresenceTracking().catch(() => {});
    startPresenceInjector();
    loadAmbientSettings().catch(() => {});
    loadPhoneWhisperSettings().catch(() => {});
    resetAmbientSession();
    loadInitiativeSettings().catch(() => {});
    initCompanionMessages();
    const unsub = onCareNotification(pushNotification);
    return () => {
      unsub();
      stopCareEngine();
      stopPresenceInjector();
      stopPresenceTracking();
    };
  }, []);

  const refreshSessions = useCallback(() => {
    setSessionVersion((v) => v + 1);
  }, []);

  // Listen for companion-triggered session renames
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, name } = (e as CustomEvent<{ id: string; name: string }>).detail;
      setActiveSession((prev) => prev?.id === id ? { ...prev, name } : prev);
      refreshSessions();
    };
    window.addEventListener("session-renamed", handler);
    return () => window.removeEventListener("session-renamed", handler);
  }, [refreshSessions]);

  const handleSessionSwitch = useCallback(async (session: Session) => {
    try {
      const switched = await switchSession(session.id);
      setActiveSession(switched);
      setActiveView("chat");
      refreshSessions();
      window.dispatchEvent(new CustomEvent("session-changed", { detail: switched }));
    } catch {
      // Switch failed
    }
  }, [refreshSessions]);

  const handleSessionCreate = useCallback(async (name: string) => {
    try {
      const session = await createProject(name);
      setActiveSession(session);
      setActiveView("chat");
      refreshSessions();
      window.dispatchEvent(new CustomEvent("session-changed", { detail: session }));
    } catch {
      // Create failed
    }
  }, [refreshSessions]);

  const handleSessionRename = useCallback(async (sessionId: string, name: string) => {
    try {
      await renameSession(sessionId, name);
      refreshSessions();
    } catch {
      // Rename failed
    }
  }, [refreshSessions]);

  const handleSessionDelete = useCallback(async (sessionId: string) => {
    try {
      await deleteProject(sessionId);
      refreshSessions();
      // If we deleted the active session, manager switches to home
      const active = await getActiveSession();
      setActiveSession(active);
      window.dispatchEvent(new CustomEvent("session-changed", { detail: active }));
    } catch {
      // Delete failed
    }
  }, [refreshSessions]);

  const handleGoHome = useCallback(async () => {
    try {
      const home = await getHomeSession();
      const switched = await switchSession(home.id);
      setActiveSession(switched);
      setActiveView("chat");
      refreshSessions();
      window.dispatchEvent(new CustomEvent("session-changed", { detail: switched }));
    } catch {
      // Go home failed
    }
  }, [refreshSessions]);

  const handleHeaderRename = useCallback(async (name: string) => {
    if (!activeSession) return;
    await handleSessionRename(activeSession.id, name);
    setActiveSession((prev) => prev ? { ...prev, name } : prev);
  }, [activeSession, handleSessionRename]);

  const toggleRightPanel = useCallback(() => {
    setRightPanelOpen((prev) => !prev);
  }, []);

  const showRightPanel = rightPanelOpen && activeView !== "browser";

  return (
    <div className="flex h-screen bg-anchor-bg text-anchor-text overflow-hidden">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        onAbout={() => setAboutOpen(true)}
        sessions={sessions}
        activeSession={activeSession}
        onSessionSwitch={handleSessionSwitch}
        onSessionCreate={handleSessionCreate}
        onSessionRename={handleSessionRename}
        onSessionDelete={handleSessionDelete}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center justify-between px-4 border-b border-anchor-border shrink-0">
          <SessionHeader
            session={activeSession}
            onRename={handleHeaderRename}
            onGoHome={handleGoHome}
            messageCount={0}
          />
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
          {activeView === "archive" && <ArchiveView />}
          {activeView === "settings" && <SettingsView />}
        </div>
      </main>

      {showRightPanel && (
        <aside className="w-72 border-l border-anchor-border bg-anchor-surface p-4 shrink-0">
          <div className="text-sm text-anchor-muted">Context panel</div>
        </aside>
      )}

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      <WhisperToastContainer />
    </div>
  );
}
