// Logica de negocio: costeo, inventario, ventas y resultados.
import { db } from './db.js';

/**
 * Costo unitario de un producto.
 * Metodo principal: ficha de Costeo_Estandar (costo del lote / porciones).
 * Metodo de respaldo: suma de Recetas_BOM (cantidad x costo de cada insumo).
 * Devuelve { costoUnitario, origen } donde origen es 'estandar' | 'bom' | 'sin_datos'.
 */
export function costoUnitarioProducto(productoId) {
  const ficha = db
    .prepare('SELECT * FROM costeo_estandar WHERE producto_id = ?')
    .get(productoId);

  if (ficha) {
    const horasTotales =
      ficha.horas_armado + ficha.horas_masa + ficha.horas_relleno + ficha.horas_empaquetado;
    const costoManoObra = horasTotales * ficha.personas * ficha.costo_hora_mano_obra;
    const costoTotalLote = ficha.costo_insumos_masa + ficha.costo_insumos_relleno + costoManoObra;
    const costoUnitario = ficha.porciones_por_lote > 0 ? costoTotalLote / ficha.porciones_por_lote : 0;
    return { costoUnitario, origen: 'estandar', detalle: { costoTotalLote, costoManoObra, porciones: ficha.porciones_por_lote } };
  }

  const bom = db
    .prepare(
      `SELECT r.cantidad_por_unidad, i.costo_unitario AS costo_insumo
       FROM recetas_bom r JOIN insumos i ON i.id = r.insumo_id
       WHERE r.producto_id = ?`
    )
    .all(productoId);

  if (bom.length > 0) {
    const costoUnitario = bom.reduce((acc, r) => acc + r.cantidad_por_unidad * r.costo_insumo, 0);
    return { costoUnitario, origen: 'bom', detalle: { items: bom.length } };
  }

  return { costoUnitario: 0, origen: 'sin_datos', detalle: null };
}

/** Stock actual de un insumo = entradas - salidas registradas. */
export function stockInsumo(insumoId) {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN cantidad ELSE 0 END), 0) AS entradas,
         COALESCE(SUM(CASE WHEN tipo = 'salida' THEN cantidad ELSE 0 END), 0) AS salidas
       FROM inventario_insumos WHERE insumo_id = ?`
    )
    .get(insumoId);
  return row.entradas - row.salidas;
}

/** Stock de producto terminado = stock inicial + producido - vendido. */
export function stockProductoTerminado(productoId) {
  const producto = db.prepare('SELECT stock_inicial FROM productos WHERE id = ?').get(productoId);
  if (!producto) return 0;
  const producido = db
    .prepare('SELECT COALESCE(SUM(cantidad), 0) AS total FROM produccion WHERE producto_id = ?')
    .get(productoId).total;
  const vendido = db
    .prepare('SELECT COALESCE(SUM(cantidad), 0) AS total FROM ventas WHERE producto_id = ?')
    .get(productoId).total;
  return producto.stock_inicial + producido - vendido;
}

/**
 * Registra una produccion: calcula el costo del lote, guarda el registro
 * y descuenta automaticamente los insumos de la receta (BOM) del stock,
 * generando los movimientos de salida correspondientes en Inventario_Insumos.
 */
export function registrarProduccion({ productoId, cantidad, fecha }) {
  if (!(cantidad > 0)) throw new Error('La cantidad producida debe ser mayor a 0');

  const { costoUnitario, origen } = costoUnitarioProducto(productoId);
  const costoTotal = costoUnitario * cantidad;
  const fechaProd = fecha || new Date().toISOString().slice(0, 10);

  const insertProduccion = db.prepare(
    `INSERT INTO produccion (fecha, producto_id, cantidad, costo_unitario, costo_total, origen_costeo)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertMovimiento = db.prepare(
    `INSERT INTO inventario_insumos (fecha, insumo_id, tipo, motivo, cantidad, referencia)
     VALUES (?, ?, 'salida', 'produccion', ?, ?)`
  );
  const selectBom = db.prepare('SELECT insumo_id, cantidad_por_unidad FROM recetas_bom WHERE producto_id = ?');

  let produccionId;
  db.exec('BEGIN');
  try {
    const info = insertProduccion.run(fechaProd, productoId, cantidad, costoUnitario, costoTotal, origen);
    produccionId = Number(info.lastInsertRowid);

    const bom = selectBom.all(productoId);
    for (const item of bom) {
      const cantidadInsumo = item.cantidad_por_unidad * cantidad;
      insertMovimiento.run(fechaProd, item.insumo_id, cantidadInsumo, `Produccion #${produccionId}`);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { id: produccionId, costoUnitario, costoTotal, origen };
}

/** Registra una linea de venta calculando subtotal, costo (vigente) y margen. */
export function registrarVenta({ clienteId, productoId, cantidad, precioUnitario, formaPago, fecha, ticketId }) {
  if (!(cantidad > 0)) throw new Error('La cantidad vendida debe ser mayor a 0');

  const producto = db.prepare('SELECT precio_venta FROM productos WHERE id = ?').get(productoId);
  if (!producto) throw new Error('Producto inexistente');

  const precio = precioUnitario ?? producto.precio_venta;
  const { costoUnitario } = costoUnitarioProducto(productoId);
  const subtotal = cantidad * precio;
  const costoTotal = cantidad * costoUnitario;
  const margen = subtotal - costoTotal;
  const fechaVenta = fecha || new Date().toISOString().slice(0, 10);

  const info = db
    .prepare(
      `INSERT INTO ventas (ticket_id, fecha, cliente_id, producto_id, cantidad, precio_unitario, forma_pago, subtotal, costo_unitario, costo_total, margen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(ticketId ?? null, fechaVenta, clienteId ?? null, productoId, cantidad, precio, formaPago ?? null, subtotal, costoUnitario, costoTotal, margen);

  return { id: Number(info.lastInsertRowid), subtotal, costoUnitario, costoTotal, margen };
}

/**
 * Registra un ticket de venta (comprobante interno, "Ticket X" -- no reemplaza
 * a una factura) con una o varias lineas de producto/cantidad.
 * tipoPago: 'contado' (pago inmediato) o 'cuenta_corriente' (pago diferido).
 * Si es a cuenta corriente, genera automaticamente un cargo en el modulo
 * Deudores para el cliente por el total del ticket.
 */
export function registrarTicket({ clienteId, tipoPago, formaPago, items, fecha }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('El ticket debe tener al menos un producto');
  if (!['contado', 'cuenta_corriente'].includes(tipoPago)) throw new Error('Tipo de pago invalido');
  if (tipoPago === 'cuenta_corriente' && !clienteId) {
    throw new Error('Para pago diferido (cuenta corriente) hay que seleccionar un cliente');
  }
  const itemsValidos = items.filter((it) => Number(it.cantidad) > 0);
  if (itemsValidos.length === 0) throw new Error('Cargar la cantidad de al menos un producto');

  const fechaTicket = fecha || new Date().toISOString().slice(0, 10);

  let ticketId;
  let total = 0;
  const lineas = [];
  db.exec('BEGIN');
  try {
    const info = db
      .prepare('INSERT INTO tickets (fecha, cliente_id, tipo_pago, forma_pago, total) VALUES (?, ?, ?, ?, 0)')
      .run(fechaTicket, clienteId ?? null, tipoPago, tipoPago === 'contado' ? formaPago ?? null : null);
    ticketId = Number(info.lastInsertRowid);

    for (const item of itemsValidos) {
      const venta = registrarVenta({
        clienteId,
        productoId: item.productoId,
        cantidad: Number(item.cantidad),
        precioUnitario: item.precioUnitario,
        formaPago: tipoPago === 'contado' ? formaPago : 'Cuenta corriente',
        fecha: fechaTicket,
        ticketId,
      });
      total += venta.subtotal;
      lineas.push({ productoId: item.productoId, cantidad: Number(item.cantidad), ...venta });
    }

    db.prepare('UPDATE tickets SET total = ? WHERE id = ?').run(total, ticketId);

    if (tipoPago === 'cuenta_corriente') {
      db.prepare(
        `INSERT INTO cuenta_corriente_movimientos (fecha, cliente_id, tipo, monto, referencia, ticket_id)
         VALUES (?, ?, 'cargo', ?, ?, ?)`
      ).run(fechaTicket, clienteId, total, `Ticket ${ticketNumero(ticketId)}`, ticketId);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { id: ticketId, numero: ticketNumero(ticketId), fecha: fechaTicket, total, tipoPago, items: lineas };
}

/** Numero de comprobante interno mostrado en el ticket (no es una factura). */
export function ticketNumero(id) {
  return `X-${String(id).padStart(6, '0')}`;
}

/** Saldo actual de un cliente en cuenta corriente = cargos - pagos. */
export function saldoCliente(clienteId) {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo = 'cargo' THEN monto ELSE 0 END), 0) AS cargos,
         COALESCE(SUM(CASE WHEN tipo = 'pago' THEN monto ELSE 0 END), 0) AS pagos
       FROM cuenta_corriente_movimientos WHERE cliente_id = ?`
    )
    .get(clienteId);
  return row.cargos - row.pagos;
}

/** Lista de clientes con saldo en cuenta corriente (para el modulo Deudores). */
export function listaDeudores() {
  const clientes = db.prepare('SELECT id, nombre, tipo, contacto FROM clientes ORDER BY nombre').all();
  return clientes.map((c) => ({ ...c, saldo: saldoCliente(c.id) }));
}

/** Registra un pago (cobro) de un cliente, reduciendo su saldo en cuenta corriente. */
export function registrarPago({ clienteId, monto, fecha, referencia }) {
  if (!clienteId) throw new Error('Cliente requerido');
  if (!(monto > 0)) throw new Error('El monto del pago debe ser mayor a 0');
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(clienteId);
  if (!cliente) throw new Error('Cliente inexistente');

  const fechaPago = fecha || new Date().toISOString().slice(0, 10);
  const info = db
    .prepare(
      `INSERT INTO cuenta_corriente_movimientos (fecha, cliente_id, tipo, monto, referencia)
       VALUES (?, ?, 'pago', ?, ?)`
    )
    .run(fechaPago, clienteId, monto, referencia || 'Pago recibido');

  return { id: Number(info.lastInsertRowid), saldo: saldoCliente(clienteId) };
}

/** Resultado mensual: ventas, costo de mercaderia vendida, margen bruto, gastos fijos, resultado neto. */
export function resultadoMensual(anio, mes) {
  const prefijo = `${anio}-${String(mes).padStart(2, '0')}`;
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(subtotal), 0) AS ventasTotales, COALESCE(SUM(costo_total), 0) AS costoMercaderia
       FROM ventas WHERE fecha LIKE ?`
    )
    .get(`${prefijo}%`);
  const gastosFijos = db
    .prepare('SELECT COALESCE(SUM(monto), 0) AS total FROM gastos_fijos WHERE anio = ? AND mes = ?')
    .get(anio, mes).total;

  const margenBruto = row.ventasTotales - row.costoMercaderia;
  const margenPct = row.ventasTotales > 0 ? (margenBruto / row.ventasTotales) * 100 : 0;
  const resultadoNeto = margenBruto - gastosFijos;

  return {
    anio,
    mes,
    ventasTotales: row.ventasTotales,
    costoMercaderia: row.costoMercaderia,
    margenBruto,
    margenPct,
    gastosFijos,
    resultadoNeto,
  };
}

/** Alertas de stock minimo (insumos) y stock bajo (productos terminados). */
export function alertasStock() {
  const insumos = db.prepare('SELECT id, nombre, unidad, stock_minimo FROM insumos').all();
  const alertasInsumos = insumos
    .map((i) => ({ ...i, stockActual: stockInsumo(i.id) }))
    .filter((i) => i.stockActual < i.stock_minimo);

  const productos = db.prepare('SELECT id, nombre, categoria, stock_minimo FROM productos WHERE activo = 1').all();
  const alertasProductos = productos
    .map((p) => ({ ...p, stockActual: stockProductoTerminado(p.id) }))
    .filter((p) => p.stockActual < p.stock_minimo);

  return { insumos: alertasInsumos, productos: alertasProductos };
}
