// data/db.js — AI DC Platform DB (sql.js, pure-JS SQLite)
import initSqlJs from 'sql.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = join(DATA_DIR, 'users.db');

export let db;

export function persist() {
  writeFileSync(DB_PATH, Buffer.from(db.export()));
}

export async function initDb() {
  const SQL = await initSqlJs();
  db = existsSync(DB_PATH)
    ? new SQL.Database(readFileSync(DB_PATH))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now')),
      last_login    TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until  TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1
    );
  `);

  // 스키마 마이그레이션 (기존 DB 컬럼 추가)
  for (const col of [
    "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'learner'",
    'ALTER TABLE users ADD COLUMN cohort_id TEXT',
    'ALTER TABLE users ADD COLUMN deleted_at TEXT',
  ]) { try { db.run(col); } catch {} }

  db.run(`
    CREATE TABLE IF NOT EXISTS cohorts (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now')),
      created_by  TEXT REFERENCES users(id)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          TEXT PRIMARY KEY,
      actor_id    TEXT NOT NULL,
      action      TEXT NOT NULL,
      target_type TEXT,
      target_id   TEXT,
      payload     TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now'))
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS cases (
      id                   TEXT PRIMARY KEY,
      user_id              TEXT NOT NULL REFERENCES users(id),
      conversation_history TEXT NOT NULL DEFAULT '[]',
      case_data            TEXT,
      sim_type             TEXT NOT NULL DEFAULT 'inbasket',
      status               TEXT NOT NULL DEFAULT 'drafting',
      created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now')),
      updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now'))
    );
  `);
  persist();
}

// ── 공통 헬퍼 ────────────────────────────────────────────────────
export function queryRow(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

export function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ── Auth 함수 ────────────────────────────────────────────────────
export function createUser(id, email, passwordHash, name) {
  db.run('INSERT INTO users (id,email,password_hash,name) VALUES (?,?,?,?)',
    [id, email, passwordHash, name]);
  persist();
  return getUserById(id);
}

export function getUserByEmail(email) {
  return queryRow('SELECT * FROM users WHERE lower(email)=lower(?)', [email]);
}

export function getUserById(id) {
  return queryRow('SELECT * FROM users WHERE id=?', [id]);
}

export function incrementFailedLogin(id) {
  db.run(`UPDATE users SET failed_attempts=failed_attempts+1,
    locked_until=CASE WHEN failed_attempts+1>=5
      THEN strftime('%Y-%m-%d %H:%M:%S','now','+30 minutes') ELSE locked_until END
    WHERE id=?`, [id]);
  persist();
}

export function resetFailedLogin(id) {
  db.run("UPDATE users SET failed_attempts=0,locked_until=NULL,last_login=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?",
    [id]);
  persist();
}

// ── Cases 함수 ───────────────────────────────────────────────────
export function createCase(id, userId, simType = 'inbasket') {
  db.run(
    "INSERT INTO cases (id,user_id,sim_type) VALUES (?,?,?)",
    [id, userId, simType]
  );
  persist();
  return getCaseById(id);
}

export function getCaseById(id) {
  return queryRow('SELECT * FROM cases WHERE id=?', [id]);
}

export function updateCaseHistory(id, history, caseData = null, status = null) {
  const historyJson = JSON.stringify(history);
  if (caseData !== null && status !== null) {
    db.run(
      "UPDATE cases SET conversation_history=?,case_data=?,status=?,updated_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?",
      [historyJson, JSON.stringify(caseData), status, id]
    );
  } else if (caseData !== null) {
    db.run(
      "UPDATE cases SET conversation_history=?,case_data=?,updated_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?",
      [historyJson, JSON.stringify(caseData), id]
    );
  } else {
    db.run(
      "UPDATE cases SET conversation_history=?,updated_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?",
      [historyJson, id]
    );
  }
  persist();
}

export function finalizeCase(id, caseData) {
  db.run(
    "UPDATE cases SET case_data=?,status='finalized',updated_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?",
    [JSON.stringify(caseData), id]
  );
  persist();
}

export function listUserCases(userId, simType = null) {
  if (simType) {
    return queryAll(
      "SELECT id,sim_type,status,case_data,created_at FROM cases WHERE user_id=? AND sim_type=? ORDER BY created_at DESC",
      [userId, simType]
    );
  }
  return queryAll(
    "SELECT id,sim_type,status,case_data,created_at FROM cases WHERE user_id=? ORDER BY created_at DESC",
    [userId]
  );
}

export function purgeInvalidNames() {
  const stmt = db.prepare("DELETE FROM users WHERE name LIKE '%<%' OR name LIKE '%>%'");
  stmt.run();
  const changed = db.exec('SELECT changes() AS n')[0]?.values?.[0]?.[0] ?? 0;
  stmt.free();
  if (changed > 0) persist();
  return changed;
}
