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

const dbPath = join(dataDir, 'pastas.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);
