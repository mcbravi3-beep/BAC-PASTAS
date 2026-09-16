// Datos iniciales de arranque del sistema.
//
// Migrados 1:1 desde "sistema_gestion_pastas.xlsx" (hoja Diccionario_Variables
// + hojas operativas). El propio archivo marca que datos son reales y cuales
// son de ejemplo:
//  - Catalogo de 23 productos (hoja Productos): REAL.
//  - Ficha de Costeo_Estandar de "Ravioles - Verdura y carne" (P001): REAL,
//    aportada por el negocio (asi factura sus costos reales).
//  - Proveedores, Insumos (con sus costos y stock minimo), Clientes,
//    Recetas_BOM de P001 y P005 (Sorrentinos Jamon y queso), y los
//    movimientos de Ventas/Produccion/Inventario_Insumos ya cargados:
//    la propia hoja los marca como "de ejemplo" para mostrar el mecanismo
//    (ver notas en cada hoja / hoja "Leeme"). Se migran igual, tal cual
//    estan en el Excel, para no perder ese trabajo de carga y prueba.
//  - Los otros 21 productos no tienen todavia ficha de costo ni precio de
//    venta cargado en el Excel (Costo_Unitario y Precio_Venta en blanco):
//    quedan asi, a completar desde Costeo Estandar / Recetas (BOM) y
//    Productos cuando el negocio tenga esos datos.
import { db } from './db.js';
import { registrarTicket } from './costeo.js';

export function seed() {
  const yaCargado = db.prepare('SELECT COUNT(*) AS n FROM productos').get().n > 0;
  if (yaCargado) return;

  // --- Proveedores ---
  const proveedoresData = [
    ['PR001', 'Molino San Justo', 'Harina', '011-4444-1111', 'Cta cte 30 dias'],
    ['PR002', 'Granja Los Aromos', 'Huevo', '011-4444-2222', 'Contado'],
    ['PR003', 'Distribuidora Lactea Sur', 'Ricota, queso, jamon, queso azul', '011-4444-3333', 'Cta cte 15 dias'],
    ['PR004', 'Verduleria Barrial', 'Espinaca, calabaza, morron, choclo', '011-4444-4444', 'Contado'],
    ['PR005', 'Carniceria del Barrio', 'Carne picada, osobuco', '011-4444-5555', 'Contado'],
    ['PR006', 'Almacen Mayorista', 'Sal y secos varios', '011-4444-6666', 'Contado'],
  ];
  const proveedorIds = {};
  const insProveedor = db.prepare(
    'INSERT INTO proveedores (codigo, nombre, insumos_que_provee, contacto, condicion_pago) VALUES (?,?,?,?,?)'
  );
  for (const [codigo, nombre, insumosQueProvee, contacto, condicion] of proveedoresData) {
    const info = insProveedor.run(codigo, nombre, insumosQueProvee, contacto, condicion);
    proveedorIds[codigo] = Number(info.lastInsertRowid);
  }

  // --- Insumos ---
  const insumosData = [
    ['I001', 'Harina 000', 'kg', 1200, 'PR001', 20],
    ['I002', 'Huevo', 'unidad', 250, 'PR002', 60],
    ['I003', 'Ricota', 'kg', 3500, 'PR003', 5],
    ['I004', 'Espinaca', 'kg', 1800, 'PR004', 5],
    ['I005', 'Carne picada', 'kg', 9000, 'PR005', 5],
    ['I006', 'Queso (mix 4 quesos)', 'kg', 8000, 'PR003', 5],
    ['I007', 'Sal', 'kg', 900, 'PR006', 2],
    ['I008', 'Jamon', 'kg', 7000, 'PR003', 5],
    ['I009', 'Queso azul', 'kg', 9500, 'PR003', 3],
    ['I010', 'Calabaza', 'kg', 1200, 'PR004', 5],
  ];
  const insumoIds = {};
  const insInsumo = db.prepare(
    'INSERT INTO insumos (codigo, nombre, unidad, costo_unitario, proveedor_id, stock_minimo) VALUES (?,?,?,?,?,?)'
  );
  for (const [codigo, nombre, unidad, costo, proveedorCodigo, stockMin] of insumosData) {
    const info = insInsumo.run(codigo, nombre, unidad, costo, proveedorIds[proveedorCodigo], stockMin);
    insumoIds[codigo] = Number(info.lastInsertRowid);
  }

  // --- Productos: catalogo real de 23 items ---
  // [codigo, categoria, nombre (sabor/variedad), unidad_venta, precio_venta]
  const productosData = [
    ['P001', 'Ravioles', 'Verdura y carne', 'Porcion', 2900],
    ['P002', 'Ravioles', 'Ricota y espinaca', 'Bandeja 1kg', 0],
    ['P003', 'Ravioles', '4 quesos', 'Bandeja 1kg', 0],
    ['P004', 'Ravioles', 'Pollo y queso azul', 'Bandeja 1kg', 0],
    ['P005', 'Sorrentinos', 'Jamon y queso', 'Bandeja 1kg', 6500],
    ['P006', 'Sorrentinos', '4 quesos', 'Bandeja 1kg', 0],
    ['P007', 'Sorrentinos', 'Calabaza', 'Bandeja 1kg', 0],
    ['P008', 'Sorrentinos', 'Vacio al vino tinto', 'Bandeja 1kg', 0],
    ['P009', 'Sorrentinos', 'Salmon rosado', 'Bandeja 1kg', 0],
    ['P010', 'Canelones', 'Carne y verdura', 'Bandeja x6', 0],
    ['P011', 'Canelones', 'Choclo y queso', 'Bandeja x6', 0],
    ['P012', 'Canelones', 'Espinaca y queso', 'Bandeja x6', 0],
    ['P013', 'Agnolotti', 'Pollo y puerro', 'Bandeja 1kg', 0],
    ['P014', 'Agnolotti', 'Osobuco braseado', 'Bandeja 1kg', 0],
    ['P015', 'Raviolon', 'Carne y verdura', 'Unidad', 0],
    ['P016', 'Noquis', 'Papa', 'Paquete 500g', 0],
    ['P017', 'Noquis', 'Espinaca', 'Paquete 500g', 0],
    ['P018', 'Noquis', 'Rellenos (queso y papa)', 'Paquete 500g', 0],
    ['P019', 'Fideos', 'Espinaca', 'Paquete 500g', 0],
    ['P020', 'Fideos', 'Huevo', 'Paquete 500g', 0],
    ['P021', 'Fideos', 'Morron', 'Paquete 500g', 0],
    ['P022', 'Lasagna', 'Lasagna', 'Bandeja 1kg', 0],
    ['P023', 'Salsa Bolognesa', 'Salsa Bolognesa', 'Frasco 500g', 0],
  ];
  const productoIds = {};
  const insProducto = db.prepare(
    'INSERT INTO productos (codigo, categoria, nombre, unidad_venta, precio_venta, stock_inicial, stock_minimo, activo) VALUES (?,?,?,?,?,0,0,1)'
  );
  for (const [codigo, categoria, nombre, unidadVenta, precio] of productosData) {
    const info = insProducto.run(codigo, categoria, nombre, unidadVenta, precio);
    productoIds[codigo] = Number(info.lastInsertRowid);
  }

  // --- Costeo_Estandar: ficha REAL de "Ravioles - Verdura y carne" (P001) ---
  // Dato real aportado por el negocio (asi calcula Meri su costo real).
  db.prepare(
    `INSERT INTO costeo_estandar
      (producto_id, porciones_por_lote, personas, horas_armado, horas_masa, horas_relleno, horas_empaquetado,
       costo_hora_mano_obra, costo_insumos_masa, costo_insumos_relleno, fecha_actualizacion)
     VALUES (?, 100, 2, 1.5, 0.333333333333333, 2, 1, 7000, 12000, 95000, '2026-09-01')`
  ).run(productoIds['P001']);

  // --- Recetas_BOM: cargadas en el Excel para P001 y P005 ---
  const insReceta = db.prepare(
    'INSERT INTO recetas_bom (producto_id, insumo_id, cantidad_por_unidad, unidad) VALUES (?,?,?,?)'
  );
  const bom = (productoCodigo, items) => {
    for (const [insumoCodigo, cantidad, unidad] of items) {
      insReceta.run(productoIds[productoCodigo], insumoIds[insumoCodigo], cantidad, unidad);
    }
  };
  bom('P001', [
    ['I001', 0.3, 'kg'],
    ['I002', 3, 'unidad'],
    ['I004', 0.15, 'kg'],
    ['I005', 0.2, 'kg'],
    ['I007', 0.01, 'kg'],
  ]);
  bom('P005', [
    ['I001', 0.3, 'kg'],
    ['I002', 3, 'unidad'],
    ['I008', 0.15, 'kg'],
    ['I006', 0.15, 'kg'],
    ['I007', 0.01, 'kg'],
  ]);

  // --- Clientes ---
  const clientesData = [
    ['C001', 'Juan Perez', 'particular', '011-5555-0001', 'Almagro'],
    ['C002', 'Almacen Don Jose', 'mayorista', '011-5555-0002', 'Caballito'],
    ['C003', 'Verduleria La Esquina', 'revendedor', '011-5555-0003', 'Flores'],
    ['C004', 'Maria Gonzalez', 'particular', '011-5555-0004', 'Boedo'],
  ];
  const clienteIds = {};
  const insCliente = db.prepare('INSERT INTO clientes (codigo, nombre, tipo, contacto, zona) VALUES (?,?,?,?,?)');
  for (const [codigo, nombre, tipo, contacto, zona] of clientesData) {
    const info = insCliente.run(codigo, nombre, tipo, contacto, zona);
    clienteIds[codigo] = Number(info.lastInsertRowid);
  }

  // --- Inventario_Insumos: compras ya cargadas en el Excel (30/08/2026) ---
  const insMovimiento = db.prepare(
    `INSERT INTO inventario_insumos (fecha, insumo_id, tipo, motivo, cantidad, referencia)
     VALUES (?, ?, 'entrada', 'compra', ?, 'Compra insumos')`
  );
  insMovimiento.run('2026-08-30', insumoIds['I001'], 50);
  insMovimiento.run('2026-08-30', insumoIds['I002'], 200);
  insMovimiento.run('2026-08-30', insumoIds['I004'], 20);
  insMovimiento.run('2026-08-30', insumoIds['I005'], 25);
  insMovimiento.run('2026-08-30', insumoIds['I006'], 15);
  insMovimiento.run('2026-08-30', insumoIds['I007'], 5);

  // --- Produccion: lotes ya cargados en el Excel. Se insertan tal cual
  // (sin generar salidas de insumos) porque en el Excel migrado el
  // descuento automatico todavia no existia -- es la mejora que este
  // sistema agrega de ahora en adelante para las producciones nuevas.
  const insProduccion = db.prepare(
    `INSERT INTO produccion (fecha, producto_id, cantidad, costo_unitario, costo_total, origen_costeo)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  insProduccion.run('2026-08-25', productoIds['P005'], 10, 3369, 33690, 'bom');
  insProduccion.run('2026-09-01', productoIds['P001'], 40, 1746.6666666666665, 69866.66666666666, 'estandar');
  insProduccion.run('2026-09-01', productoIds['P005'], 30, 3369, 101070, 'bom');

  // --- Ventas: cargadas en el Excel como tickets de pago inmediato
  // (agrupando por fecha+cliente las lineas que compartian ambos datos).
  registrarTicket({
    clienteId: clienteIds['C004'], tipoPago: 'contado', formaPago: 'Transferencia', fecha: '2026-08-28',
    items: [{ productoId: productoIds['P005'], cantidad: 2, precioUnitario: 6500 }],
  });
  registrarTicket({
    clienteId: clienteIds['C001'], tipoPago: 'contado', formaPago: 'Efectivo', fecha: '2026-09-02',
    items: [{ productoId: productoIds['P001'], cantidad: 2, precioUnitario: 2900 }],
  });
  registrarTicket({
    clienteId: clienteIds['C002'], tipoPago: 'contado', formaPago: 'Transferencia', fecha: '2026-09-03',
    items: [
      { productoId: productoIds['P001'], cantidad: 10, precioUnitario: 2900 },
      { productoId: productoIds['P005'], cantidad: 8, precioUnitario: 6500 },
    ],
  });
  registrarTicket({
    clienteId: clienteIds['C003'], tipoPago: 'contado', formaPago: 'Efectivo', fecha: '2026-09-05',
    items: [{ productoId: productoIds['P005'], cantidad: 5, precioUnitario: 6500 }],
  });
  registrarTicket({
    clienteId: clienteIds['C001'], tipoPago: 'contado', formaPago: 'Efectivo', fecha: '2026-09-07',
    items: [{ productoId: productoIds['P005'], cantidad: 1, precioUnitario: 6500 }],
  });
  registrarTicket({
    clienteId: clienteIds['C004'], tipoPago: 'contado', formaPago: 'Transferencia', fecha: '2026-09-10',
    items: [{ productoId: productoIds['P001'], cantidad: 3, precioUnitario: 2900 }],
  });
  registrarTicket({
    clienteId: clienteIds['C002'], tipoPago: 'contado', formaPago: 'Transferencia', fecha: '2026-09-12',
    items: [{ productoId: productoIds['P001'], cantidad: 12, precioUnitario: 2900 }],
  });
}
