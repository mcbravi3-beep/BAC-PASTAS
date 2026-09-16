import { Router } from 'express';
import { db } from '../db.js';
import { crudRouter } from './crud.js';
import {
  costoUnitarioProducto,
  stockInsumo,
  stockProductoTerminado,
  registrarProduccion,
  registrarVenta,
  registrarTicket,
  ticketNumero,
  saldoCliente,
  listaDeudores,
  registrarPago,
  resultadoMensual,
  alertasStock,
} from '../costeo.js';

export const api = Router();

// --- Proveedores (CRUD simple) ---
api.use('/proveedores', crudRouter('proveedores', ['codigo', 'nombre', 'insumos_que_provee', 'contacto', 'condicion_pago'], { orderBy: 'nombre' }));

// --- Clientes (CRUD simple + total comprado y saldo cuenta corriente calculados) ---
const clientesBase = crudRouter('clientes', ['codigo', 'nombre', 'tipo', 'contacto', 'zona'], { orderBy: 'nombre' });
api.get('/clientes', (req, res) => {
  const clientes = db.prepare('SELECT * FROM clientes ORDER BY nombre').all();
  const totalStmt = db.prepare('SELECT COALESCE(SUM(subtotal), 0) AS total FROM ventas WHERE cliente_id = ?');
  res.json(clientes.map((c) => ({ ...c, totalComprado: totalStmt.get(c.id).total, saldoCuentaCorriente: saldoCliente(c.id) })));
});
api.use('/clientes', clientesBase);

// --- Gastos fijos (CRUD simple) ---
api.use('/gastos-fijos', crudRouter('gastos_fijos', ['anio', 'mes', 'concepto', 'monto'], { orderBy: 'anio DESC, mes DESC' }));

// --- Insumos (con stock actual calculado) ---
const insumosFields = ['codigo', 'nombre', 'unidad', 'costo_unitario', 'proveedor_id', 'stock_minimo'];
api.get('/insumos', (req, res) => {
  const insumos = db
    .prepare(
      `SELECT i.*, p.nombre AS proveedor_nombre FROM insumos i
       LEFT JOIN proveedores p ON p.id = i.proveedor_id ORDER BY i.nombre`
    )
    .all();
  res.json(
    insumos.map((i) => {
      const stockActual = stockInsumo(i.id);
      return { ...i, stockActual, alertaStock: stockActual < i.stock_minimo };
    })
  );
});
api.get('/insumos/:id', (req, res) => {
  const insumo = db.prepare('SELECT * FROM insumos WHERE id = ?').get(req.params.id);
  if (!insumo) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ...insumo, stockActual: stockInsumo(insumo.id) });
});
api.use('/insumos', crudRouter('insumos', insumosFields, { orderBy: 'nombre' }));

// --- Productos (con costo unitario, margen y stock calculados) ---
const productosFields = ['codigo', 'nombre', 'categoria', 'unidad_venta', 'precio_venta', 'stock_inicial', 'stock_minimo', 'activo'];
function serializeProducto(p) {
  const { costoUnitario, origen } = costoUnitarioProducto(p.id);
  const stockActual = stockProductoTerminado(p.id);
  return {
    ...p,
    nombreCompleto: p.categoria ? `${p.categoria} - ${p.nombre}` : p.nombre,
    costoUnitario,
    origenCosteo: origen,
    margen: p.precio_venta - costoUnitario,
    stockActual,
    alertaStock: stockActual < p.stock_minimo,
  };
}
api.get('/productos', (req, res) => {
  const productos = db.prepare('SELECT * FROM productos ORDER BY nombre').all();
  res.json(productos.map(serializeProducto));
});
api.get('/productos/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  res.json(serializeProducto(p));
});
api.use('/productos', crudRouter('productos', productosFields, { orderBy: 'nombre' }));

// --- Costeo_Estandar (ficha por producto) ---
api.get('/costeo-estandar', (req, res) => {
  const rows = db
    .prepare(
      `SELECT ce.*, p.nombre AS producto_nombre FROM costeo_estandar ce
       JOIN productos p ON p.id = ce.producto_id ORDER BY p.nombre`
    )
    .all();
  res.json(
    rows.map((r) => ({ ...r, costoUnitarioCalculado: costoUnitarioProducto(r.producto_id).costoUnitario }))
  );
});
api.get('/costeo-estandar/:productoId', (req, res) => {
  const row = db.prepare('SELECT * FROM costeo_estandar WHERE producto_id = ?').get(req.params.productoId);
  if (!row) return res.status(404).json({ error: 'No hay ficha de costeo estandar para este producto' });
  res.json({ ...row, costoUnitarioCalculado: costoUnitarioProducto(row.producto_id).costoUnitario });
});
// Upsert: crea o actualiza la ficha del producto indicado en el body.
api.post('/costeo-estandar', (req, res) => {
  const f = req.body;
  if (!f.producto_id) return res.status(400).json({ error: 'producto_id es requerido' });
  const existente = db.prepare('SELECT id FROM costeo_estandar WHERE producto_id = ?').get(f.producto_id);
  const fecha = new Date().toISOString().slice(0, 10);
  if (existente) {
    db.prepare(
      `UPDATE costeo_estandar SET porciones_por_lote=?, horas_armado=?, horas_masa=?, horas_relleno=?,
       horas_empaquetado=?, personas=?, costo_hora_mano_obra=?, costo_insumos_masa=?, costo_insumos_relleno=?,
       fecha_actualizacion=? WHERE producto_id=?`
    ).run(
      f.porciones_por_lote, f.horas_armado || 0, f.horas_masa || 0, f.horas_relleno || 0,
      f.horas_empaquetado || 0, f.personas || 1, f.costo_hora_mano_obra || 0,
      f.costo_insumos_masa || 0, f.costo_insumos_relleno || 0, fecha, f.producto_id
    );
  } else {
    db.prepare(
      `INSERT INTO costeo_estandar (producto_id, porciones_por_lote, horas_armado, horas_masa, horas_relleno,
       horas_empaquetado, personas, costo_hora_mano_obra, costo_insumos_masa, costo_insumos_relleno, fecha_actualizacion)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      f.producto_id, f.porciones_por_lote, f.horas_armado || 0, f.horas_masa || 0, f.horas_relleno || 0,
      f.horas_empaquetado || 0, f.personas || 1, f.costo_hora_mano_obra || 0,
      f.costo_insumos_masa || 0, f.costo_insumos_relleno || 0, fecha
    );
  }
  const row = db.prepare('SELECT * FROM costeo_estandar WHERE producto_id = ?').get(f.producto_id);
  res.status(201).json(row);
});
api.delete('/costeo-estandar/:productoId', (req, res) => {
  const info = db.prepare('DELETE FROM costeo_estandar WHERE producto_id = ?').run(req.params.productoId);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.status(204).end();
});

// --- Recetas_BOM ---
api.get('/recetas-bom', (req, res) => {
  const where = req.query.producto_id ? 'WHERE r.producto_id = ?' : '';
  const params = req.query.producto_id ? [req.query.producto_id] : [];
  const rows = db
    .prepare(
      `SELECT r.*, i.nombre AS insumo_nombre, i.unidad AS insumo_unidad, i.costo_unitario AS insumo_costo
       FROM recetas_bom r JOIN insumos i ON i.id = r.insumo_id ${where} ORDER BY r.id`
    )
    .all(...params);
  res.json(rows);
});
api.use('/recetas-bom', crudRouter('recetas_bom', ['producto_id', 'insumo_id', 'cantidad_por_unidad', 'unidad']));

// --- Produccion (registro + descuento automatico de insumos) ---
api.get('/produccion', (req, res) => {
  const rows = db
    .prepare(
      `SELECT pr.*, p.nombre AS producto_nombre FROM produccion pr
       JOIN productos p ON p.id = pr.producto_id ORDER BY pr.fecha DESC, pr.id DESC`
    )
    .all();
  res.json(rows);
});
api.post('/produccion', (req, res) => {
  try {
    const { productoId, producto_id, cantidad, fecha } = req.body;
    const result = registrarProduccion({ productoId: productoId ?? producto_id, cantidad, fecha });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Ventas (registro con calculo automatico) ---
api.get('/ventas', (req, res) => {
  const rows = db
    .prepare(
      `SELECT v.*, p.nombre AS producto_nombre, c.nombre AS cliente_nombre FROM ventas v
       JOIN productos p ON p.id = v.producto_id LEFT JOIN clientes c ON c.id = v.cliente_id
       ORDER BY v.fecha DESC, v.id DESC`
    )
    .all();
  res.json(rows);
});
api.post('/ventas', (req, res) => {
  try {
    const { clienteId, cliente_id, productoId, producto_id, cantidad, precioUnitario, precio_unitario, formaPago, forma_pago, fecha } = req.body;
    const result = registrarVenta({
      clienteId: clienteId ?? cliente_id ?? null,
      productoId: productoId ?? producto_id,
      cantidad,
      precioUnitario: precioUnitario ?? precio_unitario,
      formaPago: formaPago ?? forma_pago,
      fecha,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Tickets (comprobante interno "Ticket X", agrupa 1 o mas lineas de venta) ---
api.get('/tickets', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, c.nombre AS cliente_nombre,
         (SELECT COUNT(*) FROM ventas v WHERE v.ticket_id = t.id) AS items
       FROM tickets t LEFT JOIN clientes c ON c.id = t.cliente_id
       ORDER BY t.fecha DESC, t.id DESC`
    )
    .all();
  res.json(rows.map((r) => ({ ...r, numero: ticketNumero(r.id) })));
});
api.get('/tickets/:id', (req, res) => {
  const ticket = db
    .prepare(
      `SELECT t.*, c.nombre AS cliente_nombre FROM tickets t
       LEFT JOIN clientes c ON c.id = t.cliente_id WHERE t.id = ?`
    )
    .get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'No encontrado' });
  const items = db
    .prepare(
      `SELECT v.*, p.nombre AS producto_nombre FROM ventas v
       JOIN productos p ON p.id = v.producto_id WHERE v.ticket_id = ? ORDER BY v.id`
    )
    .all(req.params.id);
  res.json({ ...ticket, numero: ticketNumero(ticket.id), items });
});
api.post('/tickets', (req, res) => {
  try {
    const { clienteId, cliente_id, tipoPago, tipo_pago, formaPago, forma_pago, items, fecha } = req.body;
    const result = registrarTicket({
      clienteId: clienteId ?? cliente_id ?? null,
      tipoPago: tipoPago ?? tipo_pago,
      formaPago: formaPago ?? forma_pago,
      items: (items || []).map((it) => ({
        productoId: it.productoId ?? it.producto_id,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario ?? it.precio_unitario,
      })),
      fecha,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Deudores / Cuenta corriente ---
api.get('/deudores', (req, res) => {
  res.json(listaDeudores());
});
api.get('/deudores/:clienteId/movimientos', (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, t.id AS ticket_ref FROM cuenta_corriente_movimientos m
       LEFT JOIN tickets t ON t.id = m.ticket_id
       WHERE m.cliente_id = ? ORDER BY m.fecha DESC, m.id DESC`
    )
    .all(req.params.clienteId);
  res.json({ movimientos: rows, saldo: saldoCliente(req.params.clienteId) });
});
api.post('/deudores/pagos', (req, res) => {
  try {
    const { clienteId, cliente_id, monto, fecha, referencia } = req.body;
    const result = registrarPago({ clienteId: clienteId ?? cliente_id, monto: Number(monto), fecha, referencia });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Inventario_Insumos (movimientos: compras, ajustes, mermas manuales) ---
api.get('/inventario-insumos', (req, res) => {
  const where = req.query.insumo_id ? 'WHERE m.insumo_id = ?' : '';
  const params = req.query.insumo_id ? [req.query.insumo_id] : [];
  const rows = db
    .prepare(
      `SELECT m.*, i.nombre AS insumo_nombre, i.unidad AS insumo_unidad FROM inventario_insumos m
       JOIN insumos i ON i.id = m.insumo_id ${where} ORDER BY m.fecha DESC, m.id DESC`
    )
    .all(...params);
  res.json(rows);
});
api.post('/inventario-insumos', (req, res) => {
  try {
    const { insumoId, insumo_id, tipo, motivo, cantidad, referencia, fecha } = req.body;
    if (motivo === 'produccion') {
      return res.status(400).json({ error: 'Los movimientos por produccion se generan automaticamente' });
    }
    const info = db
      .prepare(
        `INSERT INTO inventario_insumos (fecha, insumo_id, tipo, motivo, cantidad, referencia)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(fecha || new Date().toISOString().slice(0, 10), insumoId ?? insumo_id, tipo, motivo, cantidad, referencia || null);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Resultados mensuales ---
api.get('/resultados', (req, res) => {
  const now = new Date();
  const anio = Number(req.query.anio) || now.getFullYear();
  const mes = Number(req.query.mes) || now.getMonth() + 1;
  res.json(resultadoMensual(anio, mes));
});

// --- Alertas de stock ---
api.get('/alertas', (req, res) => {
  res.json(alertasStock());
});

// --- Exportacion a CSV ---
const EXPORTABLE = {
  proveedores: 'SELECT * FROM proveedores',
  insumos: 'SELECT * FROM insumos',
  productos: 'SELECT * FROM productos',
  costeo_estandar: 'SELECT * FROM costeo_estandar',
  recetas_bom: 'SELECT * FROM recetas_bom',
  clientes: 'SELECT * FROM clientes',
  ventas: 'SELECT * FROM ventas',
  produccion: 'SELECT * FROM produccion',
  inventario_insumos: 'SELECT * FROM inventario_insumos',
  gastos_fijos: 'SELECT * FROM gastos_fijos',
  tickets: 'SELECT * FROM tickets',
  cuenta_corriente_movimientos: 'SELECT * FROM cuenta_corriente_movimientos',
};
function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(';')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(';'));
  return lines.join('\n');
}
api.get('/export/:tabla', (req, res) => {
  const query = EXPORTABLE[req.params.tabla];
  if (!query) return res.status(404).json({ error: 'Tabla no exportable' });
  const rows = db.prepare(query).all();
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.tabla}.csv"`);
  res.send('﻿' + csv);
});
