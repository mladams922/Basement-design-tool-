import express from 'express';
import { getDB, saveDB, nextId } from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(getDB().equipment);
});

router.post('/', (req, res) => {
  const { name, category, priceCents, status, notes, planId } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const db = getDB();
  const item = {
    id: nextId(),
    name,
    category: category || 'Other',
    priceCents: Number(priceCents) || 0,
    status: status || 'wishlist',
    notes: notes || '',
    planId: planId ? Number(planId) : null,
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
  const { name, category, priceCents, status, notes, planId } = req.body || {};
  if (name !== undefined) item.name = name;
  if (category !== undefined) item.category = category;
  if (priceCents !== undefined) item.priceCents = Number(priceCents);
  if (status !== undefined) item.status = status;
  if (notes !== undefined) item.notes = notes;
  if (planId !== undefined) item.planId = planId ? Number(planId) : null;
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
