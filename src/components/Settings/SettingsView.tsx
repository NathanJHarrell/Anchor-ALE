import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getSetting, setSetting } from "../../lib/database";
import { Provider } from "../../lib/types";
import type { VaultFile } from "../../lib/types";
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
import DatesManager from "./DatesManager";
import {
  getAmbientSettings,
  saveAmbientSettings,
  DEFAULT_AMBIENT_SETTINGS,
  type AmbientWhisperSettings,
  type AmbientFrequency,
} from "../../lib/care/ambient-whisper";
import {
  listFiles,
  getAutoLoadFiles,
  setAutoLoadFiles,
  getVaultLoadMode,
  setVaultLoadMode,
  estimateVaultTokens,
  type VaultLoadMode,
} from "../../lib/vault";

interface SettingsState {
  provider: Provider;
  apiKey: string;
  model: string;
  systemPromptPath: string;
  vaultPath: string;
  careEngineEnabled: boolean;
  heartbeatThreshold: number;
  theme: "light" | "dark";
}

const DEFAULT_SETTINGS: SettingsState = {
  provider: Provider.Anthropic,
  apiKey: "",
  model: "claude-sonnet-4-20250514",
  systemPromptPath: "",
  vaultPath: "",
  careEngineEnabled: true,
  heartbeatThreshold: 30,
  theme: "dark",
};

export default function SettingsView() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [care, setCare] = useState<CareSettings>({ ...DEFAULT_CARE_SETTINGS });
  const [ambient, setAmbient] = useState<AmbientWhisperSettings>({ ...DEFAULT_AMBIENT_SETTINGS });
  const [status, setStatus] = useState<string>("");

  // Vault loading state
  const [vaultLoadMode, setVaultLoadModeState] = useState<VaultLoadMode>("all");
  const [autoLoadFiles, setAutoLoadFilesState] = useState<string[]>([]);
  const [allVaultFiles, setAllVaultFiles] = useState<VaultFile[]>([]);
  const [vaultTokenEstimate, setVaultTokenEstimate] = useState<number>(0);
  const [specificTokenEstimate, setSpecificTokenEstimate] = useState<number>(0);

  useEffect(() => {
    loadSettings();
    setCare(getCareSettings());
    setAmbient(getAmbientSettings());
    loadVaultSettings();
  }, []);

  async function loadSettings() {
    try {
      const provider = await getSetting("provider");
      const encryptedKey = await getSetting("apiKey");
      const model = await getSetting("model");
      const systemPromptPath = await getSetting("systemPromptPath");
      const vaultPath = await getSetting("vaultPath");
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
        vaultPath: vaultPath ?? DEFAULT_SETTINGS.vaultPath,
        careEngineEnabled: careEngineEnabled !== null ? careEngineEnabled === "true" : DEFAULT_SETTINGS.careEngineEnabled,
        heartbeatThreshold: heartbeatThreshold !== null ? parseInt(heartbeatThreshold, 10) : DEFAULT_SETTINGS.heartbeatThreshold,
        theme: (theme as "light" | "dark") ?? DEFAULT_SETTINGS.theme,
      });
    } catch {
      setStatus("Failed to load settings");
    }
  }

  async function loadVaultSettings() {
    try {
      const mode = await getVaultLoadMode();
      setVaultLoadModeState(mode);
      const files = await getAutoLoadFiles();
      setAutoLoadFilesState(files);

      // Load all vault files for token estimation and file picker
      const all = await listFiles();
      setAllVaultFiles(all);
      setVaultTokenEstimate(estimateVaultTokens(all));

      // Estimate tokens for specific file selection
      const specificFiles = all.filter((f) => files.includes(f.path));
      setSpecificTokenEstimate(estimateVaultTokens(specificFiles));
    } catch {
      // Vault settings load failed — use defaults
    }
  }

  async function saveSettings() {
    try {
      setStatus("Saving...");

      await setSetting("provider", settings.provider);
      await setSetting("model", settings.model);
      await setSetting("systemPromptPath", settings.systemPromptPath);
      await setSetting("vaultPath", settings.vaultPath);
      await setSetting("careEngineEnabled", String(settings.careEngineEnabled));
      await setSetting("heartbeatThreshold", String(settings.heartbeatThreshold));
      await setSetting("theme", settings.theme);

      if (settings.apiKey) {
        const encrypted = await invoke<string>("encrypt_string", { plaintext: settings.apiKey });
        await setSetting("apiKey", encrypted);
      }

      // Save care engine settings
      await saveCareSettings(care);
      await saveAmbientSettings(ambient);

      // Save vault loading settings
      await setVaultLoadMode(vaultLoadMode);
      await setAutoLoadFiles(autoLoadFiles);

      setStatus("Settings saved");
      setTimeout(() => setStatus(""), 2000);
    } catch {
      setStatus("Failed to save settings");
    }
  }

  function updateField<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function browseVaultPath() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Vault Directory",
      });
      if (selected && typeof selected === "string") {
        updateField("vaultPath", selected);
      }
    } catch {
      // Dialog cancelled or failed
    }
  }

  function toggleAutoLoadFile(path: string) {
    setAutoLoadFilesState((prev) => {
      const next = prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path];
      // Update specific token estimate
      const specificFiles = allVaultFiles.filter((f) => next.includes(f.path));
      setSpecificTokenEstimate(estimateVaultTokens(specificFiles));
      return next;
    });
  }

  function formatTokens(count: number): string {
    if (count >= 1_000_000) return `~${(count / 1_000_000).toFixed(1)}M tokens`;
    if (count >= 1_000) return `~${(count / 1_000).toFixed(1)}K tokens`;
    return `~${count} tokens`;
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

        <div className="block">
          <span className="text-sm text-anchor-muted">Vault Directory Path</span>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={settings.vaultPath}
              onChange={(e) => updateField("vaultPath", e.target.value)}
              placeholder="Leave empty to use default vault"
              className="flex-1 bg-anchor-surface border border-anchor-border rounded px-3 py-2 text-sm text-anchor-text"
            />
            <button
              onClick={() => void browseVaultPath()}
              className="px-3 py-2 text-sm bg-anchor-surface border border-anchor-border rounded hover:border-anchor-accent/50 text-anchor-muted hover:text-anchor-text transition-colors"
            >
              Browse
            </button>
          </div>
          <p className="text-xs text-anchor-muted/60 mt-1">
            Point to an existing vault directory (e.g., your Obsidian vault)
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-anchor-muted uppercase tracking-wide">Vault Loading</h3>
        <p className="text-xs text-anchor-muted">
          Controls which vault files are injected as context for every conversation.
        </p>

        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="vaultLoadMode"
              checked={vaultLoadMode === "all"}
              onChange={() => setVaultLoadModeState("all")}
              className="accent-purple-500"
            />
            <div>
              <span className="text-sm">Load all vault files (recommended)</span>
              {allVaultFiles.length > 0 && (
                <span className="text-xs text-anchor-muted ml-2">
                  {allVaultFiles.length} file{allVaultFiles.length !== 1 ? "s" : ""} · {formatTokens(vaultTokenEstimate)}
                </span>
              )}
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="vaultLoadMode"
              checked={vaultLoadMode === "specific"}
              onChange={() => setVaultLoadModeState("specific")}
              className="accent-purple-500"
            />
            <div>
              <span className="text-sm">Load specific files only</span>
              {vaultLoadMode === "specific" && autoLoadFiles.length > 0 && (
                <span className="text-xs text-anchor-muted ml-2">
                  {autoLoadFiles.length} selected · {formatTokens(specificTokenEstimate)}
                </span>
              )}
            </div>
          </label>
        </div>

        {vaultLoadMode === "specific" && (
          <div className="space-y-1 max-h-48 overflow-y-auto rounded border border-anchor-border p-2 bg-anchor-bg/50">
            {allVaultFiles.length === 0 ? (
              <p className="text-xs text-anchor-muted/60 py-2 text-center">No vault files found.</p>
            ) : (
              allVaultFiles.map((file) => (
                <label key={file.path} className="flex items-center gap-2 py-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoLoadFiles.includes(file.path)}
                    onChange={() => toggleAutoLoadFile(file.path)}
                    className="rounded border-anchor-border accent-purple-500"
                  />
                  <span className="text-xs text-anchor-text truncate" title={file.path}>
                    {file.path}
                  </span>
                  <span className="text-xs text-anchor-muted/50 shrink-0">
                    {formatTokens(estimateVaultTokens([file]))}
                  </span>
                </label>
              ))
            )}
          </div>
        )}

        <div className="rounded bg-anchor-surface/50 border border-anchor-border px-3 py-2">
          <span className="text-xs text-anchor-muted">
            Estimated context cost:{" "}
            <span className="text-anchor-text font-mono">
              {formatTokens(vaultLoadMode === "all" ? vaultTokenEstimate : specificTokenEstimate)}
            </span>
            {" "}per message
          </span>
        </div>
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
        <h3 className="text-sm font-medium text-anchor-muted uppercase tracking-wide">Ambient Whispers</h3>
        <p className="text-xs text-anchor-muted">
          Companion-initiated thoughts that appear as gentle toasts outside the conversation.
        </p>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={ambient.enabled}
            onChange={(e) => setAmbient((prev) => ({ ...prev, enabled: e.target.checked }))}
            className="rounded border-anchor-border"
          />
          <span className="text-sm">Enable ambient whispers</span>
        </label>

        <div className="space-y-2">
          <span className="text-xs text-anchor-muted">Frequency</span>
          <div className="flex gap-2">
            {(["rare", "sometimes", "often"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setAmbient((prev) => ({ ...prev, frequency: f as AmbientFrequency }))}
                className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                  ambient.frequency === f
                    ? "border-purple-500 bg-purple-500/10 text-purple-400"
                    : "border-anchor-border text-anchor-muted hover:text-anchor-text"
                }`}
              >
                {f === "rare" ? "Rare (~1/50min)" : f === "sometimes" ? "Sometimes (~1/20min)" : "Often (~1/10min)"}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={ambient.soundEnabled}
            onChange={(e) => setAmbient((prev) => ({ ...prev, soundEnabled: e.target.checked }))}
            className="rounded border-anchor-border"
          />
          <span className="text-sm text-anchor-muted">Play sound on whisper <span className="text-xs">(coming soon)</span></span>
        </label>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-anchor-muted uppercase tracking-wide">Important Dates</h3>
        <DatesManager />
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
