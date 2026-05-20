// data/admin-store.js — Admin / Cohort / Audit DB functions
import { db, persist, queryRow, queryAll } from './db.js';
import { v4 as uuidv4 } from 'uuid';

// ── Audit Log ────────────────────────────────────────────────────
export function logAudit(actorId, action, targetType, targetId, payload = null) {
  db.run(
    'INSERT INTO audit_log (id,actor_id,action,target_type,target_id,payload) VALUES (?,?,?,?,?,?)',
    [uuidv4(), actorId, action, targetType ?? null, targetId ?? null,
     payload ? JSON.stringify(payload) : null]
  );
  persist();
}

export function listAuditLog({ limit = 50, offset = 0 } = {}) {
  const total = queryRow('SELECT COUNT(*) AS n FROM audit_log')?.n ?? 0;
  const rows = queryAll(
    'SELECT al.*, u.email AS actor_email, u.name AS actor_name FROM audit_log al LEFT JOIN users u ON al.actor_id=u.id ORDER BY al.created_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );
  return { total, limit, offset, rows };
}

// ── Admin Users ──────────────────────────────────────────────────
export function listUsers({ page = 1, limit = 20, search = '', cohortId = '', role = '' } = {}) {
  const offset = (page - 1) * limit;
  let where = "WHERE deleted_at IS NULL";
  const params = [];
  if (search) { where += " AND (name LIKE ? OR email LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
  if (cohortId) { where += " AND cohort_id=?"; params.push(cohortId); }
  if (role) { where += " AND role=?"; params.push(role); }

  const total = queryRow(`SELECT COUNT(*) AS n FROM users ${where}`, params)?.n ?? 0;
  params.push(limit, offset);
  const rows = queryAll(
    `SELECT id,email,name,role,cohort_id,created_at,last_login,failed_attempts,locked_until,is_active
     FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, params
  );
  return { total, page, limit, rows };
}

export function adminGetUser(id) {
  return queryRow(
    'SELECT id,email,name,role,cohort_id,created_at,last_login,failed_attempts,locked_until,is_active,deleted_at FROM users WHERE id=?',
    [id]
  );
}

export function unlockUser(id) {
  db.run("UPDATE users SET failed_attempts=0,locked_until=NULL WHERE id=?", [id]);
  persist();
}

export function setUserRole(id, role) {
  db.run("UPDATE users SET role=? WHERE id=? AND deleted_at IS NULL", [role, id]);
  persist();
}

export function softDeleteUser(id) {
  db.run("UPDATE users SET deleted_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?", [id]);
  persist();
}

// ── Admin Stats ──────────────────────────────────────────────────
export function adminOverview() {
  const total = queryRow("SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL")?.n ?? 0;
  const active = queryRow("SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL AND is_active=1")?.n ?? 0;
  const locked = queryRow("SELECT COUNT(*) AS n FROM users WHERE locked_until IS NOT NULL AND locked_until > strftime('%Y-%m-%d %H:%M:%S','now')")?.n ?? 0;
  const today = queryRow("SELECT COUNT(*) AS n FROM users WHERE DATE(created_at)=DATE('now')")?.n ?? 0;
  const byRole = queryAll("SELECT role, COUNT(*) AS n FROM users WHERE deleted_at IS NULL GROUP BY role");
  return { total, active, locked, registeredToday: today, byRole };
}

// ── Cohorts ──────────────────────────────────────────────────────
export function listCohorts() {
  return queryAll("SELECT * FROM cohorts ORDER BY created_at DESC");
}

export function getCohort(id) {
  return queryRow("SELECT * FROM cohorts WHERE id=?", [id]);
}

export function createCohort(id, name, description, createdBy) {
  db.run("INSERT INTO cohorts (id,name,description,created_by) VALUES (?,?,?,?)",
    [id, name, description ?? null, createdBy]);
  persist();
  return getCohort(id);
}

export function updateCohort(id, name, description) {
  db.run("UPDATE cohorts SET name=?,description=? WHERE id=?", [name, description ?? null, id]);
  persist();
}

export function deleteCohort(id) {
  db.run("UPDATE users SET cohort_id=NULL WHERE cohort_id=?", [id]);
  db.run("DELETE FROM cohorts WHERE id=?", [id]);
  persist();
}

export function assignUsersToCohort(cohortId, userIds) {
  for (const uid of userIds) {
    db.run("UPDATE users SET cohort_id=? WHERE id=? AND deleted_at IS NULL", [cohortId, uid]);
  }
  persist();
}

// ── Bulk User Create ─────────────────────────────────────────────
export function bulkCreateUsers(rows) {
  const results = { success: 0, skipped: 0, errors: [] };
  for (const row of rows) {
    const existing = queryRow("SELECT id FROM users WHERE lower(email)=lower(?)", [row.email]);
    if (existing) { results.skipped++; continue; }
    try {
      db.run('INSERT INTO users (id,email,password_hash,name,role,cohort_id) VALUES (?,?,?,?,?,?)',
        [row.id, row.email, row.passwordHash, row.name, row.role ?? 'learner', row.cohortId ?? null]);
      results.success++;
    } catch (e) {
      results.errors.push({ email: row.email, error: e.message });
    }
  }
  if (results.success > 0) persist();
  return results;
}
