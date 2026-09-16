// Login simple de un solo usuario administrador (pensado para una sola
// persona operando el sistema). Usuario/clave se configuran por variables
// de entorno para no dejar credenciales en el codigo.
import session from 'express-session';
import { Router } from 'express';
import crypto from 'node:crypto';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'pastas2026';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    '⚠️  ADMIN_PASSWORD no configurado: usando clave por defecto ("pastas2026"). ' +
    'Configura ADMIN_USER y ADMIN_PASSWORD como variables de entorno antes de usar el sistema en produccion.'
  );
}

export const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }, // 30 dias
});

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { usuario, clave } = req.body;
  if (usuario === ADMIN_USER && clave === ADMIN_PASSWORD) {
    req.session.autenticado = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Usuario o clave incorrectos' });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.get('/session', (req, res) => {
  res.json({ autenticado: Boolean(req.session.autenticado) });
});

export function requireAuth(req, res, next) {
  if (req.session.autenticado) return next();
  res.status(401).json({ error: 'No autenticado' });
}
