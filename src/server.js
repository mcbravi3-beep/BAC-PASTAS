import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import './db.js';
import { api } from './routes/api.js';
import { seed } from './seed.js';

seed();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use('/api', api);
app.use(express.static(join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sistema de gestion de pastas corriendo en http://localhost:${PORT}`);
});
