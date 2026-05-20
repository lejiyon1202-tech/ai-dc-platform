// data/db.js — AI DC Platform 사용자 DB (sql.js, pure-JS SQLite)
import initSqlJs from 'sql.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = join(DATA_DIR, 'users.db');

let db;

function persist() {
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
  persist();
}

function getRow(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

export function createUser(id, email, passwordHash, name) {
  db.run(
    'INSERT INTO users (id,email,password_hash,name) VALUES (?,?,?,?)',
    [id, email, passwordHash, name]
  );
  persist();
  return getUserById(id);
}

export function getUserByEmail(email) {
  return getRow('SELECT * FROM users WHERE lower(email)=lower(?)', [email]);
}

export function getUserById(id) {
  return getRow('SELECT * FROM users WHERE id=?', [id]);
}

export function incrementFailedLogin(id) {
  db.run(`
    UPDATE users
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE
          WHEN failed_attempts + 1 >= 5
            THEN strftime('%Y-%m-%d %H:%M:%S','now','+30 minutes')
          ELSE locked_until
        END
    WHERE id=?
  `, [id]);
  persist();
}

export function resetFailedLogin(id) {
  db.run(
    "UPDATE users SET failed_attempts=0, locked_until=NULL, last_login=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?",
    [id]
  );
  persist();
}
