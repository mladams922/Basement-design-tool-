import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkStartupConfig,
  verifyPassword,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  getSessionToken,
  isAuthenticated,
} from './auth.js';
import plansRouter from './routes/plans.js';
import itemsRouter from './routes/items.js';
import equipmentRouter from './routes/equipment.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

checkStartupConfig();

app.use(express.json());

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || !verifyPassword(password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  const token = createSession();
  setSessionCookie(res, token);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const token = getSessionToken(req);
  if (token) destroySession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

app.use('/api/plans', requireAuth, plansRouter);
app.use('/api', requireAuth, itemsRouter);
app.use('/api/equipment', requireAuth, equipmentRouter);

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Basement Theater Design Tool listening on port ${PORT}`);
});
