// Helper para generar rutas CRUD genericas sobre una tabla simple.
import { Router } from 'express';
import { db } from '../db.js';

export function crudRouter(table, fields, { orderBy = 'id' } = {}) {
  const router = Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  });

  router.post('/', (req, res) => {
    try {
      const cols = fields.filter((f) => req.body[f] !== undefined);
      if (cols.length === 0) return res.status(400).json({ error: 'Sin datos' });
      const placeholders = cols.map(() => '?').join(', ');
      const values = cols.map((c) => req.body[c]);
      const info = db
        .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)
        .run(...values);
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
      res.status(201).json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      const cols = fields.filter((f) => req.body[f] !== undefined);
      if (cols.length === 0) return res.status(400).json({ error: 'Sin datos' });
      const setClause = cols.map((c) => `${c} = ?`).join(', ');
      const values = cols.map((c) => req.body[c]);
      const info = db
        .prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`)
        .run(...values, req.params.id);
      if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
      if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: 'No se puede eliminar: tiene registros relacionados' });
    }
  });

  return router;
}
