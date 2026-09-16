import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import {
  bbox,
  buildGrid,
  floodFill,
  maskToRects,
  labelPoint as computeLabelPoint,
} from './geometry.js';
import { ROOM_TYPES_BY_KEY } from './objectLibrary.js';

const GRID_CELL_IN = 3;

// Rooms are stored as a seed point; their extent is derived by flood-filling
// the walls, so moving a wall reshapes the room automatically.
export function useComputedRooms(plan) {
  const { computedRooms, grid } = useMemo(() => {
    if (!plan) return { computedRooms: [], grid: null };
    const g = buildGrid(plan.design.shellPoints, plan.walls, GRID_CELL_IN);
    const rooms = plan.rooms.map((room) => {
      const fill = floodFill(g, room.seedXIn, room.seedYIn);
      const color = room.color || ROOM_TYPES_BY_KEY[room.type]?.color || '#3b82f6';
      if (!fill) {
        return {
          ...room,
          color,
          rects: [],
          areaSqIn: 0,
          labelPoint: { xIn: room.seedXIn, yIn: room.seedYIn },
          missing: true,
          mask: null,
        };
      }
      return {
        ...room,
        color,
        rects: maskToRects(g, fill.mask),
        areaSqIn: fill.areaSqIn,
        labelPoint: computeLabelPoint(g, fill.mask, fill.centroid),
        missing: false,
        mask: fill.mask,
      };
    });
    return { computedRooms: rooms, grid: g };
  }, [plan]);

  const roomAtPoint = useCallback(
    (xIn, yIn) => {
      if (!grid) return null;
      const gx = Math.floor((xIn - grid.originX) / grid.cellIn);
      const gy = Math.floor((yIn - grid.originY) / grid.cellIn);
      if (gx < 0 || gy < 0 || gx >= grid.w || gy >= grid.h) return null;
      const idx = gy * grid.w + gx;
      return computedRooms.find((r) => r.mask && r.mask[idx]) || null;
    },
    [grid, computedRooms]
  );

  const ceilingAt = useCallback(
    (xIn, yIn) => {
      const room = roomAtPoint(xIn, yIn);
      return room?.ceilingHeightIn || plan?.design.defaultCeilingHeightIn || 92;
    },
    [roomAtPoint, plan]
  );

  return { computedRooms, grid, roomAtPoint, ceilingAt };
}

// Bounding box of a room's filled cells, which is what theater layout math
// treats as the usable rectangle.
export function roomBox(room) {
  if (!room?.rects?.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of room.rects) {
    minX = Math.min(minX, r.xIn);
    minY = Math.min(minY, r.yIn);
    maxX = Math.max(maxX, r.xIn + r.widthIn);
    maxY = Math.max(maxY, r.yIn + r.heightIn);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function clonePlan(plan) {
  return {
    design: { ...plan.design, shellPoints: plan.design.shellPoints.map((p) => ({ ...p })) },
    walls: plan.walls.map((w) => ({ ...w })),
    openings: plan.openings.map((o) => ({ ...o })),
    rooms: plan.rooms.map((r) => ({ ...r, theater: r.theater ? { ...r.theater } : undefined })),
    objects: plan.objects.map((o) => ({ ...o, meta: { ...o.meta } })),
  };
}

let localIdCounter = -1;
export const newLocalId = () => localIdCounter--;

// Loads a design's plan, autosaves edits, and keeps an undo stack.
export function usePlanDoc(designId) {
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState('idle');
  const planRef = useRef(null);
  const dirtyRef = useRef(false);
  const historyRef = useRef({ past: [], future: [] });
  planRef.current = plan;

  useEffect(() => {
    let cancelled = false;
    api.getPlan(designId).then((data) => {
      if (!cancelled) setPlan(data);
    });
    return () => {
      cancelled = true;
    };
  }, [designId]);

  const save = useCallback(
    async (current) => {
      setStatus('saving');
      try {
        const saved = await api.savePlan(designId, current);
        setPlan(saved);
        setStatus('saved');
      } catch (e) {
        setStatus('error');
      }
    },
    [designId]
  );

  useEffect(() => {
    if (!dirtyRef.current || !plan) return undefined;
    const t = setTimeout(() => {
      dirtyRef.current = false;
      save(plan);
    }, 1200);
    return () => clearTimeout(t);
  }, [plan, save]);

  // Autosave is debounced, so a tab closed right after an edit would otherwise
  // drop it. keepalive lets the request outlive the page.
  useEffect(() => {
    function flush() {
      if (!dirtyRef.current || !planRef.current) return;
      dirtyRef.current = false;
      fetch(`/api/designs/${designId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        keepalive: true,
        body: JSON.stringify(planRef.current),
      }).catch(() => {});
    }
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [designId]);

  const mutate = useCallback((updater) => {
    dirtyRef.current = true;
    setStatus('editing');
    setPlan((prev) => (prev ? updater(prev) : prev));
  }, []);

  // Forces an immediate save and hands back the server's version, which is the
  // only place new records get their real ids.
  const saveNow = useCallback(async () => {
    const current = planRef.current;
    if (!current) return null;
    dirtyRef.current = false;
    setStatus('saving');
    try {
      const saved = await api.savePlan(designId, current);
      setPlan(saved);
      setStatus('saved');
      return saved;
    } catch (e) {
      setStatus('error');
      return null;
    }
  }, [designId]);

  const pushHistory = useCallback(() => {
    if (!planRef.current) return;
    const h = historyRef.current;
    h.past.push(clonePlan(planRef.current));
    if (h.past.length > 60) h.past.shift();
    h.future = [];
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (!h.past.length || !planRef.current) return;
    h.future.push(clonePlan(planRef.current));
    dirtyRef.current = true;
    setPlan(h.past.pop());
  }, []);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length || !planRef.current) return;
    h.past.push(clonePlan(planRef.current));
    dirtyRef.current = true;
    setPlan(h.future.pop());
  }, []);

  return { plan, setPlan, planRef, status, mutate, pushHistory, undo, redo, saveNow };
}

// Pan/zoom state for an SVG drawn in plan inches.
export function useViewport() {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [view, setView] = useState({ x: -60, y: -60, w: 600, h: 400 });
  // Starts at zero so callers can tell "not measured yet" from a real size and
  // avoid framing the view against a guessed aspect ratio.
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Lock the viewBox aspect ratio to the container so nothing distorts.
  useEffect(() => {
    if (!containerSize.w || !containerSize.h) return;
    setView((v) => {
      const target = (v.w * containerSize.h) / containerSize.w;
      if (Math.abs(target - v.h) < 0.5) return v;
      return { ...v, h: target };
    });
  }, [containerSize.w, containerSize.h]);

  const upp = containerSize.w ? view.w / containerSize.w : 1;

  const toPlan = useCallback((event) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return { xIn: 0, yIn: 0 };
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { xIn: p.x, yIn: p.y };
  }, []);

  const handleWheel = useCallback(
    (event) => {
      event.preventDefault();
      const pt = toPlan(event);
      const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
      setView((v) => {
        const w = Math.min(4000, Math.max(24, v.w * factor));
        const scale = w / v.w;
        return {
          x: pt.xIn - (pt.xIn - v.x) * scale,
          y: pt.yIn - (pt.yIn - v.y) * scale,
          w,
          h: v.h * scale,
        };
      });
    },
    [toPlan]
  );

  const sizeRef = useRef(containerSize);
  sizeRef.current = containerSize;

  // Frames a set of points, fitting whichever axis is the tighter constraint
  // for the container's current aspect ratio.
  const fitToPoints = useCallback((points, paddingRatio = 0.08) => {
    if (!points?.length) return;
    const box = bbox(points);
    const pad = Math.max(24, Math.max(box.width, box.height) * paddingRatio);
    const contentW = box.width + pad * 2;
    const contentH = box.height + pad * 2;
    const { w: cw, h: ch } = sizeRef.current;
    const aspect = cw && ch ? cw / ch : 1.5;

    // Widen the viewBox if the content is taller than the container allows.
    const w = Math.max(contentW, contentH * aspect);
    const h = w / aspect;
    setView({
      x: box.minX - pad - (w - contentW) / 2,
      y: box.minY - pad - (h - contentH) / 2,
      w,
      h,
    });
  }, []);

  return { svgRef, wrapRef, view, setView, upp, containerSize, toPlan, handleWheel, fitToPoints };
}
