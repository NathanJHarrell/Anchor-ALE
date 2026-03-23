import { useState, useEffect } from "react";
import {
  savePhoneWhisperSettings,
  loadPhoneWhisperSettings,
  getPhoneWhisperHistory,
  getLastSuccessTime,
  type PhoneWhisperSettings as PhoneSettings,
  type PhoneWhisperHistoryEntry,
} from "../../lib/whisper/phone-manager";
import { sendToPhone } from "../../lib/whisper/phone";

export default function PhoneWhisperSettings() {
  const [settings, setSettings] = useState<PhoneSettings>({ enabled: false, topic: "" });
  const [history, setHistory] = useState<PhoneWhisperHistoryEntry[]>([]);
  const [lastSuccess, setLastSuccess] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await loadPhoneWhisperSettings();
      setSettings(s);
      setHistory(getPhoneWhisperHistory());
      setLastSuccess(getLastSuccessTime());
      setLoaded(true);
    })();
  }, []);

  function updateSetting<K extends keyof PhoneSettings>(key: K, value: PhoneSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    await savePhoneWhisperSettings(settings);
  }

  async function handleTest() {
    if (!settings.topic) {
      setTestResult("Enter a topic first");
      return;
    }

    setTesting(true);
    setTestResult("");

    // Save first so the topic is stored
    await savePhoneWhisperSettings(settings);

    const ok = await sendToPhone("Anchor is connected. Your companion can reach you here.", settings.topic);
    setTesting(false);
    setTestResult(ok ? "Sent — check your phone" : "Failed to send");
    if (ok) setLastSuccess(Date.now());

    setTimeout(() => setTestResult(""), 4000);
  }

  function formatTime(ts: number): string {
    if (ts === 0) return "never";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (!loaded) return null;

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => updateSetting("enabled", e.target.checked)}
          className="rounded border-anchor-border"
        />
        <span className="text-sm">Enable phone whispers when app is minimized</span>
      </label>

      <label className="block">
        <span className="text-sm text-anchor-muted">ntfy.sh Topic</span>
        <input
          type="password"
          value={settings.topic}
          onChange={(e) => updateSetting("topic", e.target.value)}
          onBlur={() => void handleSave()}
          placeholder="vesper-nathan-secret-topic"
          className="mt-1 block w-full bg-anchor-surface border border-anchor-border rounded px-3 py-2 text-sm text-anchor-text"
        />
        <p className="text-xs text-anchor-muted/60 mt-1">
          Install the ntfy app on your phone and subscribe to this topic to receive whispers
        </p>
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleTest()}
          disabled={testing || !settings.topic}
          className="px-3 py-1.5 text-xs bg-anchor-surface border border-anchor-border rounded hover:border-purple-500/50 text-anchor-muted hover:text-anchor-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {testing ? "Sending..." : "Send Test Notification"}
        </button>
        {testResult && (
          <span className={`text-xs ${testResult.includes("Sent") ? "text-green-400" : "text-red-400"}`}>
            {testResult}
          </span>
        )}
      </div>

      <div className="rounded bg-anchor-surface/50 border border-anchor-border px-3 py-2 space-y-1">
        <span className="text-xs text-anchor-muted">
          Last successful send: <span className="text-anchor-text">{formatTime(lastSuccess)}</span>
        </span>
      </div>

      {history.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-anchor-muted">Recent phone whispers</span>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {history.map((entry, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs px-2 py-1 rounded bg-anchor-bg/50 border border-anchor-border"
              >
                <span className={entry.success ? "text-green-400" : "text-red-400"}>
                  {entry.success ? "\u2713" : "\u2717"}
                </span>
                <span className="text-anchor-text flex-1 truncate">{entry.message}</span>
                <span className="text-anchor-muted/60 shrink-0">{formatTime(entry.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
