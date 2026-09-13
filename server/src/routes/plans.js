import express from 'express';
import { getDB, saveDB, nextId } from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(getDB().plans);
});

router.post('/', (req, res) => {
  const { name, widthIn, lengthIn, heightIn, notes } = req.body || {};
  if (!name || !widthIn || !lengthIn) {
    return res.status(400).json({ error: 'name, widthIn, and lengthIn are required' });
  }
  const db = getDB();
  const plan = {
    id: nextId(),
    name,
    widthIn: Number(widthIn),
    lengthIn: Number(lengthIn),
    heightIn: Number(heightIn) || 96,
    notes: notes || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  db.plans.push(plan);
  saveDB();
  res.status(201).json(plan);
});

router.get('/:id', (req, res) => {
  const plan = getDB().plans.find((p) => p.id === Number(req.params.id));
  if (!plan) return res.status(404).json({ error: 'Not found' });
  res.json(plan);
});

router.put('/:id', (req, res) => {
  const db = getDB();
  const plan = db.plans.find((p) => p.id === Number(req.params.id));
  if (!plan) return res.status(404).json({ error: 'Not found' });
  const { name, widthIn, lengthIn, heightIn, notes } = req.body || {};
  if (name !== undefined) plan.name = name;
  if (widthIn !== undefined) plan.widthIn = Number(widthIn);
  if (lengthIn !== undefined) plan.lengthIn = Number(lengthIn);
  if (heightIn !== undefined) plan.heightIn = Number(heightIn);
  if (notes !== undefined) plan.notes = notes;
  plan.updatedAt = Date.now();
  saveDB();
  res.json(plan);
});

router.delete('/:id', (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const idx = db.plans.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.plans.splice(idx, 1);
  db.items = db.items.filter((i) => i.planId !== id);
  saveDB();
  res.status(204).end();
});

export default router;
