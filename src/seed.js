// Datos iniciales de arranque del sistema.
//
// IMPORTANTE: el archivo "sistema_gestion_pastas.xlsx" mencionado en la
// consigna no llego adjunto a esta sesion, por lo que estos valores
// (costos, precios, stocks) son ILUSTRATIVOS -- incluida la ficha de
// "Ravioles - Verdura y Carne", que segun la consigna deberia cargarse con
// el dato REAL del negocio. Reemplazar todo esto desde las pantallas de
// ABM / Costeo Estandar en cuanto se cuente con los numeros reales
// (por ejemplo re-subiendo el Excel para que se pueda leer su contenido).
import { db } from './db.js';

export function seed() {
  const yaCargado = db.prepare('SELECT COUNT(*) AS n FROM productos').get().n > 0;
  if (yaCargado) return;

  db.exec('BEGIN');
  try {
    // --- Proveedores ---
    const proveedorIds = {};
    const proveedores = [
      ['Molino San Justo', '011-4444-1111', 'Cta. cte. 30 dias'],
      ['Verduleria La Union', '011-4444-2222', 'Contado'],
      ['Carniceria Don Pedro', '011-4444-3333', 'Contado'],
      ['Lacteos del Sur', '011-4444-4444', 'Cta. cte. 15 dias'],
    ];
    const insProveedor = db.prepare('INSERT INTO proveedores (nombre, contacto, condicion_pago) VALUES (?,?,?)');
    for (const [nombre, contacto, condicion] of proveedores) {
      const info = insProveedor.run(nombre, contacto, condicion);
      proveedorIds[nombre] = Number(info.lastInsertRowid);
    }

    // --- Insumos: [nombre, unidad, costo_unitario, proveedor, stock_minimo, stock_inicial_entrada] ---
    const insumosData = [
      ['Harina 000', 'kg', 800, 'Molino San Justo', 20, 200],
      ['Huevos', 'unidad', 180, 'Verduleria La Union', 60, 300],
      ['Sal fina', 'kg', 300, 'Molino San Justo', 2, 10],
      ['Aceite de girasol', 'litro', 1600, 'Verduleria La Union', 5, 20],
      ['Acelga', 'kg', 900, 'Verduleria La Union', 5, 25],
      ['Espinaca', 'kg', 950, 'Verduleria La Union', 5, 25],
      ['Ricota', 'kg', 2200, 'Lacteos del Sur', 8, 30],
      ['Carne picada', 'kg', 5200, 'Carniceria Don Pedro', 8, 30],
      ['Calabaza', 'kg', 700, 'Verduleria La Union', 5, 20],
      ['Jamon cocido', 'kg', 6500, 'Carniceria Don Pedro', 4, 15],
      ['Queso muzzarella', 'kg', 5800, 'Lacteos del Sur', 6, 25],
      ['Queso roquefort', 'kg', 8500, 'Lacteos del Sur', 2, 8],
      ['Pechuga de pollo', 'kg', 3800, 'Carniceria Don Pedro', 5, 20],
      ['Puerro', 'kg', 850, 'Verduleria La Union', 3, 12],
      ['Nuez picada', 'kg', 7200, 'Verduleria La Union', 2, 8],
      ['Osso buco', 'kg', 6800, 'Carniceria Don Pedro', 3, 10],
      ['Papa', 'kg', 550, 'Verduleria La Union', 15, 60],
      ['Salsa de tomate', 'kg', 900, 'Verduleria La Union', 10, 40],
      ['Cebolla', 'kg', 600, 'Verduleria La Union', 8, 30],
      ['Zanahoria', 'kg', 550, 'Verduleria La Union', 5, 20],
      ['Apio', 'kg', 700, 'Verduleria La Union', 2, 8],
      ['Aceite de oliva', 'litro', 3200, 'Verduleria La Union', 3, 10],
      ['Condimentos varios', 'kg', 2500, 'Molino San Justo', 2, 6],
    ];
    const insumoIds = {};
    const insInsumo = db.prepare(
      'INSERT INTO insumos (nombre, unidad, costo_unitario, proveedor_id, stock_minimo) VALUES (?,?,?,?,?)'
    );
    const insMovimiento = db.prepare(
      `INSERT INTO inventario_insumos (fecha, insumo_id, tipo, motivo, cantidad, referencia)
       VALUES (?, ?, 'entrada', 'compra', ?, 'Stock inicial')`
    );
    const hoy = new Date().toISOString().slice(0, 10);
    for (const [nombre, unidad, costo, proveedor, stockMin, stockInicial] of insumosData) {
      const info = insInsumo.run(nombre, unidad, costo, proveedorIds[proveedor], stockMin);
      const id = Number(info.lastInsertRowid);
      insumoIds[nombre] = id;
      insMovimiento.run(hoy, id, stockInicial);
    }

    // --- Productos (catalogo real: 23 items) ---
    const productosData = [
      ['Ravioles Verdura y Carne', 'Ravioles', 2800, 40, 10],
      ['Ravioles Ricota y Nuez', 'Ravioles', 2700, 40, 10],
      ['Ravioles Jamon y Queso', 'Ravioles', 2700, 40, 10],
      ['Ravioles de Calabaza', 'Ravioles', 2600, 40, 10],
      ['Sorrentinos Jamon y Queso', 'Sorrentinos', 3000, 30, 10],
      ['Sorrentinos Roquefort', 'Sorrentinos', 3200, 30, 8],
      ['Sorrentinos de Verdura', 'Sorrentinos', 2900, 30, 8],
      ['Canelones Verdura y Ricota', 'Canelones', 3100, 20, 8],
      ['Canelones de Carne', 'Canelones', 3300, 20, 8],
      ['Canelones Pollo y Puerro', 'Canelones', 3200, 20, 8],
      ['Agnolotti de Osso Buco', 'Agnolotti', 3600, 20, 6],
      ['Agnolotti de Espinaca', 'Agnolotti', 3000, 20, 6],
      ['Raviolon Ricota y Nuez', 'Raviolon', 3100, 20, 6],
      ['Raviolon Jamon y Queso', 'Raviolon', 3100, 20, 6],
      ['Noquis de Papa', 'Noquis', 2200, 30, 10],
      ['Noquis de Ricota', 'Noquis', 2400, 30, 8],
      ['Noquis de Calabaza', 'Noquis', 2300, 30, 8],
      ['Fideos Tallarines', 'Fideos', 1800, 30, 10],
      ['Fideos Fettuccine', 'Fideos', 1800, 30, 10],
      ['Fideos al Huevo', 'Fideos', 1900, 30, 10],
      ['Lasagna de Verdura', 'Lasagna', 3400, 15, 5],
      ['Lasagna de Carne', 'Lasagna', 3700, 15, 5],
      ['Salsa Bolognesa', 'Salsas', 1500, 25, 8],
    ];
    const productoIds = {};
    const insProducto = db.prepare(
      'INSERT INTO productos (nombre, categoria, precio_venta, stock_inicial, stock_minimo) VALUES (?,?,?,?,?)'
    );
    for (const [nombre, categoria, precio, stockInicial, stockMin] of productosData) {
      const info = insProducto.run(nombre, categoria, precio, stockInicial, stockMin);
      productoIds[nombre] = Number(info.lastInsertRowid);
    }

    // --- Costeo_Estandar: ficha REAL de "Ravioles Verdura y Carne" (dato del negocio) ---
    // Valores ilustrativos: reemplazar por la ficha real del negocio (ver nota arriba).
    db.prepare(
      `INSERT INTO costeo_estandar
        (producto_id, porciones_por_lote, horas_armado, horas_masa, horas_relleno, horas_empaquetado,
         personas, costo_hora_mano_obra, costo_insumos_masa, costo_insumos_relleno, fecha_actualizacion)
       VALUES (?, 40, 1.5, 0.75, 1, 0.5, 2, 2200, 3200, 6800, ?)`
    ).run(productoIds['Ravioles Verdura y Carne'], hoy);

    // --- Recetas_BOM (metodo de respaldo para el resto del catalogo) ---
    const insReceta = db.prepare(
      'INSERT INTO recetas_bom (producto_id, insumo_id, cantidad_por_unidad, unidad) VALUES (?,?,?,?)'
    );
    const bom = (producto, items) => {
      for (const [insumo, cantidad, unidad] of items) {
        insReceta.run(productoIds[producto], insumoIds[insumo], cantidad, unidad);
      }
    };
    // Nota: aunque este producto se costea por ficha estandar, tambien carga
    // su receta BOM para que el sistema pueda descontar insumos del stock
    // automaticamente al registrar produccion.
    bom('Ravioles Verdura y Carne', [['Harina 000', 0.03, 'kg'], ['Huevos', 0.02, 'unidad'], ['Acelga', 0.02, 'kg'], ['Carne picada', 0.015, 'kg']]);
    bom('Ravioles Ricota y Nuez', [['Harina 000', 0.03, 'kg'], ['Huevos', 0.02, 'unidad'], ['Ricota', 0.025, 'kg'], ['Nuez picada', 0.008, 'kg']]);
    bom('Ravioles Jamon y Queso', [['Harina 000', 0.03, 'kg'], ['Huevos', 0.02, 'unidad'], ['Jamon cocido', 0.02, 'kg'], ['Queso muzzarella', 0.02, 'kg']]);
    bom('Ravioles de Calabaza', [['Harina 000', 0.03, 'kg'], ['Huevos', 0.02, 'unidad'], ['Calabaza', 0.035, 'kg']]);
    bom('Sorrentinos Jamon y Queso', [['Harina 000', 0.035, 'kg'], ['Huevos', 0.025, 'unidad'], ['Jamon cocido', 0.025, 'kg'], ['Queso muzzarella', 0.025, 'kg']]);
    bom('Sorrentinos Roquefort', [['Harina 000', 0.035, 'kg'], ['Huevos', 0.025, 'unidad'], ['Queso roquefort', 0.03, 'kg']]);
    bom('Sorrentinos de Verdura', [['Harina 000', 0.035, 'kg'], ['Huevos', 0.025, 'unidad'], ['Acelga', 0.03, 'kg'], ['Ricota', 0.02, 'kg']]);
    bom('Canelones Verdura y Ricota', [['Harina 000', 0.02, 'kg'], ['Huevos', 0.015, 'unidad'], ['Acelga', 0.04, 'kg'], ['Ricota', 0.03, 'kg']]);
    bom('Canelones de Carne', [['Harina 000', 0.02, 'kg'], ['Huevos', 0.015, 'unidad'], ['Carne picada', 0.04, 'kg'], ['Salsa de tomate', 0.02, 'kg']]);
    bom('Canelones Pollo y Puerro', [['Harina 000', 0.02, 'kg'], ['Huevos', 0.015, 'unidad'], ['Pechuga de pollo', 0.035, 'kg'], ['Puerro', 0.02, 'kg']]);
    bom('Agnolotti de Osso Buco', [['Harina 000', 0.03, 'kg'], ['Huevos', 0.02, 'unidad'], ['Osso buco', 0.04, 'kg']]);
    bom('Agnolotti de Espinaca', [['Harina 000', 0.03, 'kg'], ['Huevos', 0.02, 'unidad'], ['Espinaca', 0.035, 'kg'], ['Ricota', 0.02, 'kg']]);
    bom('Raviolon Ricota y Nuez', [['Harina 000', 0.045, 'kg'], ['Huevos', 0.03, 'unidad'], ['Ricota', 0.035, 'kg'], ['Nuez picada', 0.01, 'kg']]);
    bom('Raviolon Jamon y Queso', [['Harina 000', 0.045, 'kg'], ['Huevos', 0.03, 'unidad'], ['Jamon cocido', 0.03, 'kg'], ['Queso muzzarella', 0.03, 'kg']]);
    bom('Noquis de Papa', [['Papa', 0.09, 'kg'], ['Harina 000', 0.02, 'kg'], ['Huevos', 0.005, 'unidad']]);
    bom('Noquis de Ricota', [['Ricota', 0.07, 'kg'], ['Harina 000', 0.02, 'kg'], ['Huevos', 0.005, 'unidad']]);
    bom('Noquis de Calabaza', [['Calabaza', 0.08, 'kg'], ['Harina 000', 0.02, 'kg'], ['Huevos', 0.005, 'unidad']]);
    bom('Fideos Tallarines', [['Harina 000', 0.09, 'kg'], ['Huevos', 0.02, 'unidad']]);
    bom('Fideos Fettuccine', [['Harina 000', 0.09, 'kg'], ['Huevos', 0.02, 'unidad']]);
    bom('Fideos al Huevo', [['Harina 000', 0.08, 'kg'], ['Huevos', 0.03, 'unidad']]);
    bom('Lasagna de Verdura', [['Harina 000', 0.05, 'kg'], ['Huevos', 0.03, 'unidad'], ['Acelga', 0.06, 'kg'], ['Queso muzzarella', 0.04, 'kg'], ['Salsa de tomate', 0.04, 'kg']]);
    bom('Lasagna de Carne', [['Harina 000', 0.05, 'kg'], ['Huevos', 0.03, 'unidad'], ['Carne picada', 0.07, 'kg'], ['Queso muzzarella', 0.04, 'kg'], ['Salsa de tomate', 0.04, 'kg']]);
    bom('Salsa Bolognesa', [['Carne picada', 0.25, 'kg'], ['Salsa de tomate', 0.3, 'kg'], ['Cebolla', 0.08, 'kg'], ['Zanahoria', 0.05, 'kg'], ['Apio', 0.03, 'kg'], ['Aceite de oliva', 0.02, 'litro']]);

    // --- Clientes de ejemplo ---
    const insCliente = db.prepare('INSERT INTO clientes (nombre, tipo, contacto) VALUES (?,?,?)');
    insCliente.run('Maria Fernandez', 'particular', '011-5555-0001');
    insCliente.run('Almacen Don Bosco', 'revendedor', '011-5555-0002');
    insCliente.run('Distribuidora Norte SRL', 'mayorista', '011-5555-0003');
    insCliente.run('Juan Perez', 'particular', '011-5555-0004');

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
