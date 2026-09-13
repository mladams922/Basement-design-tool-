import express from 'express';
import { getDB, saveDB, nextId } from '../db.js';

const router = express.Router();

router.get('/plans/:planId/items', (req, res) => {
  const planId = Number(req.params.planId);
  res.json(getDB().items.filter((i) => i.planId === planId));
});

// Full replace of a plan's item list — the layout editor sends its whole
// canvas state on every save, which keeps client/server state trivially in sync.
router.put('/plans/:planId/items', (req, res) => {
  const db = getDB();
  const planId = Number(req.params.planId);
  const plan = db.plans.find((p) => p.id === planId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const incoming = Array.isArray(req.body.items) ? req.body.items : [];
  const saved = incoming.map((item) => ({
    id: Number.isInteger(item.id) && item.id > 0 ? item.id : nextId(),
    planId,
    type: item.type,
    label: item.label || '',
    xIn: Number(item.xIn) || 0,
    yIn: Number(item.yIn) || 0,
    widthIn: Number(item.widthIn) || 12,
    heightIn: Number(item.heightIn) || 12,
    rotation: Number(item.rotation) || 0,
    color: item.color || '#7c3aed',
  }));

  db.items = db.items.filter((i) => i.planId !== planId).concat(saved);
  plan.updatedAt = Date.now();
  saveDB();
  res.json(saved);
});

export default router;
