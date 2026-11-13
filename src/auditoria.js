// Middleware centralizado de auditoria: registra automaticamente cualquier
// POST/PUT/DELETE que termine en exito (2xx), sin que cada ruta tenga que
// llamarlo a mano. Genera una descripcion legible a partir del metodo y la
// ruta, con mensajes especiales para las acciones mas importantes del dia a
// dia (tickets, pagos, produccion, usuarios, backup).
import { db } from './db.js';

const ETIQUETAS = {
  proveedores: 'proveedor',
  insumos: 'insumo',
  productos: 'producto',
  clientes: 'cliente',
  'costeo-estandar': 'ficha de costeo estandar',
  'recetas-bom': 'item de receta',
  'gastos-fijos': 'gasto fijo',
  usuarios: 'usuario',
};

const VERBOS = { POST: 'Creo', PUT: 'Edito', PATCH: 'Edito', DELETE: 'Elimino' };

function describirAccion(req) {
  const seg = req.path.split('/').filter(Boolean);
  const recurso = seg[0];

  if (recurso === 'tickets' && req.method === 'POST') return 'Emitio un ticket de venta';
  if (recurso === 'ventas' && req.method === 'POST') return 'Registro una venta';
  if (recurso === 'produccion' && req.method === 'POST') return 'Registro una produccion';
  if (recurso === 'inventario-insumos' && req.method === 'POST') return 'Registro un movimiento de insumos';
  if (recurso === 'deudores' && seg[1] === 'pagos') return 'Registro un pago de cuenta corriente';
  if (recurso === 'backup' && seg[1] === 'restaurar') return '⚠️ Restauro una copia de seguridad completa';
  if (recurso === 'usuarios' && seg[2] === 'habilitado') {
    return `Cambio el estado de un usuario (${req.body?.habilitado ? 'habilitado' : 'deshabilitado'})`;
  }
  if (recurso === 'usuarios' && req.method === 'POST') return `Creo el usuario "${req.body?.usuario || ''}"`;
  if (recurso === 'usuarios' && req.method === 'DELETE') return `Elimino un usuario (#${seg[1]})`;

  const etiqueta = ETIQUETAS[recurso] || recurso;
  const verbo = VERBOS[req.method] || req.method;
  const idPart = seg[1] && /^\d+$/.test(seg[1]) ? ` #${seg[1]}` : '';
  const nombre = req.body?.nombre ? `: "${req.body.nombre}"` : '';
  return `${verbo} ${etiqueta}${idPart}${nombre}`;
}

const RUTAS_SIN_AUDITAR = new Set(['/login', '/logout']);

export function auditMiddleware(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || RUTAS_SIN_AUDITAR.has(req.path)) {
    return next();
  }
  const originalEnd = res.end.bind(res);
  let registrado = false;
  res.end = (...args) => {
    if (!registrado) {
      registrado = true;
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          db.prepare(
            'INSERT INTO auditoria (fecha, usuario, rol, metodo, ruta, descripcion) VALUES (?,?,?,?,?,?)'
          ).run(
            new Date().toISOString(),
            req.session?.usuario || 'desconocido',
            req.session?.rol || null,
            req.method,
            req.path,
            describirAccion(req)
          );
        } catch {
          // la auditoria nunca debe romper la respuesta real
        }
      }
    }
    return originalEnd(...args);
  };
  next();
}
