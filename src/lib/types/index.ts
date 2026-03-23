export enum Provider {
  Anthropic = "anthropic",
  OpenAI = "openai",
  Google = "google",
  OpenRouter = "openrouter",
}

export interface MessageImage {
  type: 'base64';
  media_type: string;
  data: string;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  images?: MessageImage[];
}

export interface StreamChunk {
  text: string;
  done: boolean;
}

export interface APIConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface VaultFile {
  name: string;
  path: string;
  content: string;
  lastModified: number;
}

export interface Reminder {
  type: string;
  message: string;
  interval: number;
  enabled: boolean;
  lastFired: number;
}

export interface BridgeEvent {
  timestamp: number;
  tokenCount: number;
  summary: string;
  sessionId: string;
}

// ── Heartbeat types ──────────────────────────────────────────

export interface HeartbeatConfig {
  thresholdPercentage: number;
  summaryModel: string;
  showIndicator: boolean;
  autoBridge: boolean;
}

export interface HeartbeatStatus {
  tokensUsed: number;
  contextWindow: number;
  percentage: number;
  bridgeCount: number;
  sessionId: string;
}

export const CONTEXT_WINDOW_SIZES: Record<string, number> = {
  anthropic: 1_000_000,
  openai: 128_000,
  google: 1_000_000,
  openrouter: 128_000,
};

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  thresholdPercentage: 80,
  summaryModel: "cheapest",
  showIndicator: true,
  autoBridge: true,
};

// ── Browser types ──────────────────────────────────────────────

export interface BrowserHistoryEntry {
  id: number;
  url: string;
  title: string;
  timestamp: number;
}

export interface Bookmark {
  id: number;
  label: string;
  url: string;
  icon: string;
  sortOrder: number;
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
}

export interface NavigationState {
  canGoBack: boolean;
  canGoForward: boolean;
  currentUrl: string;
  isLoading: boolean;
}

// ── Session types ──────────────────────────────────────────────

export interface Session {
  id: string;
  name: string;
  type: 'home' | 'project';
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
  vaultFiles: string[];
  companionName: string | null;
}

export interface SessionMessage {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokenEstimate: number;
  imagesJson?: string;
}

// ── Date tracking types ────────────────────────────────────────

export interface DateEntry {
  id: number;
  label: string;
  date: string;
  type: 'anniversary' | 'birthday' | 'milestone' | 'custom';
  recurring: boolean;
  createdAt: number;
}

// ── Mood & Handoff types ───────────────────────────────────────

export interface MoodEntry {
  id: number;
  sessionId: string | null;
  encryptedContent: string;
  iv: string;
  createdAt: number;
}

export interface HandoffLetter {
  id: number;
  fromSessionId: string;
  toSessionId: string | null;
  encryptedContent: string;
  iv: string;
  summaryContext: string | null;
  createdAt: number;
}

// ── Presence & Whisper types ───────────────────────────────────

export interface WhisperToast {
  id: string;
  message: string;
  type: 'ambient' | 'care' | 'companion';
  timestamp: number;
  duration: number;
}

export interface PresenceState {
  status: 'active' | 'idle' | 'away' | 'closed';
  lastChange: number;
  currentSession: string | null;
}

// ── Import types ─────────────────────────────────────────────

export interface NormalizedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface NormalizedConversation {
  name: string;
  createdAt: number;
  messages: NormalizedMessage[];
}

export interface ImportOptions {
  skipEmpty: boolean;
  maxMessagesPerSession: number;
  deduplicate: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}
