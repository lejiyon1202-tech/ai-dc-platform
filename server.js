// server.js — AI DC Platform (인증 + 게이미피케이션 UI)
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  initDb, createUser, getUserByEmail, getUserById,
  incrementFailedLogin, resetFailedLogin, purgeInvalidNames,
} from './data/db.js';
import adminRouter from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3009', 10);
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const app = express();

// ── 인메모리 세션 스토어 ─────────────────────────────────────────
const userSessions = new Map(); // token → { userId, createdAt }
setInterval(() => {
  const now = Date.now();
  for (const [t, s] of userSessions) {
    if (now - s.createdAt > SESSION_TIMEOUT_MS) userSessions.delete(t);
  }
}, 5 * 60 * 1000);

// ── 헬퍼 ────────────────────────────────────────────────────────
function validatePassword(pw) {
  if (!pw || pw.length < 8)        return '비밀번호는 8자 이상이어야 합니다.';
  if (!/[A-Z]/.test(pw))           return '비밀번호에 대문자가 포함되어야 합니다.';
  if (!/[a-z]/.test(pw))           return '비밀번호에 소문자가 포함되어야 합니다.';
  if (!/[0-9]/.test(pw))           return '비밀번호에 숫자가 포함되어야 합니다.';
  if (!/[^A-Za-z0-9]/.test(pw))    return '비밀번호에 특수문자가 포함되어야 합니다.';
  return null;
}

// ── 미들웨어 ────────────────────────────────────────────────────
app.set('trust proxy', 1); // Nginx 프록시 신뢰
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameSrc: [
        'https://sbi.3.39.80.158.nip.io',
        'https://inbasket.3.39.80.158.nip.io',
        'https://gd.3.39.80.158.nip.io',
        'https://pt.3.39.80.158.nip.io',
      ],
    },
  },
}));

const globalLimiter = rateLimit({
  windowMs: 60_000, max: 60,
  standardHeaders: true, legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 60_000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: '인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

app.use(globalLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// 정적 파일
app.use('/css', express.static(join(__dirname, 'css')));
app.use('/', express.static(join(__dirname, 'public'), { maxAge: 0 }));

// ── 인증 미들웨어 ────────────────────────────────────────────────
function authRequired(req, res, next) {
  const token = req.cookies?.session_token
    || req.headers['x-session-token'];
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const session = userSessions.get(token);
  if (!session) return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' });

  if (Date.now() - session.createdAt > SESSION_TIMEOUT_MS) {
    userSessions.delete(token);
    return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' });
  }

  session.createdAt = Date.now(); // 세션 갱신
  req.userId = session.userId;
  next();
}

// ── Auth Routes ──────────────────────────────────────────────────

// POST /api/auth/register
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: '이메일, 이름, 비밀번호는 필수입니다.' });
    }

    const emailLower = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      return res.status(400).json({ error: '유효하지 않은 이메일 형식입니다.' });
    }

    // name 검증: 길이 1~50자, HTML/스크립트 특수문자 거부 (OWASP A03)
    const nameVal = String(name).trim();
    if (nameVal.length === 0 || nameVal.length > 50) {
      return res.status(400).json({ error: '이름은 1~50자 이내여야 합니다.' });
    }
    if (/[<>"'&;]/.test(nameVal)) {
      return res.status(400).json({ error: '이름에 사용할 수 없는 문자가 포함되어 있습니다.' });
    }

    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ error: pwError });

    if (getUserByEmail(emailLower)) {
      return res.status(409).json({ error: '이미 등록된 이메일입니다.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = createUser(uuidv4(), emailLower, passwordHash, nameVal);

    // 회원가입 즉시 자동 로그인 (세션 발급)
    const token = uuidv4();
    userSessions.set(token, { userId: user.id, createdAt: Date.now() });
    res.cookie('session_token', token, {
      httpOnly: true, secure: IS_PROD, sameSite: 'lax', maxAge: SESSION_TIMEOUT_MS,
    });

    console.log(`[AUTH] 회원가입 완료: ${emailLower}`);
    res.status(201).json({
      message: '회원가입이 완료되었습니다.',
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error('[AUTH] Register error:', err.message);
    res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
    }

    const emailLower = String(email).toLowerCase().trim();
    const user = getUserByEmail(emailLower);
    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until) - Date.now()) / 60_000);
      return res.status(423).json({ error: `계정이 잠겼습니다. ${remaining}분 후 다시 시도해주세요.` });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: '비활성 계정입니다. 관리자에게 문의하세요.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      incrementFailedLogin(user.id);
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    resetFailedLogin(user.id);

    const token = uuidv4();
    userSessions.set(token, { userId: user.id, createdAt: Date.now() });

    res.cookie('session_token', token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      maxAge: SESSION_TIMEOUT_MS,
    });

    console.log(`[AUTH] 로그인 성공: ${emailLower}`);
    res.json({
      message: '로그인 성공',
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role ?? 'learner' },
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.session_token || req.headers['x-session-token'];
  if (token) userSessions.delete(token);
  res.clearCookie('session_token');
  res.json({ message: '로그아웃되었습니다.' });
});

// GET /api/auth/me
app.get('/api/auth/me', authRequired, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role ?? 'learner' } });
});

// POST /api/auth/iframe-token — 솔루션 iframe 진입용 단기 JWT 발급 (10분)
app.post('/api/auth/iframe-token', authRequired, (req, res) => {
  const secret = process.env.SIM_JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'SIM_JWT_SECRET 미설정' });
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  const { simId } = req.body;
  const token = jwt.sign(
    { userId: user.id, name: user.name, role: user.role ?? 'learner', sim: simId ?? null },
    secret,
    { algorithm: 'HS256', expiresIn: '10m' }
  );
  res.json({ token });
});

// ── Admin Routes ─────────────────────────────────────────────────
app.use('/api/admin', authRequired, adminRouter);

// ── Health ───────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({
  status: 'ok', service: 'ai-dc-platform', port: PORT,
  timestamp: new Date().toISOString(),
}));

// ── 시작 ─────────────────────────────────────────────────────────
await initDb();
const purged = purgeInvalidNames();
if (purged > 0) console.log(`[INIT] 유효하지 않은 이름 user ${purged}건 정리`);

// 첫 관리자 계정 시드 (INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD)
const seedEmail = process.env.INITIAL_ADMIN_EMAIL;
const seedPw = process.env.INITIAL_ADMIN_PASSWORD;
if (seedEmail && seedPw) {
  const existing = getUserByEmail(seedEmail);
  if (!existing) {
    const { db, persist } = await import('./data/db.js');
    const hash = await bcrypt.hash(seedPw, 12);
    const id = uuidv4();
    db.run('INSERT INTO users (id,email,password_hash,name,role) VALUES (?,?,?,?,?)',
      [id, seedEmail.toLowerCase(), hash, 'Admin', 'admin']);
    persist();
    console.log(`[INIT] 관리자 계정 시드 완료: ${seedEmail}`);
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[INIT] AI DC Platform: http://localhost:${PORT}`);
});
