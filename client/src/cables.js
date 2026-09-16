// Low-voltage runs between placed objects. Lengths assume the cable goes up to
// the ceiling/joist bay, across, and back down — which is how a basement gets
// wired when the ceiling is open.

export const CABLE_TYPES = [
  {
    key: 'hdmi',
    label: 'HDMI',
    color: '#22d3ee',
    maxFt: 25,
    warning: 'Passive HDMI gets unreliable past about 25 ft — use an active or fibre-optic cable.',
  },
  {
    key: 'cat6',
    label: 'Network (Cat6)',
    color: '#4ade80',
    maxFt: 328,
    warning: 'Ethernet is limited to 100 m (328 ft) per run.',
  },
  { key: 'speaker16', label: 'Speaker 16 AWG', color: '#fbbf24', maxFt: 50, warning: 'Past ~50 ft step up to 14 AWG to keep resistance low.' },
  { key: 'speaker14', label: 'Speaker 14 AWG', color: '#f59e0b', maxFt: 80, warning: 'Past ~80 ft step up to 12 AWG.' },
  { key: 'speaker12', label: 'Speaker 12 AWG', color: '#d97706', maxFt: 150 },
  {
    key: 'sub',
    label: 'Subwoofer (RCA)',
    color: '#ef4444',
    maxFt: 25,
    warning: 'Long unbalanced runs pick up hum — consider balanced XLR or a well-shielded cable.',
  },
  { key: 'coax', label: 'Coax', color: '#a78bfa' },
  { key: 'control', label: 'IR / control', color: '#94a3b8' },
  { key: 'power', label: 'Power', color: '#fde047', warning: 'Line voltage must be run by a licensed electrician to code.' },
];

export const CABLE_TYPES_BY_KEY = Object.fromEntries(CABLE_TYPES.map((c) => [c.key, c]));

export function cableEndpoints(cable, objects) {
  const from = objects.find((o) => o.id === cable.fromObjectId);
  const to = objects.find((o) => o.id === cable.toObjectId);
  if (!from || !to) return null;
  return { from, to };
}

// Full path in plan coordinates: source, any waypoints, destination.
export function cablePath(cable, objects) {
  const ends = cableEndpoints(cable, objects);
  if (!ends) return null;
  return [
    { xIn: ends.from.cxIn, yIn: ends.from.cyIn },
    ...(cable.waypoints || []),
    { xIn: ends.to.cxIn, yIn: ends.to.cyIn },
  ];
}

// A right-angled route looks like a real run stapled along joists, and gives a
// more honest length than a diagonal straight line.
export function defaultWaypoints(from, to) {
  return [{ xIn: to.cxIn, yIn: from.cyIn }];
}

export function cableLength(cable, objects, ceilingHeightIn) {
  const ends = cableEndpoints(cable, objects);
  const path = cablePath(cable, objects);
  if (!ends || !path) return null;

  let horizontalIn = 0;
  for (let i = 1; i < path.length; i++) {
    horizontalIn += Math.hypot(path[i].xIn - path[i - 1].xIn, path[i].yIn - path[i - 1].yIn);
  }

  const fromTop = ends.from.elevationIn + ends.from.heightIn;
  const toTop = ends.to.elevationIn + ends.to.heightIn;
  const verticalIn =
    Math.max(0, ceilingHeightIn - fromTop) + Math.max(0, ceilingHeightIn - toTop);

  const rawIn = horizontalIn + verticalIn;
  const slack = 1 + (cable.slackPct ?? 15) / 100;
  const totalIn = rawIn * slack;

  return {
    horizontalIn,
    verticalIn,
    rawIn,
    totalIn,
    totalFt: totalIn / 12,
  };
}

export function cableWarnings(cable, lengthFt) {
  const spec = CABLE_TYPES_BY_KEY[cable.type];
  if (!spec || lengthFt == null) return [];
  const list = [];
  if (spec.maxFt && lengthFt > spec.maxFt && spec.warning) {
    list.push({ level: 'warn', text: spec.warning });
  }
  if (spec.key === 'power' && spec.warning) {
    list.push({ level: 'warn', text: spec.warning });
  }
  return list;
}

// Groups runs by cable type for ordering: total feet plus a per-run breakdown.
export function cableSummary(cables, objects, ceilingHeightIn) {
  const groups = new Map();
  for (const cable of cables) {
    const length = cableLength(cable, objects, ceilingHeightIn);
    if (!length) continue;
    const spec = CABLE_TYPES_BY_KEY[cable.type] || { label: cable.type };
    if (!groups.has(cable.type)) {
      groups.set(cable.type, { type: cable.type, label: spec.label, runs: 0, totalFt: 0 });
    }
    const group = groups.get(cable.type);
    group.runs += 1;
    group.totalFt += length.totalFt;
  }
  return [...groups.values()].sort((a, b) => b.totalFt - a.totalFt);
}
