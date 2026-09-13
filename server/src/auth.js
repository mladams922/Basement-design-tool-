import crypto from 'node:crypto';
import { getDB, saveDB } from './db.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const COOKIE_NAME = 'theater_session';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

// The password itself is never persisted to disk — it's compared against
// the APP_PASSWORD env var on every login. That means changing APP_PASSWORD
// and restarting the container is all it takes to change the password.
export function checkStartupConfig() {
  if (!process.env.APP_PASSWORD) {
    throw new Error(
      'APP_PASSWORD environment variable is not set. Set it in your .env file (see .env.example).'
    );
  }
}

export function verifyPassword(password) {
  const expected = sha256(process.env.APP_PASSWORD || '');
  const actual = sha256(password || '');
  return crypto.timingSafeEqual(expected, actual);
}

export function createSession() {
  const db = getDB();
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
  saveDB();
  return token;
}

export function destroySession(token) {
  const db = getDB();
  delete db.sessions[token];
  saveDB();
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

export function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

export function getSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME];
}

export function isAuthenticated(req) {
  const token = getSessionToken(req);
  const db = getDB();
  const session = token && db.sessions[token];
  return !!(session && session.expiresAt >= Date.now());
}

export function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}
