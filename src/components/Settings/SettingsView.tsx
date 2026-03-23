import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "../../lib/database";
import { Provider } from "../../lib/types";
import {
  getCareSettings,
  saveCareSettings,
} from "../../lib/care/engine";
import {
  REMINDER_TYPES,
  DEFAULT_CARE_SETTINGS,
  type CareSettings,
  type ReminderTone,
} from "../../lib/care/reminders";

interface SettingsState {
  provider: Provider;
  apiKey: string;
  model: string;
  systemPromptPath: string;
  careEngineEnabled: boolean;
  heartbeatThreshold: number;
  theme: "light" | "dark";
}

const DEFAULT_SETTINGS: SettingsState = {
  provider: Provider.Anthropic,
  apiKey: "",
  model: "claude-sonnet-4-20250514",
  systemPromptPath: "",
  careEngineEnabled: true,
  heartbeatThreshold: 30,
  theme: "dark",
};

export default function SettingsView() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [care, setCare] = useState<CareSettings>({ ...DEFAULT_CARE_SETTINGS });
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    loadSettings();
    setCare(getCareSettings());
  }, []);

  async function loadSettings() {
    try {
      const provider = await getSetting("provider");
      const encryptedKey = await getSetting("apiKey");
      const model = await getSetting("model");
      const systemPromptPath = await getSetting("systemPromptPath");
      const careEngineEnabled = await getSetting("careEngineEnabled");
      const heartbeatThreshold = await getSetting("heartbeatThreshold");
      const theme = await getSetting("theme");

      let apiKey = "";
      if (encryptedKey) {
        apiKey = await invoke<string>("decrypt_string", { ciphertext: encryptedKey });
      }

      setSettings({
        provider: (provider as Provider) ?? DEFAULT_SETTINGS.provider,
        apiKey,
        model: model ?? DEFAULT_SETTINGS.model,
        systemPromptPath: systemPromptPath ?? DEFAULT_SETTINGS.systemPromptPath,
        careEngineEnabled: careEngineEnabled !== null ? careEngineEnabled === "true" : DEFAULT_SETTINGS.careEngineEnabled,
        heartbeatThreshold: heartbeatThreshold !== null ? parseInt(heartbeatThreshold, 10) : DEFAULT_SETTINGS.heartbeatThreshold,
        theme: (theme as "light" | "dark") ?? DEFAULT_SETTINGS.theme,
      });
    } catch {
      setStatus("Failed to load settings");
    }
  }

  async function saveSettings() {
    try {
      setStatus("Saving...");

      await setSetting("provider", settings.provider);
      await setSetting("model", settings.model);
      await setSetting("systemPromptPath", settings.systemPromptPath);
      await setSetting("careEngineEnabled", String(settings.careEngineEnabled));
      await setSetting("heartbeatThreshold", String(settings.heartbeatThreshold));
      await setSetting("theme", settings.theme);

      if (settings.apiKey) {
        const encrypted = await invoke<string>("encrypt_string", { plaintext: settings.apiKey });
        await setSetting("apiKey", encrypted);
      }

      // Save care engine settings
      await saveCareSettings(care);

      setStatus("Settings saved");
      setTimeout(() => setStatus(""), 2000);
    } catch {
      setStatus("Failed to save settings");
    }
  }

  function updateField<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-anchor-muted uppercase tracking-wide">API Configuration</h3>

        <label className="block">
          <span className="text-sm text-anchor-muted">Provider</span>
          <select
            value={settings.provider}
            onChange={(e) => updateField("provider", e.target.value as Provider)}
            className="mt-1 block w-full bg-anchor-surface border border-anchor-border rounded px-3 py-2 text-sm text-anchor-text"
          >
            <option value={Provider.Anthropic}>Anthropic</option>
            <option value={Provider.OpenAI}>OpenAI</option>
            <option value={Provider.Google}>Google</option>
            <option value={Provider.OpenRouter}>OpenRouter</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-anchor-muted">API Key</span>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => updateField("apiKey", e.target.value)}
            placeholder="Enter your API key"
            className="mt-1 block w-full bg-anchor-surface border border-anchor-border rounded px-3 py-2 text-sm text-anchor-text"
          />
        </label>

        <label className="block">
          <span className="text-sm text-anchor-muted">Model</span>
          <input
            type="text"
            value={settings.model}
            onChange={(e) => updateField("model", e.target.value)}
            className="mt-1 block w-full bg-anchor-surface border border-anchor-border rounded px-3 py-2 text-sm text-anchor-text"
          />
        </label>

        <label className="block">
          <span className="text-sm text-anchor-muted">System Prompt File Path</span>
          <input
            type="text"
            value={settings.systemPromptPath}
            onChange={(e) => updateField("systemPromptPath", e.target.value)}
            placeholder="/path/to/system-prompt.txt"
            className="mt-1 block w-full bg-anchor-surface border border-anchor-border rounded px-3 py-2 text-sm text-anchor-text"
          />
        </label>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-anchor-muted uppercase tracking-wide">Care Engine</h3>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.careEngineEnabled}
            onChange={(e) => updateField("careEngineEnabled", e.target.checked)}
            className="rounded border-anchor-border"
          />
          <span className="text-sm">Enable Care Engine</span>
        </label>

        <label className="block">
          <span className="text-sm text-anchor-muted">
            Heartbeat Threshold (minutes)
          </span>
          <input
            type="number"
            value={settings.heartbeatThreshold}
            onChange={(e) => updateField("heartbeatThreshold", parseInt(e.target.value, 10) || 0)}
            min={1}
            max={1440}
            className="mt-1 block w-32 bg-anchor-surface border border-anchor-border rounded px-3 py-2 text-sm text-anchor-text"
          />
        </label>

        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-medium text-anchor-muted uppercase tracking-wide">Reminder Tone</h4>
          <select
            value={care.tone}
            onChange={(e) => setCare((prev) => ({ ...prev, tone: e.target.value as ReminderTone }))}
            className="block w-48 bg-anchor-surface border border-anchor-border rounded px-3 py-2 text-sm text-anchor-text"
          >
            <option value="gentle">Gentle</option>
            <option value="direct">Direct</option>
            <option value="playful">Playful</option>
          </select>
        </div>

        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-medium text-anchor-muted uppercase tracking-wide">Quiet Hours</h4>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={care.quietHoursStart}
              onChange={(e) => setCare((prev) => ({ ...prev, quietHoursStart: e.target.value }))}
              className="bg-anchor-surface border border-anchor-border rounded px-2 py-1.5 text-sm text-anchor-text"
            />
            <span className="text-sm text-anchor-muted">to</span>
            <input
              type="time"
              value={care.quietHoursEnd}
              onChange={(e) => setCare((prev) => ({ ...prev, quietHoursEnd: e.target.value }))}
              className="bg-anchor-surface border border-anchor-border rounded px-2 py-1.5 text-sm text-anchor-text"
            />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-medium text-anchor-muted uppercase tracking-wide">Reminders</h4>
          {REMINDER_TYPES.map((rt) => {
            const cfg = care.reminders[rt.key];
            if (!cfg) return null;
            return (
              <div key={rt.key} className="flex items-start gap-3 p-3 rounded bg-anchor-bg/50 border border-anchor-border">
                <span className="text-base mt-0.5">{rt.icon}</span>
                <div className="flex-1 space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={cfg.enabled}
                      onChange={(e) => {
                        const next = { ...care };
                        next.reminders = { ...next.reminders, [rt.key]: { ...cfg, enabled: e.target.checked } };
                        setCare(next);
                      }}
                      className="rounded border-anchor-border"
                    />
                    <span className="text-sm capitalize">{rt.key.replace("_", " ")}</span>
                  </label>

                  {rt.defaultInterval > 0 ? (
                    <label className="flex items-center gap-2">
                      <span className="text-xs text-anchor-muted">Every</span>
                      <input
                        type="number"
                        value={cfg.interval}
                        onChange={(e) => {
                          const next = { ...care };
                          next.reminders = { ...next.reminders, [rt.key]: { ...cfg, interval: parseInt(e.target.value, 10) || 1 } };
                          setCare(next);
                        }}
                        min={1}
                        max={1440}
                        className="w-20 bg-anchor-surface border border-anchor-border rounded px-2 py-1 text-sm text-anchor-text"
                      />
                      <span className="text-xs text-anchor-muted">min</span>
                    </label>
                  ) : (
                    <div className="space-y-1">
                      <span className="text-xs text-anchor-muted">Times</span>
                      <div className="flex flex-wrap gap-1">
                        {cfg.times.map((t, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <input
                              type="time"
                              value={t}
                              onChange={(e) => {
                                const newTimes = [...cfg.times];
                                newTimes[i] = e.target.value;
                                const next = { ...care };
                                next.reminders = { ...next.reminders, [rt.key]: { ...cfg, times: newTimes } };
                                setCare(next);
                              }}
                              className="bg-anchor-surface border border-anchor-border rounded px-2 py-1 text-xs text-anchor-text"
                            />
                            <button
                              onClick={() => {
                                const newTimes = cfg.times.filter((_, j) => j !== i);
                                const next = { ...care };
                                next.reminders = { ...next.reminders, [rt.key]: { ...cfg, times: newTimes } };
                                setCare(next);
                              }}
                              className="text-anchor-muted hover:text-anchor-text text-xs"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const next = { ...care };
                            next.reminders = { ...next.reminders, [rt.key]: { ...cfg, times: [...cfg.times, "12:00"] } };
                            setCare(next);
                          }}
                          className="text-xs text-anchor-accent hover:text-anchor-accent-hover px-2 py-1"
                        >
                          + Add time
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-anchor-muted uppercase tracking-wide">Appearance</h3>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.theme === "dark"}
            onChange={(e) => updateField("theme", e.target.checked ? "dark" : "light")}
            className="rounded border-anchor-border"
          />
          <span className="text-sm">Dark theme</span>
        </label>
      </section>

      <div className="flex items-center gap-4 pt-4 border-t border-anchor-border">
        <button
          onClick={saveSettings}
          className="px-4 py-2 text-sm bg-anchor-accent hover:bg-anchor-accent-hover text-white rounded transition-colors"
        >
          Save Settings
        </button>
        {status && (
          <span className="text-sm text-anchor-muted">{status}</span>
        )}
      </div>
    </div>
  );
}
