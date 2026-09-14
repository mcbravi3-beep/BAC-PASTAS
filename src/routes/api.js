import { Router } from 'express';
import { db } from '../db.js';
import { crudRouter } from './crud.js';
import {
  costoUnitarioProducto,
  stockInsumo,
  stockProductoTerminado,
  registrarProduccion,
  registrarVenta,
  resultadoMensual,
  alertasStock,
} from '../costeo.js';

export const api = Router();

// --- Proveedores (CRUD simple) ---
api.use('/proveedores', crudRouter('proveedores', ['nombre', 'contacto', 'condicion_pago'], { orderBy: 'nombre' }));

// --- Clientes (CRUD simple + total comprado calculado) ---
const clientesBase = crudRouter('clientes', ['nombre', 'tipo', 'contacto'], { orderBy: 'nombre' });
api.get('/clientes', (req, res) => {
  const clientes = db.prepare('SELECT * FROM clientes ORDER BY nombre').all();
  const totalStmt = db.prepare('SELECT COALESCE(SUM(subtotal), 0) AS total FROM ventas WHERE cliente_id = ?');
  res.json(clientes.map((c) => ({ ...c, totalComprado: totalStmt.get(c.id).total })));
});
api.use('/clientes', clientesBase);

// --- Gastos fijos (CRUD simple) ---
api.use('/gastos-fijos', crudRouter('gastos_fijos', ['anio', 'mes', 'concepto', 'monto'], { orderBy: 'anio DESC, mes DESC' }));

// --- Insumos (con stock actual calculado) ---
const insumosFields = ['nombre', 'unidad', 'costo_unitario', 'proveedor_id', 'stock_minimo'];
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
const productosFields = ['nombre', 'categoria', 'precio_venta', 'stock_inicial', 'stock_minimo', 'activo'];
function serializeProducto(p) {
  const { costoUnitario, origen } = costoUnitarioProducto(p.id);
  const stockActual = stockProductoTerminado(p.id);
  return {
    ...p,
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
