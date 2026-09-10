import { DatabaseSync } from "node:sqlite";

/** Persistent single-host session adapter. Store on a private Russian volume. */
export function createSqliteSessionStore({ filename, now = Date.now }) {
  if (!filename || filename === ":memory:") throw new Error("durable_session_path_required");
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)");
  return {
    durable: true,
    get(id) {
      const row = db.prepare("SELECT value, expires FROM sessions WHERE id=?").get(id);
      if (!row) return null;
      if (row.expires <= now()) { this.delete(id); return null; }
      return JSON.parse(row.value);
    },
    put(id, value) {
      if (!Number.isFinite(value?.expiresAt) || value.expiresAt * 1000 <= now()) throw new Error("invalid_session_expiry");
      db.prepare("DELETE FROM sessions WHERE expires <= ?").run(now());
      db.prepare("INSERT OR REPLACE INTO sessions VALUES (?, ?, ?)").run(id, JSON.stringify(value), value.expiresAt * 1000);
    },
    delete(id) { db.prepare("DELETE FROM sessions WHERE id=?").run(id); },
    close() { db.close(); },
  };
}
