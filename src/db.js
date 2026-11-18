import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// DATA_DIR permite apuntar la base a un disco persistente (por ejemplo un
// Persistent Disk de Render montado en /var/data) para que los datos no se
// pierdan cuando el servicio se reinicia. Sin esa variable, usa una carpeta
// local (sirve para desarrollo, pero no persiste en hosting sin disco).
const dataDir = process.env.DATA_DIR || join(__dirname, '..', 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

export const dbPath = join(dataDir, 'pastas.db');
const schemaPath = join(__dirname, 'schema.sql');

// Migraciones idempotentes: cambios de esquema que se aplican sobre una base
// que ya existe y ya tiene datos reales (no se puede simplemente recrear la
// tabla). Cada sentencia se intenta una sola vez por columna/indice nuevo;
// si ya estaba aplicada de una corrida anterior, el error "duplicate column"
// (o "already exists") se ignora a proposito.
const MIGRACIONES = [
  "ALTER TABLE productos ADD COLUMN notas_receta TEXT",
  "ALTER TABLE productos ADD COLUMN porciones_receta REAL NOT NULL DEFAULT 1",
  "ALTER TABLE productos ADD COLUMN precio_venta_mayorista REAL NOT NULL DEFAULT 0",
  "ALTER TABLE productos ADD COLUMN precio_venta_minorista REAL NOT NULL DEFAULT 0",
  "ALTER TABLE clientes ADD COLUMN categoria TEXT CHECK (categoria IN ('mayorista','minorista'))",
];

function aplicarMigraciones(instance) {
  for (const sql of MIGRACIONES) {
    try {
      instance.exec(sql);
    } catch (err) {
      if (!/duplicate column name|already exists/i.test(err.message)) throw err;
    }
  }
}

// Backfills idempotentes: completan datos derivados de columnas nuevas sobre
// filas que ya existian antes de la migracion. Cada uno se protege con su
// propio WHERE para poder correr en cada arranque sin pisar datos ya
// cargados a mano. En una base recien creada algunas columnas viejas
// (p.ej. "precio_venta") ya no existen: el error "no such column" tambien
// se ignora a proposito.
const BACKFILLS = [
  `UPDATE productos SET precio_venta_mayorista = precio_venta, precio_venta_minorista = precio_venta
   WHERE precio_venta_mayorista = 0 AND precio_venta_minorista = 0 AND precio_venta > 0`,
  `UPDATE clientes SET categoria = CASE WHEN tipo = 'mayorista' THEN 'mayorista' ELSE 'minorista' END
   WHERE categoria IS NULL`,
];

function aplicarBackfills(instance) {
  for (const sql of BACKFILLS) {
    try {
      instance.exec(sql);
    } catch (err) {
      if (!/no such column/i.test(err.message)) throw err;
    }
  }
}

function open() {
  const instance = new DatabaseSync(dbPath);
  instance.exec('PRAGMA foreign_keys = ON;');
  instance.exec(readFileSync(schemaPath, 'utf8'));
  aplicarMigraciones(instance);
  aplicarBackfills(instance);
  return instance;
}

export let db = open();

/**
 * Cierra la conexion actual y vuelve a abrir el archivo de la base (se usa
 * despues de restaurar una copia de seguridad, que reemplaza el archivo
 * en disco). Como el resto de los modulos importan `db` por nombre, al
 * reasignar esta variable todos ven la conexion nueva automaticamente
 * (ES modules usan "live bindings" para los named exports).
 */
export function reabrirConexion() {
  try {
    db.close();
  } catch {
    // ya estaba cerrada (por ejemplo, si quien restaura ya la cerro antes de escribir el archivo)
  }
  db = open();
}
