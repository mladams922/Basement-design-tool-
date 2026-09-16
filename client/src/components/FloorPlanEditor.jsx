import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePlanDoc, useViewport, newLocalId } from '../planHooks.js';
import PlanCanvas from './PlanCanvas.jsx';
import Preview3D from './Preview3D.jsx';
import {
  buildGrid,
  floodFill,
  maskToRects,
  labelPoint as computeLabelPoint,
  bbox,
  polygonEdges,
  projectOnSegment,
  snap,
  objectCorners,
  pointInPolygon,
} from '../geometry.js';
import { formatFtIn, formatArea, parseLength } from '../units.js';
import {
  CABLE_TYPES,
  CABLE_TYPES_BY_KEY,
  cableLength,
  cableWarnings,
  cableSummary,
  defaultWaypoints,
} from '../cables.js';
import {
  exportJSON,
  exportCablesCSV,
  exportObjectsCSV,
  exportPlanPNG,
  exportPlanPDF,
} from '../exporters.js';
import {
  CATEGORIES,
  PRESETS_BY_KEY,
  presetsFor,
  instantiate,
  ROOM_TYPES,
  ROOM_TYPES_BY_KEY,
} from '../objectLibrary.js';

const SNAP_OPTIONS = [
  { label: '1"', value: 1 },
  { label: '3"', value: 3 },
  { label: '6"', value: 6 },
  { label: '1 ft', value: 12 },
];

const WALL_TYPES = [
  { label: '2x4 + drywall (4.5")', value: 4.5 },
  { label: '2x6 + drywall (6.5")', value: 6.5 },
  { label: '2x4 framing only (3.5")', value: 3.5 },
  { label: 'Furring / thin (2")', value: 2 },
];

const OPENING_TYPES = [
  { key: 'door', label: 'Door', widthIn: 32, heightIn: 80 },
  { key: 'cased', label: 'Cased opening', widthIn: 60, heightIn: 84 },
  { key: 'window', label: 'Window', widthIn: 36, heightIn: 36, sillIn: 44 },
  { key: 'egress', label: 'Egress window', widthIn: 48, heightIn: 48, sillIn: 36 },
];

const TOOLS = [
  { key: 'select', label: 'Select', hint: 'V' },
  { key: 'shell', label: 'Draw Shell', hint: 'S' },
  { key: 'wall', label: 'Wall', hint: 'W' },
  { key: 'opening', label: 'Door/Window', hint: 'D' },
  { key: 'room', label: 'Room', hint: 'R' },
  { key: 'measure', label: 'Measure', hint: 'M' },
  { key: 'cable', label: 'Cable', hint: 'C' },
];

const GRID_CELL_IN = 3;

export default function FloorPlanEditor() {
  const { designId } = useParams();
  const navigate = useNavigate();
  const { plan, planRef, status, mutate, pushHistory, undo: undoDoc, redo: redoDoc, saveNow } =
    usePlanDoc(designId);
  const { svgRef, wrapRef, view, setView, upp, containerSize, toPlan, handleWheel, fitToPoints } =
    useViewport();

  const [tool, setTool] = useState('select');
  const [selection, setSelection] = useState(null);
  const [draft, setDraft] = useState(null);
  const [snapIn, setSnapIn] = useState(3);
  const [ortho, setOrtho] = useState(true);
  const [show3D, setShow3D] = useState(false);
  const [pendingPreset, setPendingPreset] = useState(null);
  const [openCategory, setOpenCategory] = useState('structure');
  const [wallThickness, setWallThickness] = useState(4.5);
  const [openingType, setOpeningType] = useState('door');
  const [measurement, setMeasurement] = useState(null);
  const [cableType, setCableType] = useState('hdmi');
  const [cableFrom, setCableFrom] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [layers, setLayers] = useState({
    rooms: true,
    labels: true,
    dimensions: true,
    clearances: true,
    cables: true,
    lighting: true,
    av: true,
  });

  const dragRef = useRef(null);
  const draftRef = useRef(null);
  draftRef.current = draft;

  const undo = useCallback(() => {
    undoDoc();
    setSelection(null);
  }, [undoDoc]);

  const redo = useCallback(() => {
    redoDoc();
    setSelection(null);
  }, [redoDoc]);

  const framedRef = useRef(false);
  useEffect(() => {
    if (!plan || framedRef.current || !containerSize.w) return;
    framedRef.current = true;
    fitToPoints(plan.design.shellPoints);
  }, [plan, containerSize.w, fitToPoints]);

  // --- derived geometry ---------------------------------------------------
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

  const snapPoint = useCallback(
    (pt, event) => {
      const step = event && event.altKey ? 0 : snapIn;
      return { xIn: snap(pt.xIn, step), yIn: snap(pt.yIn, step) };
    },
    [snapIn]
  );

  const applyOrtho = useCallback(
    (from, to, event) => {
      const useOrtho = event && event.shiftKey ? !ortho : ortho;
      if (!useOrtho) return to;
      const dx = Math.abs(to.xIn - from.xIn);
      const dy = Math.abs(to.yIn - from.yIn);
      return dx >= dy ? { xIn: to.xIn, yIn: from.yIn } : { xIn: from.xIn, yIn: to.yIn };
    },
    [ortho]
  );

  // --- selection helpers --------------------------------------------------
  const selectedObject =
    selection?.kind === 'object' ? plan?.objects.find((o) => o.id === selection.id) : null;
  const selectedWall =
    selection?.kind === 'wall' ? plan?.walls.find((w) => w.id === selection.id) : null;
  const selectedOpening =
    selection?.kind === 'opening' ? plan?.openings.find((o) => o.id === selection.id) : null;
  const selectedRoom =
    selection?.kind === 'room' ? computedRooms.find((r) => r.id === selection.id) : null;
  const selectedCable =
    selection?.kind === 'cable' ? plan?.cables?.find((c) => c.id === selection.id) : null;

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    pushHistory();
    mutate((prev) => {
      if (selection.kind === 'object') {
        return {
          ...prev,
          objects: prev.objects.filter((o) => o.id !== selection.id),
          cables: (prev.cables || []).filter(
            (c) => c.fromObjectId !== selection.id && c.toObjectId !== selection.id
          ),
        };
      }
      if (selection.kind === 'wall') {
        return {
          ...prev,
          walls: prev.walls.filter((w) => w.id !== selection.id),
          openings: prev.openings.filter(
            (o) => !(o.hostType === 'wall' && o.hostId === selection.id)
          ),
        };
      }
      if (selection.kind === 'opening') {
        return { ...prev, openings: prev.openings.filter((o) => o.id !== selection.id) };
      }
      if (selection.kind === 'room') {
        return { ...prev, rooms: prev.rooms.filter((r) => r.id !== selection.id) };
      }
      if (selection.kind === 'cable') {
        return { ...prev, cables: (prev.cables || []).filter((c) => c.id !== selection.id) };
      }
      return prev;
    });
    setSelection(null);
  }, [selection, mutate, pushHistory]);

  const duplicateSelection = useCallback(() => {
    if (selection?.kind !== 'object' || !selectedObject) return;
    pushHistory();
    const copy = {
      ...selectedObject,
      id: newLocalId(),
      cxIn: selectedObject.cxIn + 12,
      cyIn: selectedObject.cyIn + 12,
      meta: { ...selectedObject.meta },
    };
    mutate((prev) => ({ ...prev, objects: [...prev.objects, copy] }));
    setSelection({ kind: 'object', id: copy.id });
  }, [selection, selectedObject, mutate, pushHistory]);

  // --- pointer interaction ------------------------------------------------
  const handlePointerDown = useCallback(
    (event) => {
      if (!plan) return;
      const raw = toPlan(event);
      const pt = snapPoint(raw, event);
      const target = event.target.closest('[data-kind]');
      const kind = target?.dataset.kind;
      const id = target?.dataset.id ? Number(target.dataset.id) : null;

      // Middle button (or the pan tool) always pans.
      if (event.button === 1 || event.button === 2 || tool === 'pan') {
        dragRef.current = { type: 'pan', startClient: { x: event.clientX, y: event.clientY }, startView: view };
        event.preventDefault();
        return;
      }
      if (event.button !== 0) return;

      // Note: these branches deliberately read the current draft from a ref and
      // call setDraft with a plain value. Putting side effects inside a state
      // updater breaks under StrictMode, which invokes updaters twice.
      if (tool === 'shell') {
        const points = draftRef.current?.points || [];
        const last = points[points.length - 1];
        const next = last ? applyOrtho(last, pt, event) : pt;
        if (points.length >= 3) {
          const first = points[0];
          if (Math.hypot(next.xIn - first.xIn, next.yIn - first.yIn) < 12) {
            pushHistory();
            mutate((prev) => ({ ...prev, design: { ...prev.design, shellPoints: points } }));
            setDraft(null);
            setTool('select');
            return;
          }
        }
        setDraft({ kind: 'shell', points: [...points, next], cursor: next });
        return;
      }

      if (tool === 'wall') {
        const current = draftRef.current;
        if (!current?.start) {
          setDraft({ kind: 'wall', start: pt, cursor: pt, thicknessIn: wallThickness });
          return;
        }
        const end = applyOrtho(current.start, pt, event);
        if (Math.hypot(end.xIn - current.start.xIn, end.yIn - current.start.yIn) < 2) return;
        pushHistory();
        const wall = {
          id: newLocalId(),
          x1In: current.start.xIn,
          y1In: current.start.yIn,
          x2In: end.xIn,
          y2In: end.yIn,
          thicknessIn: wallThickness,
          heightIn: plan.design.defaultCeilingHeightIn,
        };
        mutate((prev) => ({ ...prev, walls: [...prev.walls, wall] }));
        // Chain: the next wall starts where this one ended.
        setDraft({ kind: 'wall', start: end, cursor: end, thicknessIn: wallThickness });
        return;
      }

      if (tool === 'opening') {
        const host = nearestHost(raw, plan);
        if (host) {
          pushHistory();
          const spec = OPENING_TYPES.find((o) => o.key === openingType) || OPENING_TYPES[0];
          const opening = {
            id: newLocalId(),
            hostType: host.hostType,
            hostId: host.hostId,
            offsetIn: Math.max(0, Math.min(host.lengthIn - spec.widthIn, host.offsetIn - spec.widthIn / 2)),
            widthIn: spec.widthIn,
            heightIn: spec.heightIn,
            sillIn: spec.sillIn || 0,
            type: spec.key === 'egress' ? 'window' : spec.key,
            swing: 'left',
          };
          mutate((prev) => ({ ...prev, openings: [...prev.openings, opening] }));
          setSelection({ kind: 'opening', id: opening.id });
        }
        return;
      }

      if (tool === 'room') {
        if (!grid) return;
        const fill = floodFill(grid, raw.xIn, raw.yIn);
        if (!fill) {
          setMeasurement('That spot is inside a wall or outside the basement shell.');
          return;
        }
        const existing = roomAtPoint(raw.xIn, raw.yIn);
        if (existing) {
          setSelection({ kind: 'room', id: existing.id });
          setTool('select');
          return;
        }
        pushHistory();
        const room = {
          id: newLocalId(),
          name: `Room ${plan.rooms.length + 1}`,
          type: 'other',
          seedXIn: raw.xIn,
          seedYIn: raw.yIn,
          ceilingHeightIn: null,
          color: ROOM_TYPES_BY_KEY.other.color,
          notes: '',
        };
        mutate((prev) => ({ ...prev, rooms: [...prev.rooms, room] }));
        setSelection({ kind: 'room', id: room.id });
        setTool('select');
        return;
      }

      if (tool === 'cable') {
        if (kind !== 'object') {
          setCableFrom(null);
          return;
        }
        if (cableFrom == null) {
          setCableFrom(id);
          setSelection({ kind: 'object', id });
          return;
        }
        if (cableFrom === id) {
          setCableFrom(null);
          return;
        }
        const from = plan.objects.find((o) => o.id === cableFrom);
        const to = plan.objects.find((o) => o.id === id);
        if (from && to) {
          pushHistory();
          const cable = {
            id: newLocalId(),
            type: cableType,
            fromObjectId: from.id,
            toObjectId: to.id,
            waypoints: defaultWaypoints(from, to),
            slackPct: 15,
            label: '',
            notes: '',
          };
          mutate((prev) => ({ ...prev, cables: [...(prev.cables || []), cable] }));
          setSelection({ kind: 'cable', id: cable.id });
        }
        setCableFrom(null);
        return;
      }

      if (tool === 'measure') {
        const current = draftRef.current;
        if (!current?.start) {
          setDraft({ kind: 'measure', start: pt, cursor: pt });
          return;
        }
        const dist = Math.hypot(pt.xIn - current.start.xIn, pt.yIn - current.start.yIn);
        setMeasurement(`${formatFtIn(dist, { fractions: true })} (${Math.round(dist)}")`);
        setDraft(null);
        return;
      }

      if (tool === 'object' && pendingPreset) {
        pushHistory();
        const obj = {
          ...instantiate(pendingPreset, pt.xIn, pt.yIn, ceilingAt(pt.xIn, pt.yIn)),
          id: newLocalId(),
          shape: pendingPreset.shape,
        };
        mutate((prev) => ({ ...prev, objects: [...prev.objects, obj] }));
        setSelection({ kind: 'object', id: obj.id });
        return;
      }

      // --- select tool: start a drag on whatever is under the cursor -------
      if (kind === 'object') {
        const obj = plan.objects.find((o) => o.id === id);
        if (!obj) return;
        setSelection({ kind: 'object', id });
        pushHistory();
        dragRef.current = { type: 'moveObject', id, grabOffset: { xIn: raw.xIn - obj.cxIn, yIn: raw.yIn - obj.cyIn } };
      } else if (kind === 'rotate') {
        setSelection({ kind: 'object', id });
        pushHistory();
        dragRef.current = { type: 'rotateObject', id };
      } else if (kind === 'resize') {
        setSelection({ kind: 'object', id });
        pushHistory();
        dragRef.current = { type: 'resizeObject', id };
      } else if (kind === 'wall') {
        setSelection({ kind: 'wall', id });
        pushHistory();
        dragRef.current = { type: 'moveWall', id, last: raw };
      } else if (kind === 'wallEnd') {
        setSelection({ kind: 'wall', id });
        pushHistory();
        dragRef.current = { type: 'moveWallEnd', id, end: target.dataset.end };
      } else if (kind === 'shellVertex') {
        setSelection({ kind: 'shellVertex', id });
        pushHistory();
        dragRef.current = { type: 'moveShellVertex', index: id };
      } else if (kind === 'shellEdge') {
        setSelection({ kind: 'shellEdge', id });
        pushHistory();
        dragRef.current = { type: 'moveShellEdge', index: id, last: raw };
      } else if (kind === 'cable') {
        setSelection({ kind: 'cable', id });
      } else if (kind === 'cableWaypoint') {
        setSelection({ kind: 'cable', id });
        pushHistory();
        dragRef.current = { type: 'moveWaypoint', id, index: Number(target.dataset.index) };
      } else if (kind === 'opening') {
        setSelection({ kind: 'opening', id });
        pushHistory();
        dragRef.current = { type: 'moveOpening', id };
      } else if (kind === 'roomLabel' || kind === 'room') {
        setSelection({ kind: 'room', id });
        if (kind === 'roomLabel') {
          pushHistory();
          dragRef.current = { type: 'moveRoomSeed', id };
        }
      } else {
        setSelection(null);
      }
    },
    [
      plan,
      tool,
      toPlan,
      snapPoint,
      applyOrtho,
      view,
      wallThickness,
      openingType,
      pendingPreset,
      grid,
      roomAtPoint,
      ceilingAt,
      mutate,
      pushHistory,
      cableFrom,
      cableType,
    ]
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (!plan) return;
      const raw = toPlan(event);
      const pt = snapPoint(raw, event);
      const drag = dragRef.current;

      if (!drag) {
        if (draft) {
          setDraft((d) => {
            if (!d) return d;
            if (d.kind === 'shell') {
              const last = d.points[d.points.length - 1];
              return { ...d, cursor: last ? applyOrtho(last, pt, event) : pt };
            }
            if (d.kind === 'wall') return { ...d, cursor: applyOrtho(d.start, pt, event) };
            return { ...d, cursor: pt };
          });
        } else if (tool === 'object' && pendingPreset) {
          setDraft({ kind: 'object', preset: pendingPreset, cursor: pt });
        }
        return;
      }

      if (drag.type === 'pan') {
        const dx = (event.clientX - drag.startClient.x) * upp;
        const dy = (event.clientY - drag.startClient.y) * upp;
        setView({ ...drag.startView, x: drag.startView.x - dx, y: drag.startView.y - dy });
        return;
      }

      if (drag.type === 'moveObject') {
        mutate((prev) => ({
          ...prev,
          objects: prev.objects.map((o) =>
            o.id === drag.id
              ? {
                  ...o,
                  cxIn: snap(raw.xIn - drag.grabOffset.xIn, event.altKey ? 0 : snapIn),
                  cyIn: snap(raw.yIn - drag.grabOffset.yIn, event.altKey ? 0 : snapIn),
                }
              : o
          ),
        }));
        return;
      }

      if (drag.type === 'rotateObject') {
        mutate((prev) => ({
          ...prev,
          objects: prev.objects.map((o) => {
            if (o.id !== drag.id) return o;
            const angle = (Math.atan2(raw.yIn - o.cyIn, raw.xIn - o.cxIn) * 180) / Math.PI + 90;
            const stepped = event.altKey ? angle : Math.round(angle / 15) * 15;
            return { ...o, rotationDeg: ((stepped % 360) + 360) % 360 };
          }),
        }));
        return;
      }

      if (drag.type === 'resizeObject') {
        mutate((prev) => ({
          ...prev,
          objects: prev.objects.map((o) => {
            if (o.id !== drag.id) return o;
            const rad = (-o.rotationDeg * Math.PI) / 180;
            const dx = raw.xIn - o.cxIn;
            const dy = raw.yIn - o.cyIn;
            const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
            const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
            return {
              ...o,
              widthIn: Math.max(2, snap(Math.abs(localX) * 2, event.altKey ? 0 : snapIn)),
              depthIn: Math.max(2, snap(Math.abs(localY) * 2, event.altKey ? 0 : snapIn)),
            };
          }),
        }));
        return;
      }

      if (drag.type === 'moveWall') {
        const dx = raw.xIn - drag.last.xIn;
        const dy = raw.yIn - drag.last.yIn;
        drag.last = raw;
        mutate((prev) => ({
          ...prev,
          walls: prev.walls.map((w) =>
            w.id === drag.id
              ? {
                  ...w,
                  x1In: snap(w.x1In + dx, snapIn),
                  y1In: snap(w.y1In + dy, snapIn),
                  x2In: snap(w.x2In + dx, snapIn),
                  y2In: snap(w.y2In + dy, snapIn),
                }
              : w
          ),
        }));
        return;
      }

      if (drag.type === 'moveWallEnd') {
        mutate((prev) => ({
          ...prev,
          walls: prev.walls.map((w) => {
            if (w.id !== drag.id) return w;
            const anchor =
              drag.end === '1' ? { xIn: w.x2In, yIn: w.y2In } : { xIn: w.x1In, yIn: w.y1In };
            const moved = applyOrtho(anchor, pt, event);
            return drag.end === '1'
              ? { ...w, x1In: moved.xIn, y1In: moved.yIn }
              : { ...w, x2In: moved.xIn, y2In: moved.yIn };
          }),
        }));
        return;
      }

      if (drag.type === 'moveShellVertex') {
        mutate((prev) => ({
          ...prev,
          design: {
            ...prev.design,
            shellPoints: prev.design.shellPoints.map((p, i) =>
              i === drag.index ? { xIn: pt.xIn, yIn: pt.yIn } : p
            ),
          },
        }));
        return;
      }

      if (drag.type === 'moveShellEdge') {
        const dx = raw.xIn - drag.last.xIn;
        const dy = raw.yIn - drag.last.yIn;
        drag.last = raw;
        mutate((prev) => {
          const pts = prev.design.shellPoints;
          const i = drag.index;
          const j = (i + 1) % pts.length;
          const ex = pts[j].xIn - pts[i].xIn;
          const ey = pts[j].yIn - pts[i].yIn;
          const len = Math.hypot(ex, ey) || 1;
          // Only move perpendicular to the edge so the shape stays coherent.
          const nx = -ey / len;
          const ny = ex / len;
          const amount = dx * nx + dy * ny;
          const next = pts.map((p, idx) =>
            idx === i || idx === j
              ? { xIn: snap(p.xIn + nx * amount, snapIn), yIn: snap(p.yIn + ny * amount, snapIn) }
              : p
          );
          return { ...prev, design: { ...prev.design, shellPoints: next } };
        });
        return;
      }

      if (drag.type === 'moveOpening') {
        mutate((prev) => ({
          ...prev,
          openings: prev.openings.map((op) => {
            if (op.id !== drag.id) return op;
            const host = hostSegment(op, prev);
            if (!host) return op;
            const proj = projectOnSegment(raw.xIn, raw.yIn, host.x1, host.y1, host.x2, host.y2);
            const along = proj.t * host.length;
            return {
              ...op,
              offsetIn: Math.max(0, Math.min(host.length - op.widthIn, snap(along - op.widthIn / 2, snapIn))),
            };
          }),
        }));
        return;
      }

      if (drag.type === 'moveWaypoint') {
        mutate((prev) => ({
          ...prev,
          cables: (prev.cables || []).map((c) =>
            c.id === drag.id
              ? {
                  ...c,
                  waypoints: c.waypoints.map((wp, i) => (i === drag.index ? pt : wp)),
                }
              : c
          ),
        }));
        return;
      }

      if (drag.type === 'moveRoomSeed') {
        mutate((prev) => ({
          ...prev,
          rooms: prev.rooms.map((r) =>
            r.id === drag.id ? { ...r, seedXIn: raw.xIn, seedYIn: raw.yIn } : r
          ),
        }));
      }
    },
    [plan, toPlan, snapPoint, applyOrtho, draft, tool, pendingPreset, upp, snapIn, mutate]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const fitView = useCallback(() => {
    if (plan) fitToPoints(plan.design.shellPoints);
  }, [plan, fitToPoints]);

  // --- keyboard -----------------------------------------------------------
  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (e.key === 'Escape') {
        setDraft(null);
        setPendingPreset(null);
        setSelection(null);
        setTool('select');
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (e.key === '[' || e.key === ']') {
        if (selection?.kind !== 'object') return;
        const delta = e.key === '[' ? -15 : 15;
        pushHistory();
        mutate((prev) => ({
          ...prev,
          objects: prev.objects.map((o) =>
            o.id === selection.id
              ? { ...o, rotationDeg: ((o.rotationDeg + delta) % 360 + 360) % 360 }
              : o
          ),
        }));
        return;
      }
      const map = {
        v: 'select', s: 'shell', w: 'wall', d: 'opening', r: 'room', m: 'measure', c: 'cable',
      };
      const next = map[e.key.toLowerCase()];
      if (next) {
        setTool(next);
        setDraft(null);
        setPendingPreset(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteSelection, duplicateSelection, selection, mutate, pushHistory]);

  // --- design-level edits --------------------------------------------------
  const updateDesign = useCallback(
    (patch) => {
      pushHistory();
      mutate((prev) => ({ ...prev, design: { ...prev.design, ...patch } }));
    },
    [mutate, pushHistory]
  );

  const updateObject = useCallback(
    (id, patch) => {
      mutate((prev) => ({
        ...prev,
        objects: prev.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      }));
    },
    [mutate]
  );

  const openTheater = useCallback(
    async (room) => {
      const index = plan.rooms.findIndex((r) => r.id === room.id);
      const saved = await saveNow();
      const target = saved?.rooms?.[index];
      if (target) navigate(`/designs/${designId}/theater/${target.id}`);
    },
    [plan, saveNow, navigate, designId]
  );

  const warnings = useMemo(() => {
    if (!plan) return [];
    const list = [];
    for (const room of computedRooms) {
      if (room.missing) {
        list.push({
          level: 'error',
          text: `"${room.name}" isn't enclosed — its marker sits in a wall or outside the shell. Drag the label into an enclosed space.`,
        });
      }
    }
    for (const obj of plan.objects) {
      const corners = objectCorners(obj);
      const outside = corners.some((c) => !pointInPolygon(c.xIn, c.yIn, plan.design.shellPoints));
      if (outside) {
        list.push({ level: 'warn', text: `${obj.label} extends outside the basement shell.` });
      }
      if (obj.type === 'server-rack' || obj.type === 'av-rack') {
        const theater = computedRooms.find((r) => r.type === 'theater');
        const room = roomAtPoint(obj.cxIn, obj.cyIn);
        if (theater && room && room.id === theater.id) {
          list.push({
            level: 'warn',
            text: `${obj.label} is inside the theater — fan noise will be audible during quiet scenes. Consider an adjacent closet with a vented door.`,
          });
        }
        const ceiling = ceilingAt(obj.cxIn, obj.cyIn);
        if (obj.heightIn > ceiling - 4) {
          list.push({
            level: 'error',
            text: `${obj.label} is ${formatFtIn(obj.heightIn)} tall but the ceiling here is ${formatFtIn(ceiling)}.`,
          });
        }
      }
      if (obj.category === 'gym' && obj.type === 'squat-rack') {
        const ceiling = ceilingAt(obj.cxIn, obj.cyIn);
        if (ceiling < 96) {
          list.push({
            level: 'warn',
            text: `Ceiling at the squat rack is ${formatFtIn(ceiling)} — overhead pressing needs roughly 8 ft or more.`,
          });
        }
      }
    }
    return list;
  }, [plan, computedRooms, roomAtPoint, ceilingAt]);

  if (!plan) return <div className="loading">Loading design…</div>;

  const totalArea = computedRooms.reduce((sum, r) => sum + r.areaSqIn, 0);

  return (
    <div className="editor-page">
      <div className="editor-header">
        <Link to="/" className="back-link">
          &larr; Designs
        </Link>
        <h1>{plan.design.name}</h1>
        <div className="editor-header-meta">
          {computedRooms.length} rooms · {formatArea(totalArea)} finished
        </div>
        <div className="toolbar-right">
          <button className={show3D ? 'active' : ''} onClick={() => setShow3D((s) => !s)}>
            {show3D ? '2D Plan' : '3D View'}
          </button>
          <ExportMenu
            plan={plan}
            computedRooms={computedRooms}
            svgRef={svgRef}
            show3D={show3D}
            onError={setExportError}
          />
          <button onClick={fitView}>Fit</button>
          <button onClick={undo} title="Ctrl+Z">
            Undo
          </button>
          <button onClick={redo} title="Ctrl+Shift+Z">
            Redo
          </button>
          <span className="save-status">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Save failed' : ''}
          </span>
        </div>
      </div>

      <div className="editor-toolbar">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            className={tool === t.key ? 'active' : ''}
            onClick={() => {
              setTool(t.key);
              setDraft(null);
              setPendingPreset(null);
            }}
            title={`Shortcut: ${t.hint}`}
          >
            {t.label}
          </button>
        ))}
        <span className="toolbar-divider" />
        <label className="inline-field">
          Snap
          <select value={snapIn} onChange={(e) => setSnapIn(Number(e.target.value))}>
            {SNAP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={ortho} onChange={(e) => setOrtho(e.target.checked)} />
          Ortho
        </label>
        {tool === 'wall' && (
          <label className="inline-field">
            Wall
            <select value={wallThickness} onChange={(e) => setWallThickness(Number(e.target.value))}>
              {WALL_TYPES.map((w) => (
                <option key={w.label} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {tool === 'opening' && (
          <label className="inline-field">
            Type
            <select value={openingType} onChange={(e) => setOpeningType(e.target.value)}>
              {OPENING_TYPES.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {tool === 'cable' && (
          <label className="inline-field">
            Cable
            <select value={cableType} onChange={(e) => setCableType(e.target.value)}>
              {CABLE_TYPES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {measurement && <span className="measurement">{measurement}</span>}
        {tool === 'shell' && draft?.points?.length >= 3 && (
          <button
            onClick={() => {
              pushHistory();
              mutate((prev) => ({
                ...prev,
                design: { ...prev.design, shellPoints: draft.points },
              }));
              setDraft(null);
              setTool('select');
            }}
          >
            Close Shell
          </button>
        )}
      </div>

      <div className="editor-body editor-body-wide">
        <aside className="palette">
          <h3>Place Objects</h3>
          {CATEGORIES.map((cat) => (
            <div key={cat.key} className="palette-group">
              <button
                className="palette-group-header"
                onClick={() => setOpenCategory(openCategory === cat.key ? null : cat.key)}
              >
                {cat.label}
                <span>{openCategory === cat.key ? '−' : '+'}</span>
              </button>
              {openCategory === cat.key && (
                <div className="palette-items">
                  {presetsFor(cat.key).map((preset) => (
                    <button
                      key={preset.key}
                      className={`palette-btn${pendingPreset?.key === preset.key ? ' active' : ''}`}
                      onClick={() => {
                        setPendingPreset(preset);
                        setTool('object');
                      }}
                      title={preset.note || ''}
                    >
                      <span className="swatch" style={{ background: preset.color }} />
                      <span className="palette-label">{preset.label}</span>
                      <span className="palette-dims">
                        {Math.round(preset.widthIn)}×{Math.round(preset.depthIn)}"
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <h3>Layers</h3>
          {['rooms', 'labels', 'dimensions', 'clearances', 'cables', 'lighting', 'av'].map((key) => (
            <label key={key} className="inline-check">
              <input
                type="checkbox"
                checked={layers[key] !== false}
                onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })}
              />
              {key[0].toUpperCase() + key.slice(1)}
            </label>
          ))}
        </aside>

        <div className="stage-wrap plan-wrap" ref={wrapRef}>
          {show3D ? (
            <Preview3D plan={plan} computedRooms={computedRooms} />
          ) : (
            <PlanCanvas
              plan={plan}
              computedRooms={computedRooms}
              view={view}
              upp={upp}
              selection={selection}
              draft={draft}
              layers={layers}
              svgRef={svgRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
            />
          )}
          {tool !== 'select' && !show3D && (
            <div className="tool-hint">
              {tool === 'shell' && 'Click corners of the outer basement wall. Click the first point (or Close Shell) to finish. Shift = free angle, Alt = no snap.'}
              {tool === 'wall' && 'Click start then end. Walls chain together — press Esc to stop.'}
              {tool === 'opening' && 'Click on a wall to drop a door or window.'}
              {tool === 'room' && 'Click inside an enclosed space to make it a room.'}
              {tool === 'measure' && 'Click two points to measure.'}
              {tool === 'cable' &&
                (cableFrom == null
                  ? 'Click the first device (usually the rack), then the device it feeds.'
                  : 'Now click the device this run goes to. Esc to cancel.')}
              {tool === 'object' && pendingPreset && `Click to place ${pendingPreset.label}. Esc to stop.`}
            </div>
          )}
        </div>

        <aside className="properties">
          <PropertiesPanel
            plan={plan}
            selection={selection}
            selectedObject={selectedObject}
            selectedWall={selectedWall}
            selectedOpening={selectedOpening}
            selectedRoom={selectedRoom}
            selectedCable={selectedCable}
            computedRooms={computedRooms}
            onSelect={setSelection}
            onUpdateObject={updateObject}
            onUpdateDesign={updateDesign}
            onDelete={deleteSelection}
            onDuplicate={duplicateSelection}
            mutate={mutate}
            pushHistory={pushHistory}
            warnings={warnings}
            onOpenTheater={openTheater}
          />
        </aside>
      </div>
    </div>
  );
}

function ExportMenu({ plan, computedRooms, svgRef, show3D, onError }) {
  const [open, setOpen] = useState(false);

  async function run(action) {
    setOpen(false);
    try {
      await action();
      onError(null);
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <div className="export-menu">
      <button onClick={() => setOpen((o) => !o)}>Export</button>
      {open && (
        <div className="export-dropdown">
          <button
            disabled={show3D}
            onClick={() => run(() => exportPlanPNG(svgRef.current, plan.design.name))}
          >
            Plan as PNG
          </button>
          <button
            disabled={show3D}
            onClick={() => run(() => exportPlanPDF(svgRef.current, plan, computedRooms))}
          >
            Printable plan (PDF)
          </button>
          <button onClick={() => run(() => exportObjectsCSV(plan, computedRooms))}>
            Objects as CSV
          </button>
          <button
            onClick={() =>
              run(() => exportCablesCSV(plan, plan.design.defaultCeilingHeightIn))
            }
          >
            Cable runs as CSV
          </button>
          <button onClick={() => run(() => exportJSON(plan))}>Backup as JSON</button>
          {show3D && <p className="calc-note">Switch to the 2D plan to export an image.</p>}
        </div>
      )}
    </div>
  );
}

// Finds the wall or shell edge nearest a point, for placing openings.
function nearestHost(pt, plan) {
  let best = null;
  const consider = (hostType, hostId, x1, y1, x2, y2) => {
    const proj = projectOnSegment(pt.xIn, pt.yIn, x1, y1, x2, y2);
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (!best || proj.distance < best.distance) {
      best = { hostType, hostId, distance: proj.distance, offsetIn: proj.t * length, lengthIn: length };
    }
  };
  polygonEdges(plan.design.shellPoints).forEach((e) =>
    consider('shell', e.index, e.x1In, e.y1In, e.x2In, e.y2In)
  );
  plan.walls.forEach((w) => consider('wall', w.id, w.x1In, w.y1In, w.x2In, w.y2In));
  return best && best.distance < 24 ? best : null;
}

function hostSegment(opening, plan) {
  if (opening.hostType === 'shell') {
    const edge = polygonEdges(plan.design.shellPoints)[opening.hostId];
    if (!edge) return null;
    return {
      x1: edge.x1In,
      y1: edge.y1In,
      x2: edge.x2In,
      y2: edge.y2In,
      length: edge.lengthIn,
    };
  }
  const wall = plan.walls.find((w) => w.id === opening.hostId);
  if (!wall) return null;
  return {
    x1: wall.x1In,
    y1: wall.y1In,
    x2: wall.x2In,
    y2: wall.y2In,
    length: Math.hypot(wall.x2In - wall.x1In, wall.y2In - wall.y1In),
  };
}

function LengthField({ label, valueIn, onCommit, defaultUnit = 'in' }) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const display = editing ? text : formatFtIn(valueIn, { fractions: true });
  return (
    <label>
      {label}
      <input
        value={display}
        onFocus={(e) => {
          setEditing(true);
          setText(String(Math.round(valueIn * 100) / 100));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const parsed = parseLength(text, defaultUnit);
          if (parsed != null) onCommit(parsed);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.target.blur();
        }}
      />
    </label>
  );
}

function PropertiesPanel({
  plan,
  selection,
  selectedObject,
  selectedWall,
  selectedOpening,
  selectedRoom,
  selectedCable,
  computedRooms,
  onSelect,
  onUpdateObject,
  onUpdateDesign,
  onDelete,
  onDuplicate,
  mutate,
  pushHistory,
  warnings,
  onOpenTheater,
}) {
  if (selectedObject) {
    const preset = PRESETS_BY_KEY[selectedObject.type];
    const isRack = selectedObject.type === 'server-rack' || selectedObject.type === 'av-rack';
    return (
      <div className="props-form">
        <h3>{preset?.label || 'Object'}</h3>
        <label>
          Label
          <input
            value={selectedObject.label}
            onChange={(e) => onUpdateObject(selectedObject.id, { label: e.target.value })}
          />
        </label>
        <div className="dims-row">
          <LengthField
            label="Width"
            valueIn={selectedObject.widthIn}
            onCommit={(v) => onUpdateObject(selectedObject.id, { widthIn: v })}
          />
          <LengthField
            label="Depth"
            valueIn={selectedObject.depthIn}
            onCommit={(v) => onUpdateObject(selectedObject.id, { depthIn: v })}
          />
        </div>
        <div className="dims-row">
          <LengthField
            label="Height"
            valueIn={selectedObject.heightIn}
            onCommit={(v) => onUpdateObject(selectedObject.id, { heightIn: v })}
          />
          <LengthField
            label="Off floor"
            valueIn={selectedObject.elevationIn}
            onCommit={(v) => onUpdateObject(selectedObject.id, { elevationIn: v })}
          />
        </div>
        <label>
          Rotation: {Math.round(selectedObject.rotationDeg)}°
          <input
            type="range"
            min="0"
            max="359"
            value={selectedObject.rotationDeg}
            onChange={(e) => onUpdateObject(selectedObject.id, { rotationDeg: Number(e.target.value) })}
          />
        </label>
        {isRack && (
          <>
            <h4>Rack</h4>
            <div className="dims-row">
              <label>
                Rack U
                <input
                  type="number"
                  value={selectedObject.meta?.rackU || 42}
                  onChange={(e) =>
                    onUpdateObject(selectedObject.id, {
                      meta: { ...selectedObject.meta, rackU: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Watts
                <input
                  type="number"
                  value={selectedObject.meta?.watts || 0}
                  onChange={(e) =>
                    onUpdateObject(selectedObject.id, {
                      meta: { ...selectedObject.meta, watts: Number(e.target.value) },
                    })
                  }
                />
              </label>
            </div>
            <div className="dims-row">
              <LengthField
                label="Front clearance"
                valueIn={selectedObject.meta?.frontClearanceIn || 0}
                onCommit={(v) =>
                  onUpdateObject(selectedObject.id, {
                    meta: { ...selectedObject.meta, frontClearanceIn: v },
                  })
                }
              />
              <LengthField
                label="Rear clearance"
                valueIn={selectedObject.meta?.rearClearanceIn || 0}
                onCommit={(v) =>
                  onUpdateObject(selectedObject.id, {
                    meta: { ...selectedObject.meta, rearClearanceIn: v },
                  })
                }
              />
            </div>
            {selectedObject.meta?.watts > 0 && (
              <p className="calc-note">
                ≈ {Math.round(selectedObject.meta.watts * 3.412)} BTU/hr of heat. Plan ventilation
                or cooling if it's in an enclosed closet.
              </p>
            )}
          </>
        )}
        <label>
          Color
          <input
            type="color"
            value={selectedObject.color}
            onChange={(e) => onUpdateObject(selectedObject.id, { color: e.target.value })}
          />
        </label>
        <div className="button-row">
          <button onClick={onDuplicate}>Duplicate</button>
          <button className="danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  if (selectedWall) {
    const length = Math.hypot(
      selectedWall.x2In - selectedWall.x1In,
      selectedWall.y2In - selectedWall.y1In
    );
    return (
      <div className="props-form">
        <h3>Wall</h3>
        <div className="readout">Length: {formatFtIn(length, { fractions: true })}</div>
        <LengthField
          label="Thickness"
          valueIn={selectedWall.thicknessIn}
          onCommit={(v) =>
            mutate((prev) => ({
              ...prev,
              walls: prev.walls.map((w) => (w.id === selectedWall.id ? { ...w, thicknessIn: v } : w)),
            }))
          }
        />
        <LengthField
          label="Height"
          valueIn={selectedWall.heightIn}
          onCommit={(v) =>
            mutate((prev) => ({
              ...prev,
              walls: prev.walls.map((w) => (w.id === selectedWall.id ? { ...w, heightIn: v } : w)),
            }))
          }
        />
        <p className="calc-note">
          Drag the yellow endpoints to reshape, or drag the wall body to move it.
        </p>
        <button className="danger" onClick={onDelete}>
          Delete Wall
        </button>
      </div>
    );
  }

  if (selectedOpening) {
    return (
      <div className="props-form">
        <h3>Opening</h3>
        <label>
          Type
          <select
            value={selectedOpening.type}
            onChange={(e) =>
              mutate((prev) => ({
                ...prev,
                openings: prev.openings.map((o) =>
                  o.id === selectedOpening.id ? { ...o, type: e.target.value } : o
                ),
              }))
            }
          >
            <option value="door">Door</option>
            <option value="cased">Cased opening</option>
            <option value="window">Window</option>
          </select>
        </label>
        <div className="dims-row">
          <LengthField
            label="Width"
            valueIn={selectedOpening.widthIn}
            onCommit={(v) =>
              mutate((prev) => ({
                ...prev,
                openings: prev.openings.map((o) =>
                  o.id === selectedOpening.id ? { ...o, widthIn: v } : o
                ),
              }))
            }
          />
          <LengthField
            label="Height"
            valueIn={selectedOpening.heightIn}
            onCommit={(v) =>
              mutate((prev) => ({
                ...prev,
                openings: prev.openings.map((o) =>
                  o.id === selectedOpening.id ? { ...o, heightIn: v } : o
                ),
              }))
            }
          />
        </div>
        <LengthField
          label="Sill height"
          valueIn={selectedOpening.sillIn}
          onCommit={(v) =>
            mutate((prev) => ({
              ...prev,
              openings: prev.openings.map((o) =>
                o.id === selectedOpening.id ? { ...o, sillIn: v } : o
              ),
            }))
          }
        />
        <button className="danger" onClick={onDelete}>
          Delete Opening
        </button>
      </div>
    );
  }

  if (selectedCable) {
    const length = cableLength(selectedCable, plan.objects, plan.design.defaultCeilingHeightIn);
    const from = plan.objects.find((o) => o.id === selectedCable.fromObjectId);
    const to = plan.objects.find((o) => o.id === selectedCable.toObjectId);
    const warnings = cableWarnings(selectedCable, length?.totalFt);
    return (
      <div className="props-form">
        <h3>Cable Run</h3>
        <div className="readout">
          {from?.label} → {to?.label}
          {length && (
            <>
              <br />
              {length.totalFt.toFixed(1)} ft total ({formatFtIn(length.horizontalIn)} across,{' '}
              {formatFtIn(length.verticalIn)} up and down, +{selectedCable.slackPct ?? 15}% slack)
            </>
          )}
        </div>
        <label>
          Type
          <select
            value={selectedCable.type}
            onChange={(e) =>
              mutate((prev) => ({
                ...prev,
                cables: prev.cables.map((c) =>
                  c.id === selectedCable.id ? { ...c, type: e.target.value } : c
                ),
              }))
            }
          >
            {CABLE_TYPES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Slack %
          <input
            type="number"
            value={selectedCable.slackPct ?? 15}
            onChange={(e) =>
              mutate((prev) => ({
                ...prev,
                cables: prev.cables.map((c) =>
                  c.id === selectedCable.id ? { ...c, slackPct: Number(e.target.value) } : c
                ),
              }))
            }
          />
        </label>
        <label>
          Label
          <input
            value={selectedCable.label || ''}
            onChange={(e) =>
              mutate((prev) => ({
                ...prev,
                cables: prev.cables.map((c) =>
                  c.id === selectedCable.id ? { ...c, label: e.target.value } : c
                ),
              }))
            }
          />
        </label>
        {warnings.map((w, i) => (
          <div key={i} className={`verdict ${w.level}`}>
            {w.text}
          </div>
        ))}
        <p className="calc-note">
          Length assumes the run goes up to the ceiling, across, and back down. Drag the yellow
          waypoint to route it around obstacles.
        </p>
        <button className="danger" onClick={onDelete}>
          Delete Run
        </button>
      </div>
    );
  }

  if (selectedRoom) {
    return (
      <div className="props-form">
        <h3>Room</h3>
        <label>
          Name
          <input
            value={selectedRoom.name}
            onChange={(e) =>
              mutate((prev) => ({
                ...prev,
                rooms: prev.rooms.map((r) =>
                  r.id === selectedRoom.id ? { ...r, name: e.target.value } : r
                ),
              }))
            }
          />
        </label>
        <label>
          Purpose
          <select
            value={selectedRoom.type}
            onChange={(e) => {
              const type = e.target.value;
              mutate((prev) => ({
                ...prev,
                rooms: prev.rooms.map((r) =>
                  r.id === selectedRoom.id
                    ? { ...r, type, color: ROOM_TYPES_BY_KEY[type]?.color || r.color }
                    : r
                ),
              }));
            }}
          >
            {ROOM_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="readout">
          {selectedRoom.missing ? 'Not enclosed' : formatArea(selectedRoom.areaSqIn)}
        </div>
        <LengthField
          label={`Ceiling height (default ${formatFtIn(plan.design.defaultCeilingHeightIn)})`}
          valueIn={selectedRoom.ceilingHeightIn || plan.design.defaultCeilingHeightIn}
          onCommit={(v) =>
            mutate((prev) => ({
              ...prev,
              rooms: prev.rooms.map((r) =>
                r.id === selectedRoom.id ? { ...r, ceilingHeightIn: v } : r
              ),
            }))
          }
        />
        <label>
          Notes
          <textarea
            value={selectedRoom.notes || ''}
            onChange={(e) =>
              mutate((prev) => ({
                ...prev,
                rooms: prev.rooms.map((r) =>
                  r.id === selectedRoom.id ? { ...r, notes: e.target.value } : r
                ),
              }))
            }
          />
        </label>
        {selectedRoom.type === 'theater' && !selectedRoom.missing && (
          <button className="link-button" onClick={() => onOpenTheater(selectedRoom)}>
            Open Theater Designer →
          </button>
        )}
        <button className="danger" onClick={onDelete}>
          Delete Room
        </button>
      </div>
    );
  }

  return (
    <div className="props-form">
      <h3>Basement</h3>
      <LengthField
        label="Exterior wall thickness"
        valueIn={plan.design.extWallThicknessIn}
        onCommit={(v) => onUpdateDesign({ extWallThicknessIn: v })}
      />
      <LengthField
        label="Default ceiling height"
        valueIn={plan.design.defaultCeilingHeightIn}
        onCommit={(v) => onUpdateDesign({ defaultCeilingHeightIn: v })}
      />

      <h3>Rooms</h3>
      {computedRooms.length === 0 && (
        <p className="muted">
          Draw walls, then use the Room tool and click inside an enclosed space to name it.
        </p>
      )}
      <ul className="room-list">
        {computedRooms.map((room) => (
          <li key={room.id}>
            <button onClick={() => onSelect({ kind: 'room', id: room.id })}>
              <span className="swatch" style={{ background: room.color }} />
              <span className="palette-label">{room.name}</span>
              <span className="palette-dims">
                {room.missing ? '—' : formatArea(room.areaSqIn)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {(plan.cables || []).length > 0 && (
        <>
          <h3>Cable Runs</h3>
          <ul className="room-list">
            {cableSummary(plan.cables, plan.objects, plan.design.defaultCeilingHeightIn).map(
              (group) => (
                <li key={group.type}>
                  <button>
                    <span
                      className="swatch"
                      style={{ background: CABLE_TYPES_BY_KEY[group.type]?.color }}
                    />
                    <span className="palette-label">{group.label}</span>
                    <span className="palette-dims">
                      {group.runs} run{group.runs === 1 ? '' : 's'} · {Math.ceil(group.totalFt)} ft
                    </span>
                  </button>
                </li>
              )
            )}
          </ul>
        </>
      )}

      {warnings.length > 0 && (
        <>
          <h3>Checks</h3>
          <ul className="warning-list">
            {warnings.map((w, i) => (
              <li key={i} className={w.level}>
                {w.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
