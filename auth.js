// QitPit — authentication, sessions, CSRF, rate limiting. node:crypto only.

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db } from './db.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
export const SESSION_COOKIE = 'qp_sid';

// ---------------------------------------------------------------- passwords

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Reject the passwords that actually get admin panels taken over. */
export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return 'Password must include lowercase, uppercase and a number.';
  }
  const weak = ['password', 'admin', '123456', 'qwerty', 'letmein', 'qitpit', 'welcome'];
  const low = pw.toLowerCase();
  if (weak.some((w) => low.includes(w))) return 'Password contains a commonly guessed word.';
  return null;
}

// ---------------------------------------------------------------- sessions

export function createSession(adminId) {
  const id = randomBytes(32).toString('base64url');
  const csrf = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (id, admin_id, csrf, expires_at) VALUES (?,?,?,?)')
    .run(id, adminId, csrf, Date.now() + SESSION_TTL_MS);
  db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(adminId);
  return { id, csrf };
}

export function getSession(sid) {
  if (!sid || typeof sid !== 'string' || sid.length > 128) return null;
  const row = db
    .prepare(
      `SELECT s.id, s.csrf, s.expires_at, a.id AS admin_id, a.email, a.name
       FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.id = ?`
    )
    .get(sid);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    destroySession(sid);
    return null;
  }
  return row;
}

export const destroySession = (sid) =>
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);

export const purgeExpiredSessions = () =>
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());

/** Constant-time CSRF comparison. */
export function csrfOk(session, token) {
  if (!session || typeof token !== 'string') return false;
  const a = Buffer.from(session.csrf);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- rate limit

// In-memory sliding window. Single-process deployment; a restart clears it,
// which an attacker cannot trigger. ponytail: swap for a table if you ever
// run more than one process behind a load balancer.
const buckets = new Map();

export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear(); // crude memory ceiling
  return { allowed: hits.length <= limit, retryAfter: Math.ceil(windowMs / 1000) };
}

export const clientKey = (req, scope) =>
  createHash('sha256')
    .update(scope + '|' + (req.socket.remoteAddress || 'unknown'))
    .digest('hex');

setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref();
