import express from 'express';
import { getDB, saveDB, nextId } from '../db.js';

const router = express.Router();

const DEFAULT_SHELL = [
  { xIn: 0, yIn: 0 },
  { xIn: 384, yIn: 0 },
  { xIn: 384, yIn: 288 },
  { xIn: 0, yIn: 288 },
];

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeShell(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  return points.map((p) => ({ xIn: num(p.xIn, 0), yIn: num(p.yIn, 0) }));
}

function findDesign(id) {
  return getDB().designs.find((d) => d.id === Number(id));
}

router.get('/', (req, res) => {
  res.json(getDB().designs);
});

router.post('/', (req, res) => {
  const { name, shellPoints, extWallThicknessIn, defaultCeilingHeightIn, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const db = getDB();
  const design = {
    id: nextId(),
    name,
    notes: notes || '',
    shellPoints: sanitizeShell(shellPoints) || structuredClone(DEFAULT_SHELL),
    extWallThicknessIn: num(extWallThicknessIn, 8),
    defaultCeilingHeightIn: num(defaultCeilingHeightIn, 92),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  db.designs.push(design);
  saveDB();
  res.status(201).json(design);
});

router.get('/:id', (req, res) => {
  const design = findDesign(req.params.id);
  if (!design) return res.status(404).json({ error: 'Not found' });
  res.json(design);
});

router.put('/:id', (req, res) => {
  const design = findDesign(req.params.id);
  if (!design) return res.status(404).json({ error: 'Not found' });
  const { name, shellPoints, extWallThicknessIn, defaultCeilingHeightIn, notes } = req.body || {};
  if (name !== undefined) design.name = name;
  if (notes !== undefined) design.notes = notes;
  if (shellPoints !== undefined) {
    const shell = sanitizeShell(shellPoints);
    if (shell) design.shellPoints = shell;
  }
  if (extWallThicknessIn !== undefined) design.extWallThicknessIn = num(extWallThicknessIn, 8);
  if (defaultCeilingHeightIn !== undefined) {
    design.defaultCeilingHeightIn = num(defaultCeilingHeightIn, 92);
  }
  design.updatedAt = Date.now();
  saveDB();
  res.json(design);
});

router.delete('/:id', (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const idx = db.designs.findIndex((d) => d.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.designs.splice(idx, 1);
  db.cables = db.cables.filter((c) => c.designId !== id);
  db.walls = db.walls.filter((w) => w.designId !== id);
  db.openings = db.openings.filter((o) => o.designId !== id);
  db.rooms = db.rooms.filter((r) => r.designId !== id);
  db.objects = db.objects.filter((o) => o.designId !== id);
  saveDB();
  res.status(204).end();
});

// Everything that lives inside a design, in one round trip. The editor holds
// the whole plan in memory, so a bulk get/replace keeps client and server
// trivially in sync without diffing.
router.get('/:id/plan', (req, res) => {
  const design = findDesign(req.params.id);
  if (!design) return res.status(404).json({ error: 'Not found' });
  const db = getDB();
  const id = design.id;
  res.json({
    design,
    walls: db.walls.filter((w) => w.designId === id),
    openings: db.openings.filter((o) => o.designId === id),
    rooms: db.rooms.filter((r) => r.designId === id),
    objects: db.objects.filter((o) => o.designId === id),
    cables: db.cables.filter((c) => c.designId === id),
  });
});

function assignId(item) {
  return Number.isInteger(item.id) && item.id > 0 ? item.id : nextId();
}

router.put('/:id/plan', (req, res) => {
  const design = findDesign(req.params.id);
  if (!design) return res.status(404).json({ error: 'Not found' });
  const db = getDB();
  const designId = design.id;
  const body = req.body || {};

  // New walls arrive with client-side placeholder ids; remember the mapping so
  // openings hosted on them can be repointed at the real ids below.
  const wallIdMap = new Map();
  const walls = (Array.isArray(body.walls) ? body.walls : []).map((w) => {
    const id = assignId(w);
    if (w.id != null) wallIdMap.set(Number(w.id), id);
    return {
      id,
      designId,
      x1In: num(w.x1In, 0),
      y1In: num(w.y1In, 0),
      x2In: num(w.x2In, 0),
      y2In: num(w.y2In, 0),
      thicknessIn: num(w.thicknessIn, 4.5),
      heightIn: num(w.heightIn, design.defaultCeilingHeightIn),
      label: w.label || '',
    };
  });

  const wallIds = new Set(walls.map((w) => w.id));
  const openings = (Array.isArray(body.openings) ? body.openings : [])
    .map((o) => {
      const hostType = o.hostType === 'shell' ? 'shell' : 'wall';
      const rawHost = num(o.hostId, 0);
      return {
        id: assignId(o),
        designId,
        hostType,
        hostId: hostType === 'wall' ? wallIdMap.get(rawHost) ?? rawHost : rawHost,
        offsetIn: num(o.offsetIn, 0),
        widthIn: num(o.widthIn, 32),
        heightIn: num(o.heightIn, 80),
        sillIn: num(o.sillIn, 0),
        type: o.type || 'door',
        swing: o.swing || 'left',
      };
    })
    // Drop openings whose host wall was deleted in the same save.
    .filter((o) => o.hostType === 'shell' || wallIds.has(o.hostId));

  const rooms = (Array.isArray(body.rooms) ? body.rooms : []).map((r) => ({
    id: assignId(r),
    designId,
    name: r.name || 'Room',
    type: r.type || 'other',
    seedXIn: num(r.seedXIn, 0),
    seedYIn: num(r.seedYIn, 0),
    ceilingHeightIn: r.ceilingHeightIn == null ? null : num(r.ceilingHeightIn, null),
    color: r.color || '#3b82f6',
    notes: r.notes || '',
    // Theater rooms carry their screen/projector/seating configuration.
    theater: r.theater && typeof r.theater === 'object' ? r.theater : null,
  }));

  // Cables reference objects by id, so new objects' placeholder ids need the
  // same remapping treatment as walls.
  const objectIdMap = new Map();
  const objects = (Array.isArray(body.objects) ? body.objects : []).map((o) => {
    const id = assignId(o);
    if (o.id != null) objectIdMap.set(Number(o.id), id);
    return {
    id,
    designId,
    category: o.category || 'furniture',
    type: o.type || 'generic',
    label: o.label || '',
    cxIn: num(o.cxIn, 0),
    cyIn: num(o.cyIn, 0),
    widthIn: num(o.widthIn, 24),
    depthIn: num(o.depthIn, 24),
    heightIn: num(o.heightIn, 30),
    elevationIn: num(o.elevationIn, 0),
    rotationDeg: num(o.rotationDeg, 0),
    color: o.color || '#6d28d9',
    meta: o.meta && typeof o.meta === 'object' ? o.meta : {},
    };
  });

  const objectIds = new Set(objects.map((o) => o.id));
  const cables = (Array.isArray(body.cables) ? body.cables : [])
    .map((c) => {
      const from = num(c.fromObjectId, 0);
      const to = num(c.toObjectId, 0);
      return {
        id: assignId(c),
        designId,
        type: c.type || 'hdmi',
        fromObjectId: objectIdMap.get(from) ?? from,
        toObjectId: objectIdMap.get(to) ?? to,
        waypoints: Array.isArray(c.waypoints)
          ? c.waypoints.map((p) => ({ xIn: num(p.xIn, 0), yIn: num(p.yIn, 0) }))
          : [],
        slackPct: num(c.slackPct, 15),
        label: c.label || '',
        notes: c.notes || '',
      };
    })
    // Drop runs whose endpoints were deleted.
    .filter((c) => objectIds.has(c.fromObjectId) && objectIds.has(c.toObjectId));

  db.cables = db.cables.filter((c) => c.designId !== designId).concat(cables);
  db.walls = db.walls.filter((w) => w.designId !== designId).concat(walls);
  db.openings = db.openings.filter((o) => o.designId !== designId).concat(openings);
  db.rooms = db.rooms.filter((r) => r.designId !== designId).concat(rooms);
  db.objects = db.objects.filter((o) => o.designId !== designId).concat(objects);

  if (body.design) {
    const d = body.design;
    if (d.shellPoints !== undefined) {
      const shell = sanitizeShell(d.shellPoints);
      if (shell) design.shellPoints = shell;
    }
    if (d.extWallThicknessIn !== undefined) {
      design.extWallThicknessIn = num(d.extWallThicknessIn, 8);
    }
    if (d.defaultCeilingHeightIn !== undefined) {
      design.defaultCeilingHeightIn = num(d.defaultCeilingHeightIn, 92);
    }
    if (d.notes !== undefined) design.notes = d.notes;
    if (d.name !== undefined) design.name = d.name;
  }
  design.updatedAt = Date.now();

  saveDB();
  res.json({ design, walls, openings, rooms, objects, cables });
});

export default router;
