// Autenticação: senha com scrypt + sessão opaca em cookie httpOnly (token só existe no cliente; guardamos o hash).
import crypto from 'node:crypto';
import { getDb } from './db.js';
import { config } from './config.js';
import { HttpError } from './lib/http.js';

const COOKIE = 'af_session';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86400000).toISOString();
  getDb().prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), userId, expires);
  return { token, expires };
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionDays * 86400000,
    path: '/',
  });
}

export function clearSession(req, res) {
  const token = req.cookies?.[COOKIE];
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
  res.clearCookie(COOKIE, { path: '/' });
}

export function userFromRequest(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const row = getDb().prepare(
    `SELECT u.id, u.email, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  ).get(sha(token));
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return next(new HttpError(401, 'Faça login para continuar.'));
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'Apenas administradores.'));
  next();
}

// Limitador simples de tentativas de login por IP (memória).
const attempts = new Map();
export function loginRateLimit(req, res, next) {
  const key = req.ip || 'x';
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60000);
  if (a.length >= 20) return next(new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.'));
  a.push(now);
  attempts.set(key, a);
  next();
}
