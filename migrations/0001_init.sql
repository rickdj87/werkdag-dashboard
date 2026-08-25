-- Initieel D1-schema voor werkdag-dashboard
-- Vervangt de GitHub JSON-bestanden in data/ en localStorage als opslag.

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  priority TEXT,
  date TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pct INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  deadline TEXT,
  color TEXT,
  subtasks TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  content TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agenda_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT,
  start TEXT,
  end TEXT,
  location TEXT,
  join_url TEXT
);
