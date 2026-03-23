import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) return db;
  db = await Database.load("sqlite:anchor.db");
  await initTables(db);
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
