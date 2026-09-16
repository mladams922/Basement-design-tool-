// Placeable objects. Dimensions are real-world typical sizes in inches
// (widthIn = across the front, depthIn = front to back, heightIn = tall).
// elevationIn is height of the object's underside above the floor;
// 'ceiling' means it hangs from the ceiling of whatever room it's in.

export const CATEGORIES = [
  { key: 'structure', label: 'Structure' },
  { key: 'utility', label: 'Utilities' },
  { key: 'stairs', label: 'Stairs' },
  { key: 'seating', label: 'Seating' },
  { key: 'tables', label: 'Tables' },
  { key: 'bar', label: 'Bar' },
  { key: 'gym', label: 'Gym' },
  { key: 'storage', label: 'Storage' },
  { key: 'av', label: 'AV & Network' },
  { key: 'lighting', label: 'Lighting' },
];

export const PRESETS = [
  // --- Structure ---
  { key: 'column-steel', category: 'structure', label: 'Lally Column', widthIn: 4, depthIn: 4, heightIn: 92, shape: 'circle', color: '#64748b', fullHeight: true },
  { key: 'post-wood', category: 'structure', label: 'Wood Post', widthIn: 5.5, depthIn: 5.5, heightIn: 92, shape: 'rect', color: '#78716c', fullHeight: true },
  { key: 'beam', category: 'structure', label: 'Beam', widthIn: 144, depthIn: 8, heightIn: 12, shape: 'rect', color: '#57534e', elevation: 'ceiling-drop' },
  { key: 'soffit', category: 'structure', label: 'Soffit / Bulkhead', widthIn: 120, depthIn: 24, heightIn: 14, shape: 'rect', color: '#44403c', elevation: 'ceiling-drop', note: 'Drops ceiling height beneath it' },
  { key: 'chase', category: 'structure', label: 'Duct Chase', widthIn: 18, depthIn: 18, heightIn: 92, shape: 'rect', color: '#44403c', fullHeight: true },
  { key: 'window-well', category: 'structure', label: 'Egress Well', widthIn: 48, depthIn: 36, heightIn: 4, shape: 'rect', color: '#334155' },

  // --- Utilities ---
  { key: 'furnace', category: 'utility', label: 'Furnace / Air Handler', widthIn: 24, depthIn: 30, heightIn: 60, shape: 'rect', color: '#475569' },
  { key: 'water-heater', category: 'utility', label: 'Water Heater', widthIn: 22, depthIn: 22, heightIn: 60, shape: 'circle', color: '#475569' },
  { key: 'electrical-panel', category: 'utility', label: 'Electrical Panel', widthIn: 16, depthIn: 5, heightIn: 30, elevationIn: 48, shape: 'rect', color: '#a16207' },
  { key: 'sump', category: 'utility', label: 'Sump Pit', widthIn: 24, depthIn: 24, heightIn: 2, shape: 'circle', color: '#1e3a5f' },
  { key: 'floor-drain', category: 'utility', label: 'Floor Drain', widthIn: 6, depthIn: 6, heightIn: 1, shape: 'circle', color: '#1e3a5f' },
  { key: 'water-softener', category: 'utility', label: 'Water Softener', widthIn: 14, depthIn: 14, heightIn: 48, shape: 'circle', color: '#475569' },
  { key: 'hvac-return', category: 'utility', label: 'HVAC Return', widthIn: 24, depthIn: 8, heightIn: 8, shape: 'rect', color: '#52525b' },

  // --- Stairs ---
  { key: 'stairs-straight', category: 'stairs', label: 'Straight Stairs', widthIn: 36, depthIn: 120, heightIn: 92, shape: 'stairs', color: '#3f3f46', meta: { treads: 13, riserIn: 7.5, direction: 'up' }, fullHeight: true },
  { key: 'stairs-landing', category: 'stairs', label: 'Stair Landing', widthIn: 36, depthIn: 36, heightIn: 4, shape: 'rect', color: '#3f3f46' },

  // --- Seating ---
  { key: 'sofa', category: 'seating', label: 'Sofa (3-seat)', widthIn: 84, depthIn: 38, heightIn: 34, shape: 'sofa', color: '#7c2d12' },
  { key: 'sectional', category: 'seating', label: 'Sectional', widthIn: 110, depthIn: 90, heightIn: 34, shape: 'sofa', color: '#7c2d12' },
  { key: 'loveseat', category: 'seating', label: 'Loveseat', widthIn: 60, depthIn: 38, heightIn: 34, shape: 'sofa', color: '#7c2d12' },
  { key: 'armchair', category: 'seating', label: 'Armchair', widthIn: 34, depthIn: 36, heightIn: 34, shape: 'sofa', color: '#9a3412' },
  { key: 'recliner', category: 'seating', label: 'Recliner', widthIn: 38, depthIn: 40, heightIn: 42, shape: 'sofa', color: '#9a3412' },
  { key: 'theater-seat', category: 'seating', label: 'Theater Seat', widthIn: 30, depthIn: 36, heightIn: 42, shape: 'sofa', color: '#991b1b' },
  { key: 'ottoman', category: 'seating', label: 'Ottoman', widthIn: 30, depthIn: 20, heightIn: 18, shape: 'rect', color: '#9a3412' },
  { key: 'bar-stool', category: 'seating', label: 'Bar Stool', widthIn: 17, depthIn: 17, heightIn: 30, shape: 'circle', color: '#a16207' },

  // --- Tables ---
  { key: 'coffee-table', category: 'tables', label: 'Coffee Table', widthIn: 48, depthIn: 24, heightIn: 18, shape: 'rect', color: '#78350f' },
  { key: 'end-table', category: 'tables', label: 'End Table', widthIn: 22, depthIn: 22, heightIn: 24, shape: 'rect', color: '#78350f' },
  { key: 'dining-table', category: 'tables', label: 'Dining Table', widthIn: 72, depthIn: 36, heightIn: 30, shape: 'rect', color: '#78350f' },
  { key: 'pool-table', category: 'tables', label: 'Pool Table (8ft)', widthIn: 100, depthIn: 56, heightIn: 32, shape: 'rect', color: '#14532d', note: 'Needs ~5ft cue clearance all around' },
  { key: 'poker-table', category: 'tables', label: 'Poker Table', widthIn: 84, depthIn: 48, heightIn: 30, shape: 'circle', color: '#14532d' },
  { key: 'foosball', category: 'tables', label: 'Foosball / Air Hockey', widthIn: 56, depthIn: 30, heightIn: 36, shape: 'rect', color: '#166534' },

  // --- Bar ---
  { key: 'bar-counter', category: 'bar', label: 'Bar Counter', widthIn: 96, depthIn: 25, heightIn: 42, shape: 'bar', color: '#713f12' },
  { key: 'bar-return', category: 'bar', label: 'Bar Return (L)', widthIn: 48, depthIn: 25, heightIn: 42, shape: 'bar', color: '#713f12' },
  { key: 'back-bar', category: 'bar', label: 'Back Bar / Shelving', widthIn: 72, depthIn: 14, heightIn: 84, shape: 'rect', color: '#713f12' },
  { key: 'kegerator', category: 'bar', label: 'Kegerator', widthIn: 24, depthIn: 26, heightIn: 35, shape: 'rect', color: '#57534e' },
  { key: 'mini-fridge', category: 'bar', label: 'Undercounter Fridge', widthIn: 24, depthIn: 24, heightIn: 34, shape: 'rect', color: '#57534e' },
  { key: 'wine-fridge', category: 'bar', label: 'Wine Fridge', widthIn: 24, depthIn: 24, heightIn: 34, shape: 'rect', color: '#57534e' },
  { key: 'bar-sink', category: 'bar', label: 'Bar Sink', widthIn: 24, depthIn: 21, heightIn: 36, shape: 'rect', color: '#475569' },
  { key: 'dishwasher', category: 'bar', label: 'Dishwasher', widthIn: 24, depthIn: 24, heightIn: 34, shape: 'rect', color: '#475569' },

  // --- Gym ---
  { key: 'squat-rack', category: 'gym', label: 'Squat Rack', widthIn: 48, depthIn: 48, heightIn: 84, shape: 'rect', color: '#1e293b', note: 'Check ceiling height for overhead press' },
  { key: 'gym-bench', category: 'gym', label: 'Bench', widthIn: 48, depthIn: 24, heightIn: 18, shape: 'rect', color: '#1e293b' },
  { key: 'treadmill', category: 'gym', label: 'Treadmill', widthIn: 35, depthIn: 70, heightIn: 55, shape: 'rect', color: '#1e293b', note: 'Deck adds ~8" to standing height' },
  { key: 'elliptical', category: 'gym', label: 'Elliptical', widthIn: 28, depthIn: 70, heightIn: 64, shape: 'rect', color: '#1e293b' },
  { key: 'exercise-bike', category: 'gym', label: 'Exercise Bike', widthIn: 24, depthIn: 48, heightIn: 50, shape: 'rect', color: '#1e293b' },
  { key: 'dumbbell-rack', category: 'gym', label: 'Dumbbell Rack', widthIn: 60, depthIn: 24, heightIn: 36, shape: 'rect', color: '#1e293b' },
  { key: 'cable-machine', category: 'gym', label: 'Cable Machine', widthIn: 60, depthIn: 48, heightIn: 84, shape: 'rect', color: '#1e293b' },
  { key: 'gym-mat', category: 'gym', label: 'Mat Area', widthIn: 96, depthIn: 72, heightIn: 1, shape: 'rect', color: '#334155' },
  { key: 'gym-mirror', category: 'gym', label: 'Mirror Panel', widthIn: 72, depthIn: 2, heightIn: 60, elevationIn: 24, shape: 'rect', color: '#94a3b8' },

  // --- Storage ---
  { key: 'shelving', category: 'storage', label: 'Shelving Unit', widthIn: 48, depthIn: 18, heightIn: 72, shape: 'rect', color: '#57534e' },
  { key: 'cabinet', category: 'storage', label: 'Storage Cabinet', widthIn: 36, depthIn: 24, heightIn: 84, shape: 'rect', color: '#57534e' },
  { key: 'workbench', category: 'storage', label: 'Workbench', widthIn: 72, depthIn: 30, heightIn: 36, shape: 'rect', color: '#78350f' },
  { key: 'washer', category: 'storage', label: 'Washer', widthIn: 27, depthIn: 30, heightIn: 38, shape: 'rect', color: '#475569' },
  { key: 'dryer', category: 'storage', label: 'Dryer', widthIn: 27, depthIn: 30, heightIn: 38, shape: 'rect', color: '#475569' },
  { key: 'utility-sink', category: 'storage', label: 'Utility Sink', widthIn: 24, depthIn: 22, heightIn: 36, shape: 'rect', color: '#475569' },
  { key: 'freezer', category: 'storage', label: 'Chest Freezer', widthIn: 48, depthIn: 26, heightIn: 34, shape: 'rect', color: '#475569' },

  // --- AV & Network ---
  {
    key: 'server-rack',
    category: 'av',
    label: 'Server Rack',
    widthIn: 24,
    depthIn: 36,
    heightIn: 78,
    shape: 'rack',
    color: '#111827',
    meta: { rackU: 42, frontClearanceIn: 36, rearClearanceIn: 30, watts: 600 },
    note: 'Clearance zones shown; generates heat and fan noise',
  },
  { key: 'av-rack', category: 'av', label: 'AV Rack (short)', widthIn: 24, depthIn: 26, heightIn: 42, shape: 'rack', color: '#1f2937', meta: { rackU: 20, frontClearanceIn: 30, rearClearanceIn: 18, watts: 300 } },
  { key: 'wall-tv', category: 'av', label: 'Wall TV', widthIn: 60, depthIn: 4, heightIn: 34, elevationIn: 40, shape: 'screen', color: '#0f172a' },
  { key: 'media-console', category: 'av', label: 'Media Console', widthIn: 60, depthIn: 18, heightIn: 24, shape: 'rect', color: '#3f3f46' },
  { key: 'speaker-tower', category: 'av', label: 'Tower Speaker', widthIn: 12, depthIn: 14, heightIn: 42, shape: 'speaker', color: '#b45309' },
  { key: 'speaker-bookshelf', category: 'av', label: 'Bookshelf Speaker', widthIn: 9, depthIn: 11, heightIn: 15, elevationIn: 36, shape: 'speaker', color: '#b45309' },
  { key: 'speaker-inceiling', category: 'av', label: 'In-Ceiling Speaker', widthIn: 9, depthIn: 9, heightIn: 4, shape: 'speaker', color: '#d97706', elevation: 'ceiling' },
  { key: 'speaker-inwall', category: 'av', label: 'In-Wall Speaker', widthIn: 10, depthIn: 4, heightIn: 14, elevationIn: 48, shape: 'speaker', color: '#d97706' },
  { key: 'subwoofer', category: 'av', label: 'Subwoofer', widthIn: 18, depthIn: 18, heightIn: 20, shape: 'speaker', color: '#7f1d1d' },
  { key: 'outlet', category: 'av', label: 'Outlet / Data Box', widthIn: 5, depthIn: 2, heightIn: 5, elevationIn: 16, shape: 'rect', color: '#a3a3a3' },

  // --- Lighting ---
  { key: 'can-light', category: 'lighting', label: 'Recessed Can', widthIn: 6, depthIn: 6, heightIn: 1, shape: 'light', color: '#fbbf24', elevation: 'ceiling' },
  { key: 'pendant', category: 'lighting', label: 'Pendant', widthIn: 12, depthIn: 12, heightIn: 12, shape: 'light', color: '#fbbf24', elevation: 'ceiling-drop' },
  { key: 'sconce', category: 'lighting', label: 'Sconce', widthIn: 6, depthIn: 4, heightIn: 12, elevationIn: 66, shape: 'light', color: '#fbbf24' },
  { key: 'led-strip', category: 'lighting', label: 'LED Strip / Cove', widthIn: 96, depthIn: 2, heightIn: 1, shape: 'rect', color: '#fcd34d', elevation: 'ceiling' },
  { key: 'ceiling-fan', category: 'lighting', label: 'Ceiling Fan', widthIn: 52, depthIn: 52, heightIn: 12, shape: 'light', color: '#a8a29e', elevation: 'ceiling-drop' },
  { key: 'switch', category: 'lighting', label: 'Switch', widthIn: 4, depthIn: 2, heightIn: 5, elevationIn: 46, shape: 'rect', color: '#d4d4d8' },
];

export const PRESETS_BY_KEY = Object.fromEntries(PRESETS.map((p) => [p.key, p]));

export function presetsFor(category) {
  return PRESETS.filter((p) => p.category === category);
}

// Resolves a preset into a concrete placed object at a point.
export function instantiate(preset, xIn, yIn, ceilingHeightIn) {
  let elevationIn = preset.elevationIn || 0;
  if (preset.elevation === 'ceiling') {
    elevationIn = ceilingHeightIn - preset.heightIn;
  } else if (preset.elevation === 'ceiling-drop') {
    elevationIn = ceilingHeightIn - preset.heightIn;
  } else if (preset.fullHeight) {
    elevationIn = 0;
  }
  return {
    category: preset.category,
    type: preset.key,
    label: preset.label,
    cxIn: xIn,
    cyIn: yIn,
    widthIn: preset.widthIn,
    depthIn: preset.depthIn,
    heightIn: preset.fullHeight ? ceilingHeightIn : preset.heightIn,
    elevationIn,
    rotationDeg: 0,
    color: preset.color,
    meta: preset.meta ? structuredClone(preset.meta) : {},
  };
}

export const ROOM_TYPES = [
  { key: 'theater', label: 'Theater', color: '#7f1d1d' },
  { key: 'bar', label: 'Bar / Lounge', color: '#a16207' },
  { key: 'gym', label: 'Gym', color: '#1d4ed8' },
  { key: 'storage', label: 'Storage', color: '#57534e' },
  { key: 'utility', label: 'Utility / Mechanical', color: '#475569' },
  { key: 'bath', label: 'Bathroom', color: '#0e7490' },
  { key: 'bedroom', label: 'Bedroom', color: '#6d28d9' },
  { key: 'office', label: 'Office', color: '#15803d' },
  { key: 'hall', label: 'Hallway / Stairs', color: '#3f3f46' },
  { key: 'other', label: 'Other', color: '#3b82f6' },
];

export const ROOM_TYPES_BY_KEY = Object.fromEntries(ROOM_TYPES.map((t) => [t.key, t]));
