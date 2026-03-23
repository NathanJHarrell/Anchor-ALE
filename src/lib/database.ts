import Database from "@tauri-apps/plugin-sql";
import type { Session, SessionMessage, DateEntry, MoodEntry, HandoffLetter } from "./types";

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) return db;
  db = await Database.load("sqlite:anchor.db");
  await initTables(db);
  await ensureHomeSession(db);
  return db;
}

async function initTables(database: Database): Promise<void> {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS bridge_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      token_count INTEGER NOT NULL,
      summary TEXT NOT NULL,
      session_id TEXT NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS browser_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      interval INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fired INTEGER NOT NULL DEFAULT 0
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Home',
      type TEXT NOT NULL DEFAULT 'home',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      vault_files TEXT,
      companion_name TEXT
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS session_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      token_estimate INTEGER DEFAULT 0,
      images_json TEXT
    )
  `);

  // Migration: add images_json column if missing (existing installs)
  try {
    await database.execute(`ALTER TABLE session_messages ADD COLUMN images_json TEXT`);
  } catch {
    // Column already exists — ignore
  }

  await database.execute(`
    CREATE TABLE IF NOT EXISTS dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'anniversary',
      recurring INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS mood_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES sessions(id),
      encrypted_content TEXT NOT NULL,
      iv TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS handoff_letters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_session_id TEXT NOT NULL,
      to_session_id TEXT,
      encrypted_content TEXT NOT NULL,
      iv TEXT NOT NULL,
      summary_context TEXT,
      created_at INTEGER NOT NULL
    )
  `);
}

export async function getSetting(key: string): Promise<string | null> {
  const database = await getDatabase();
  const rows = await database.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
  return rows.length > 0 ? rows[0]!.value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)",
    [key, value]
  );
}

// ── Browser history ────────────────────────────────────────────

export async function addBrowserHistory(url: string, title: string): Promise<void> {
  const database = await getDatabase();
  await database.execute(
    "INSERT INTO browser_history (url, title, timestamp) VALUES ($1, $2, $3)",
    [url, title, Date.now()]
  );
}

export async function getBrowserHistory(limit = 100): Promise<{ id: number; url: string; title: string; timestamp: number }[]> {
  const database = await getDatabase();
  return database.select(
    "SELECT id, url, title, timestamp FROM browser_history ORDER BY timestamp DESC LIMIT $1",
    [limit]
  );
}

export async function clearBrowserHistory(): Promise<void> {
  const database = await getDatabase();
  await database.execute("DELETE FROM browser_history");
}

// ── Bookmarks ──────────────────────────────────────────────────

export async function getBookmarks(): Promise<{ id: number; label: string; url: string; icon: string; sort_order: number }[]> {
  const database = await getDatabase();
  return database.select(
    "SELECT id, label, url, icon, sort_order FROM bookmarks ORDER BY sort_order ASC"
  );
}

export async function addBookmark(label: string, url: string, icon: string): Promise<void> {
  const database = await getDatabase();
  const rows = await database.select<{ max_order: number | null }[]>(
    "SELECT MAX(sort_order) as max_order FROM bookmarks"
  );
  const nextOrder = (rows[0]?.max_order ?? -1) + 1;
  await database.execute(
    "INSERT INTO bookmarks (label, url, icon, sort_order) VALUES ($1, $2, $3, $4)",
    [label, url, icon, nextOrder]
  );
}

export async function removeBookmark(id: number): Promise<void> {
  const database = await getDatabase();
  await database.execute("DELETE FROM bookmarks WHERE id = $1", [id]);
}

// ── Bridge history ────────────────────────────────────────────

export async function logBridgeEvent(
  tokenCount: number,
  summary: string,
  sessionId: string,
): Promise<void> {
  const database = await getDatabase();
  await database.execute(
    "INSERT INTO bridge_history (timestamp, token_count, summary, session_id) VALUES ($1, $2, $3, $4)",
    [Date.now(), tokenCount, summary, sessionId],
  );
}

export async function getBridgeHistory(
  sessionId?: string,
  limit = 50,
): Promise<{ id: number; timestamp: number; token_count: number; summary: string; session_id: string }[]> {
  const database = await getDatabase();
  if (sessionId) {
    return database.select(
      "SELECT id, timestamp, token_count, summary, session_id FROM bridge_history WHERE session_id = $1 ORDER BY timestamp DESC LIMIT $2",
      [sessionId, limit],
    );
  }
  return database.select(
    "SELECT id, timestamp, token_count, summary, session_id FROM bridge_history ORDER BY timestamp DESC LIMIT $1",
    [limit],
  );
}

// ── Home session bootstrap ───────────────────────────────────

async function ensureHomeSession(database: Database): Promise<void> {
  const rows = await database.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM sessions"
  );
  if (rows[0]!.count === 0) {
    const now = Date.now();
    const id = crypto.randomUUID();
    await database.execute(
      "INSERT INTO sessions (id, name, type, created_at, updated_at, is_active) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, "Home", "home", now, now, 1]
    );
  }
}

// ── Sessions ─────────────────────────────────────────────────

interface SessionRow {
  id: string;
  name: string;
  type: string;
  created_at: number;
  updated_at: number;
  is_active: number;
  vault_files: string | null;
  companion_name: string | null;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Session["type"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active === 1,
    vaultFiles: row.vault_files ? JSON.parse(row.vault_files) as string[] : [],
    companionName: row.companion_name,
  };
}

export async function createSession(
  name: string,
  type: Session["type"],
  opts?: { vaultFiles?: string[]; companionName?: string | null },
): Promise<Session> {
  const database = await getDatabase();
  const now = Date.now();
  const id = crypto.randomUUID();
  await database.execute(
    "INSERT INTO sessions (id, name, type, created_at, updated_at, is_active, vault_files, companion_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [id, name, type, now, now, 0, opts?.vaultFiles ? JSON.stringify(opts.vaultFiles) : null, opts?.companionName ?? null]
  );
  return { id, name, type, createdAt: now, updatedAt: now, isActive: false, vaultFiles: opts?.vaultFiles ?? [], companionName: opts?.companionName ?? null };
}

export async function getSession(id: string): Promise<Session | null> {
  const database = await getDatabase();
  const rows = await database.select<SessionRow[]>(
    "SELECT * FROM sessions WHERE id = $1",
    [id]
  );
  return rows.length > 0 ? rowToSession(rows[0]!) : null;
}

export async function listSessions(): Promise<Session[]> {
  const database = await getDatabase();
  const rows = await database.select<SessionRow[]>(
    "SELECT * FROM sessions ORDER BY updated_at DESC"
  );
  return rows.map(rowToSession);
}

export async function updateSession(
  id: string,
  updates: Partial<Pick<Session, "name" | "vaultFiles" | "companionName">>,
): Promise<void> {
  const database = await getDatabase();
  const sets: string[] = ["updated_at = $1"];
  const params: (string | number | null)[] = [Date.now()];
  let idx = 2;

  if (updates.name !== undefined) {
    sets.push(`name = $${idx}`);
    params.push(updates.name);
    idx++;
  }
  if (updates.vaultFiles !== undefined) {
    sets.push(`vault_files = $${idx}`);
    params.push(JSON.stringify(updates.vaultFiles));
    idx++;
  }
  if (updates.companionName !== undefined) {
    sets.push(`companion_name = $${idx}`);
    params.push(updates.companionName);
    idx++;
  }

  params.push(id);
  await database.execute(
    `UPDATE sessions SET ${sets.join(", ")} WHERE id = $${idx}`,
    params
  );
}

export async function setActiveSession(id: string): Promise<void> {
  const database = await getDatabase();
  await database.execute("UPDATE sessions SET is_active = 0");
  await database.execute(
    "UPDATE sessions SET is_active = 1, updated_at = $1 WHERE id = $2",
    [Date.now(), id]
  );
}

export async function getActiveSession(): Promise<Session | null> {
  const database = await getDatabase();
  const rows = await database.select<SessionRow[]>(
    "SELECT * FROM sessions WHERE is_active = 1 LIMIT 1"
  );
  return rows.length > 0 ? rowToSession(rows[0]!) : null;
}

export async function deleteSession(id: string): Promise<void> {
  const database = await getDatabase();
  await database.execute("DELETE FROM session_messages WHERE session_id = $1", [id]);
  await database.execute("DELETE FROM mood_journal WHERE session_id = $1", [id]);
  await database.execute("DELETE FROM sessions WHERE id = $1", [id]);
}

// ── Session Messages ─────────────────────────────────────────

interface SessionMessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  token_estimate: number;
  images_json: string | null;
}

function rowToSessionMessage(row: SessionMessageRow): SessionMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as SessionMessage["role"],
    content: row.content,
    timestamp: row.timestamp,
    tokenEstimate: row.token_estimate,
    imagesJson: row.images_json ?? undefined,
  };
}

export async function addSessionMessage(
  sessionId: string,
  role: SessionMessage["role"],
  content: string,
  tokenEstimate = 0,
  imagesJson?: string | null,
): Promise<void> {
  const database = await getDatabase();
  await database.execute(
    "INSERT INTO session_messages (session_id, role, content, timestamp, token_estimate, images_json) VALUES ($1, $2, $3, $4, $5, $6)",
    [sessionId, role, content, Date.now(), tokenEstimate, imagesJson ?? null]
  );
}

export async function getSessionMessages(
  sessionId: string,
  limit = 100,
  offset = 0,
): Promise<SessionMessage[]> {
  const database = await getDatabase();
  const rows = await database.select<SessionMessageRow[]>(
    "SELECT * FROM session_messages WHERE session_id = $1 ORDER BY timestamp ASC LIMIT $2 OFFSET $3",
    [sessionId, limit, offset]
  );
  return rows.map(rowToSessionMessage);
}

export async function getSessionMessageCount(sessionId: string): Promise<number> {
  const database = await getDatabase();
  const rows = await database.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM session_messages WHERE session_id = $1",
    [sessionId]
  );
  return rows[0]!.count;
}

export async function clearSessionMessages(sessionId: string): Promise<void> {
  const database = await getDatabase();
  await database.execute("DELETE FROM session_messages WHERE session_id = $1", [sessionId]);
}

// ── Dates ────────────────────────────────────────────────────

interface DateRow {
  id: number;
  label: string;
  date: string;
  type: string;
  recurring: number;
  created_at: number;
}

function rowToDateEntry(row: DateRow): DateEntry {
  return {
    id: row.id,
    label: row.label,
    date: row.date,
    type: row.type as DateEntry["type"],
    recurring: row.recurring === 1,
    createdAt: row.created_at,
  };
}

export async function addDate(
  label: string,
  date: string,
  type: DateEntry["type"] = "anniversary",
  recurring = true,
): Promise<void> {
  const database = await getDatabase();
  await database.execute(
    "INSERT INTO dates (label, date, type, recurring, created_at) VALUES ($1, $2, $3, $4, $5)",
    [label, date, type, recurring ? 1 : 0, Date.now()]
  );
}

export async function getDates(): Promise<DateEntry[]> {
  const database = await getDatabase();
  const rows = await database.select<DateRow[]>(
    "SELECT * FROM dates ORDER BY date ASC"
  );
  return rows.map(rowToDateEntry);
}

export async function getUpcomingDates(daysAhead: number): Promise<DateEntry[]> {
  const database = await getDatabase();
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + daysAhead);

  const todayStr = today.toISOString().split("T")[0]!;
  const endStr = endDate.toISOString().split("T")[0]!;

  // For recurring dates, match by month-day range; for non-recurring, match by full date range
  const rows = await database.select<DateRow[]>(
    `SELECT * FROM dates WHERE
      (recurring = 1 AND substr(date, 6) >= substr($1, 6) AND substr(date, 6) <= substr($2, 6))
      OR (recurring = 0 AND date >= $1 AND date <= $2)
    ORDER BY date ASC`,
    [todayStr, endStr]
  );
  return rows.map(rowToDateEntry);
}

export async function removeDate(id: number): Promise<void> {
  const database = await getDatabase();
  await database.execute("DELETE FROM dates WHERE id = $1", [id]);
}

export async function updateDate(
  id: number,
  updates: Partial<Pick<DateEntry, "label" | "date" | "type" | "recurring">>,
): Promise<void> {
  const database = await getDatabase();
  const sets: string[] = [];
  const params: (string | number)[] = [];
  let idx = 1;

  if (updates.label !== undefined) {
    sets.push(`label = $${idx}`);
    params.push(updates.label);
    idx++;
  }
  if (updates.date !== undefined) {
    sets.push(`date = $${idx}`);
    params.push(updates.date);
    idx++;
  }
  if (updates.type !== undefined) {
    sets.push(`type = $${idx}`);
    params.push(updates.type);
    idx++;
  }
  if (updates.recurring !== undefined) {
    sets.push(`recurring = $${idx}`);
    params.push(updates.recurring ? 1 : 0);
    idx++;
  }

  if (sets.length === 0) return;

  params.push(id);
  await database.execute(
    `UPDATE dates SET ${sets.join(", ")} WHERE id = $${idx}`,
    params
  );
}

// ── Mood Journal ─────────────────────────────────────────────

interface MoodRow {
  id: number;
  session_id: string | null;
  encrypted_content: string;
  iv: string;
  created_at: number;
}

function rowToMoodEntry(row: MoodRow): MoodEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    encryptedContent: row.encrypted_content,
    iv: row.iv,
    createdAt: row.created_at,
  };
}

export async function addMoodEntry(
  encryptedContent: string,
  iv: string,
  sessionId?: string,
): Promise<void> {
  const database = await getDatabase();
  await database.execute(
    "INSERT INTO mood_journal (session_id, encrypted_content, iv, created_at) VALUES ($1, $2, $3, $4)",
    [sessionId ?? null, encryptedContent, iv, Date.now()]
  );
}

export async function getMoodEntries(sessionId?: string): Promise<MoodEntry[]> {
  const database = await getDatabase();
  if (sessionId) {
    const rows = await database.select<MoodRow[]>(
      "SELECT * FROM mood_journal WHERE session_id = $1 ORDER BY created_at DESC",
      [sessionId]
    );
    return rows.map(rowToMoodEntry);
  }
  const rows = await database.select<MoodRow[]>(
    "SELECT * FROM mood_journal ORDER BY created_at DESC"
  );
  return rows.map(rowToMoodEntry);
}

export async function getLatestMoodEntry(): Promise<MoodEntry | null> {
  const database = await getDatabase();
  const rows = await database.select<MoodRow[]>(
    "SELECT * FROM mood_journal ORDER BY created_at DESC LIMIT 1"
  );
  return rows.length > 0 ? rowToMoodEntry(rows[0]!) : null;
}

// ── Handoff Letters ──────────────────────────────────────────

interface HandoffRow {
  id: number;
  from_session_id: string;
  to_session_id: string | null;
  encrypted_content: string;
  iv: string;
  summary_context: string | null;
  created_at: number;
}

function rowToHandoffLetter(row: HandoffRow): HandoffLetter {
  return {
    id: row.id,
    fromSessionId: row.from_session_id,
    toSessionId: row.to_session_id,
    encryptedContent: row.encrypted_content,
    iv: row.iv,
    summaryContext: row.summary_context,
    createdAt: row.created_at,
  };
}

export async function addHandoffLetter(
  fromSessionId: string,
  encryptedContent: string,
  iv: string,
  opts?: { toSessionId?: string; summaryContext?: string },
): Promise<void> {
  const database = await getDatabase();
  await database.execute(
    "INSERT INTO handoff_letters (from_session_id, to_session_id, encrypted_content, iv, summary_context, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [fromSessionId, opts?.toSessionId ?? null, encryptedContent, iv, opts?.summaryContext ?? null, Date.now()]
  );
}

export async function getHandoffLetter(sessionId: string): Promise<HandoffLetter | null> {
  const database = await getDatabase();
  const rows = await database.select<HandoffRow[]>(
    "SELECT * FROM handoff_letters WHERE from_session_id = $1 OR to_session_id = $1 ORDER BY created_at DESC LIMIT 1",
    [sessionId]
  );
  return rows.length > 0 ? rowToHandoffLetter(rows[0]!) : null;
}

export async function getLatestHandoffLetter(): Promise<HandoffLetter | null> {
  const database = await getDatabase();
  const rows = await database.select<HandoffRow[]>(
    "SELECT * FROM handoff_letters ORDER BY created_at DESC LIMIT 1"
  );
  return rows.length > 0 ? rowToHandoffLetter(rows[0]!) : null;
}
