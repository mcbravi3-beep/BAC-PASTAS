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

function open() {
  const instance = new DatabaseSync(dbPath);
  instance.exec('PRAGMA foreign_keys = ON;');
  instance.exec(readFileSync(schemaPath, 'utf8'));
  aplicarMigraciones(instance);
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
