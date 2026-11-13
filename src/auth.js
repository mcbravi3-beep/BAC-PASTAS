// Login del sistema. Hay un usuario "maestro" (ADMIN_USER/ADMIN_PASSWORD por
// variables de entorno, siempre admin y siempre habilitado -- sirve para
// arrancar el sistema la primera vez y como respaldo si algo se traba) y,
// ademas, los usuarios que el administrador va creando desde la pantalla
// "Usuarios" (tabla usuarios), cada uno con su propio rol y pudiendo
// habilitarse/deshabilitarse.
import session from 'express-session';
import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from './db.js';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'pastas2026';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    '⚠️  ADMIN_PASSWORD no configurado: usando clave por defecto ("pastas2026"). ' +
    'Configura ADMIN_USER y ADMIN_PASSWORD como variables de entorno antes de usar el sistema en produccion.'
  );
}

export function hashClave(clave) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(clave, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verificarClave(clave, claveHash) {
  const [salt, hash] = claveHash.split(':');
  const intento = crypto.scryptSync(clave, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(intento, 'hex'));
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
  if (!usuario || !clave) return res.status(400).json({ error: 'Falta usuario o clave' });

  if (usuario === ADMIN_USER && clave === ADMIN_PASSWORD) {
    req.session.autenticado = true;
    req.session.usuario = ADMIN_USER;
    req.session.rol = 'admin';
    return res.json({ ok: true });
  }

  const fila = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
  if (!fila) return res.status(401).json({ error: 'Usuario o clave incorrectos' });
  if (!fila.habilitado) {
    return res.status(401).json({ error: 'Tu usuario todavia no fue habilitado por el administrador' });
  }
  if (!verificarClave(clave, fila.clave_hash)) {
    return res.status(401).json({ error: 'Usuario o clave incorrectos' });
  }

  req.session.autenticado = true;
  req.session.usuario = fila.usuario;
  req.session.rol = fila.rol;
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.get('/session', (req, res) => {
  res.json({
    autenticado: Boolean(req.session.autenticado),
    usuario: req.session.usuario || null,
    rol: req.session.rol || null,
  });
});

export function requireAuth(req, res, next) {
  if (req.session.autenticado) return next();
  res.status(401).json({ error: 'No autenticado' });
}

export function requireAdmin(req, res, next) {
  if (req.session.autenticado && req.session.rol === 'admin') return next();
  res.status(403).json({ error: 'Esta accion es solo para el administrador' });
}
