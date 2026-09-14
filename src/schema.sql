-- Sistema de Gestion - Fabrica de Pastas Caseras
-- Esquema de base de datos (SQLite)

CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  contacto TEXT,
  condicion_pago TEXT
);

CREATE TABLE IF NOT EXISTS insumos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'kg',
  costo_unitario REAL NOT NULL DEFAULT 0,
  proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  stock_minimo REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  categoria TEXT,
  precio_venta REAL NOT NULL DEFAULT 0,
  stock_inicial REAL NOT NULL DEFAULT 0,
  stock_minimo REAL NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS costeo_estandar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL UNIQUE REFERENCES productos(id) ON DELETE CASCADE,
  porciones_por_lote REAL NOT NULL,
  horas_armado REAL NOT NULL DEFAULT 0,
  horas_masa REAL NOT NULL DEFAULT 0,
  horas_relleno REAL NOT NULL DEFAULT 0,
  horas_empaquetado REAL NOT NULL DEFAULT 0,
  personas REAL NOT NULL DEFAULT 1,
  costo_hora_mano_obra REAL NOT NULL DEFAULT 0,
  costo_insumos_masa REAL NOT NULL DEFAULT 0,
  costo_insumos_relleno REAL NOT NULL DEFAULT 0,
  fecha_actualizacion TEXT
);

CREATE TABLE IF NOT EXISTS recetas_bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  cantidad_por_unidad REAL NOT NULL,
  unidad TEXT
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'particular' CHECK (tipo IN ('particular','mayorista','revendedor')),
  contacto TEXT
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad REAL NOT NULL,
  precio_unitario REAL NOT NULL,
  forma_pago TEXT,
  subtotal REAL NOT NULL,
  costo_unitario REAL NOT NULL,
  costo_total REAL NOT NULL,
  margen REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS produccion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad REAL NOT NULL,
  costo_unitario REAL NOT NULL,
  costo_total REAL NOT NULL,
  origen_costeo TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventario_insumos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  insumo_id INTEGER NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida')),
  motivo TEXT NOT NULL CHECK (motivo IN ('compra','produccion','merma','ajuste')),
  cantidad REAL NOT NULL,
  referencia TEXT
);

CREATE TABLE IF NOT EXISTS gastos_fijos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  concepto TEXT NOT NULL,
  monto REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recetas_producto ON recetas_bom(producto_id);
CREATE INDEX IF NOT EXISTS idx_inventario_insumo ON inventario_insumos(insumo_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_produccion_fecha ON produccion(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_periodo ON gastos_fijos(anio, mes);
