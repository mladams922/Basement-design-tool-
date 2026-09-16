import express from 'express';
import { getDB, saveDB, nextId } from '../db.js';

const router = express.Router();

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const FIELDS = {
  name: (v) => String(v),
  category: (v) => String(v),
  model: (v) => String(v),
  vendorUrl: (v) => String(v),
  priceCents: (v) => Math.round(num(v, 0)),
  quantity: (v) => Math.max(1, Math.round(num(v, 1))),
  status: (v) => String(v),
  priority: (v) => String(v),
  notes: (v) => String(v),
  designId: (v) => (v ? Number(v) : null),
  roomId: (v) => (v ? Number(v) : null),
};

router.get('/', (req, res) => {
  res.json(getDB().equipment);
});

router.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ error: 'name is required' });
  const db = getDB();
  const item = {
    id: nextId(),
    name: body.name,
    category: body.category || 'Other',
    model: body.model || '',
    vendorUrl: body.vendorUrl || '',
    priceCents: Math.round(num(body.priceCents, 0)),
    quantity: Math.max(1, Math.round(num(body.quantity, 1))),
    status: body.status || 'wishlist',
    priority: body.priority || 'want',
    notes: body.notes || '',
    designId: body.designId ? Number(body.designId) : null,
    roomId: body.roomId ? Number(body.roomId) : null,
    createdAt: Date.now(),
  };
  db.equipment.push(item);
  saveDB();
  res.status(201).json(item);
});

router.put('/:id', (req, res) => {
  const db = getDB();
  const item = db.equipment.find((e) => e.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  const body = req.body || {};
  for (const [field, coerce] of Object.entries(FIELDS)) {
    if (body[field] !== undefined) item[field] = coerce(body[field]);
  }
  saveDB();
  res.json(item);
});

router.delete('/:id', (req, res) => {
  const db = getDB();
  const idx = db.equipment.findIndex((e) => e.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.equipment.splice(idx, 1);
  saveDB();
  res.status(204).end();
});

export default router;
