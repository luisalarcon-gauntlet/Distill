/**
 * Database layer using better-sqlite3.
 * Each wiki is a "project" with pages, sources, and a log.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "distill.db");

let _db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (_db) return _db;

  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Initialize schema
  _db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      topic TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'concept',
      content TEXT NOT NULL DEFAULT '',
      links TEXT DEFAULT '[]',
      source_count INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (id, project_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      authors TEXT DEFAULT '',
      year INTEGER,
      abstract TEXT DEFAULT '',
      url TEXT DEFAULT '',
      citation_count INTEGER DEFAULT 0,
      ingested_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pages_project ON pages(project_id);
    CREATE INDEX IF NOT EXISTS idx_sources_project ON sources(project_id);
    CREATE INDEX IF NOT EXISTS idx_log_project ON log(project_id);
  `);

  return _db;
}

// ─── Project operations ───

export function createProject(id: string, name: string, topic: string) {
  const db = getDB();
  db.prepare("INSERT INTO projects (id, name, topic) VALUES (?, ?, ?)").run(id, name, topic);
  return { id, name, topic };
}

export function getProject(id: string) {
  const db = getDB();
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
}

export function listProjects() {
  const db = getDB();
  return db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as any[];
}

export function deleteProject(id: string) {
  const db = getDB();
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
}

// ─── Page operations ───

export function upsertPage(
  projectId: string,
  page: { id: string; title: string; type: string; content: string; links: string[]; source_count: number }
) {
  const db = getDB();
  db.prepare(`
    INSERT INTO pages (id, project_id, title, type, content, links, source_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT (id, project_id) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      content = excluded.content,
      links = excluded.links,
      source_count = excluded.source_count,
      updated_at = datetime('now')
  `).run(page.id, projectId, page.title, page.type, page.content, JSON.stringify(page.links), page.source_count);
}

export function getPages(projectId: string) {
  const db = getDB();
  const rows = db.prepare("SELECT * FROM pages WHERE project_id = ? ORDER BY type, title").all(projectId) as any[];
  return rows.map((r: any) => ({ ...r, links: JSON.parse(r.links || "[]") }));
}

export function getPage(projectId: string, pageId: string) {
  const db = getDB();
  const row = db.prepare("SELECT * FROM pages WHERE project_id = ? AND id = ?").get(projectId, pageId) as any;
  if (row) row.links = JSON.parse(row.links || "[]");
  return row;
}

// ─── Source operations ───

export function addSource(
  projectId: string,
  source: { id: string; title: string; authors: string; year: number; abstract: string; url: string; citation_count: number }
) {
  const db = getDB();
  db.prepare(`
    INSERT OR IGNORE INTO sources (id, project_id, title, authors, year, abstract, url, citation_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(source.id, projectId, source.title, source.authors, source.year, source.abstract, source.url, source.citation_count);
}

export function getSources(projectId: string) {
  const db = getDB();
  return db.prepare("SELECT * FROM sources WHERE project_id = ? ORDER BY year DESC").all(projectId) as any[];
}

// ─── Log operations ───

export function addLog(projectId: string, action: string, detail: string) {
  const db = getDB();
  db.prepare("INSERT INTO log (project_id, action, detail) VALUES (?, ?, ?)").run(projectId, action, detail);
}

export function getLog(projectId: string, limit: number = 50) {
  const db = getDB();
  return db.prepare("SELECT * FROM log WHERE project_id = ? ORDER BY created_at DESC LIMIT ?").all(projectId, limit) as any[];
}
