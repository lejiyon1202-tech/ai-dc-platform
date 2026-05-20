// routes/admin.js — Admin API (권한 3계층 + 학습자·코호트·CSV 관리)
import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  listUsers, adminGetUser, unlockUser, setUserRole, softDeleteUser, adminOverview,
  listCohorts, getCohort, createCohort, updateCohort, deleteCohort, assignUsersToCohort,
  bulkCreateUsers, logAudit, listAuditLog,
} from '../data/admin-store.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) =>
    file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')
      ? cb(null, true) : cb(new Error('CSV 파일만 허용됩니다.')),
});

// ── 권한 미들웨어 ────────────────────────────────────────────────
export function requireRole(role) {
  const hierarchy = { admin: 3, supervisor: 2, learner: 1 };
  return (req, res, next) => {
    const userRole = req.adminUser?.role ?? 'learner';
    if ((hierarchy[userRole] ?? 0) >= (hierarchy[role] ?? 99)) return next();
    res.status(403).json({ error: '권한이 없습니다.' });
  };
}

// router에 adminUser 주입 (server.js authRequired가 req.userId 세팅 후 호출됨)
router.use(async (req, res, next) => {
  const { getUserById } = await import('../data/db.js');
  const user = getUserById(req.userId);
  if (!user || user.deleted_at) return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });
  req.adminUser = user;
  next();
});

// ── Stats ────────────────────────────────────────────────────────
router.get('/stats/overview', requireRole('supervisor'), (req, res) => {
  res.json(adminOverview());
});

// ── Users ────────────────────────────────────────────────────────
router.get('/users', requireRole('supervisor'), (req, res) => {
  const { page, limit, search, cohortId, role } = req.query;
  res.json(listUsers({ page: +page || 1, limit: +limit || 20, search, cohortId, role }));
});

router.get('/users/:id', requireRole('supervisor'), (req, res) => {
  const user = adminGetUser(req.params.id);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json({ user });
});

router.post('/users/bulk', requireRole('admin'), upload.single('csv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV 파일이 필요합니다.' });
  try {
    const records = parse(req.file.buffer.toString('utf8'), {
      columns: true, skip_empty_lines: true, trim: true,
    });
    const rows = [];
    for (const r of records) {
      if (!r.email || !r.name) continue;
      const tempPw = r.password || `Temp${Math.random().toString(36).slice(2, 8)}!A1`;
      rows.push({
        id: uuidv4(),
        email: r.email.toLowerCase().trim(),
        name: r.name.trim(),
        passwordHash: await bcrypt.hash(tempPw, 12),
        role: r.role || 'learner',
        cohortId: r.cohort_id || null,
        tempPassword: tempPw,
      });
    }
    const result = bulkCreateUsers(rows);
    logAudit(req.userId, 'bulk_create_users', 'users', null, { count: result.success });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: `CSV 파싱 오류: ${e.message}` });
  }
});

router.post('/users/:id/unlock', requireRole('admin'), (req, res) => {
  const user = adminGetUser(req.params.id);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  unlockUser(req.params.id);
  logAudit(req.userId, 'unlock_user', 'user', req.params.id);
  res.json({ message: '계정 잠금이 해제되었습니다.' });
});

router.patch('/users/:id/role', requireRole('admin'), (req, res) => {
  const { role } = req.body;
  if (!['admin', 'supervisor', 'learner'].includes(role)) {
    return res.status(400).json({ error: '유효하지 않은 role 값입니다.' });
  }
  const user = adminGetUser(req.params.id);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  setUserRole(req.params.id, role);
  logAudit(req.userId, 'set_role', 'user', req.params.id, { role });
  res.json({ message: 'role이 변경되었습니다.' });
});

router.delete('/users/:id', requireRole('admin'), (req, res) => {
  const user = adminGetUser(req.params.id);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  softDeleteUser(req.params.id);
  logAudit(req.userId, 'soft_delete_user', 'user', req.params.id);
  res.json({ message: '학습자가 삭제되었습니다.' });
});

// ── Cohorts ──────────────────────────────────────────────────────
router.get('/cohorts', requireRole('supervisor'), (req, res) => {
  res.json({ cohorts: listCohorts() });
});

router.post('/cohorts', requireRole('admin'), (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: '코호트 이름은 필수입니다.' });
  const cohort = createCohort(uuidv4(), name, description, req.userId);
  logAudit(req.userId, 'create_cohort', 'cohort', cohort.id, { name });
  res.status(201).json({ cohort });
});

router.patch('/cohorts/:id', requireRole('admin'), (req, res) => {
  const { name, description } = req.body;
  if (!getCohort(req.params.id)) return res.status(404).json({ error: '코호트를 찾을 수 없습니다.' });
  updateCohort(req.params.id, name, description);
  logAudit(req.userId, 'update_cohort', 'cohort', req.params.id);
  res.json({ message: '코호트가 수정되었습니다.' });
});

router.delete('/cohorts/:id', requireRole('admin'), (req, res) => {
  if (!getCohort(req.params.id)) return res.status(404).json({ error: '코호트를 찾을 수 없습니다.' });
  deleteCohort(req.params.id);
  logAudit(req.userId, 'delete_cohort', 'cohort', req.params.id);
  res.json({ message: '코호트가 삭제되었습니다.' });
});

// ── Audit Log ────────────────────────────────────────────────────
router.get('/audit-log', requireRole('admin'), (req, res) => {
  const { limit, offset } = req.query;
  res.json(listAuditLog({ limit: +limit || 50, offset: +offset || 0 }));
});

router.post('/cohorts/:id/users', requireRole('admin'), (req, res) => {
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds 배열이 필요합니다.' });
  }
  if (!getCohort(req.params.id)) return res.status(404).json({ error: '코호트를 찾을 수 없습니다.' });
  assignUsersToCohort(req.params.id, userIds);
  logAudit(req.userId, 'assign_cohort', 'cohort', req.params.id, { count: userIds.length });
  res.json({ message: `${userIds.length}명이 코호트에 배정되었습니다.` });
});

export default router;
