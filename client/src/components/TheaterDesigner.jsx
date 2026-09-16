import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import PlanCanvas from './PlanCanvas.jsx';
import { usePlanDoc, useViewport, useComputedRooms, roomBox, newLocalId } from '../planHooks.js';
import { snap } from '../geometry.js';
import { formatFtIn, formatArea, parseLength } from '../units.js';
import {
  CHANNELS,
  CHANNELS_BY_KEY,
  FORMATS,
  autoLayout,
  screenWallVectors,
  measureFromMlp,
  validateSpeakers,
  screenDimensions,
  horizontalViewingAngle,
  pixelsPerDegree,
  viewingVerdict,
  detailVerdict,
  projectorAnalysis,
  analyzeRows,
  requiredRiserHeight,
  sbirNotchHz,
} from '../theater.js';

const PROJECTOR_PRESETS = [
  { label: 'Custom', throwMin: 1.35, throwMax: 2.84, lumens: 2400, pixels: 3840, shift: 60 },
  { label: 'Epson LS12000 (4K)', throwMin: 1.35, throwMax: 2.84, lumens: 2700, pixels: 3840, shift: 96 },
  { label: 'Epson 3800 / 3200', throwMin: 1.32, throwMax: 2.15, lumens: 3000, pixels: 3840, shift: 60 },
  { label: 'BenQ HT4550i', throwMin: 1.36, throwMax: 2.13, lumens: 3200, pixels: 3840, shift: 60 },
  { label: 'JVC NZ7 / NZ500', throwMin: 1.38, throwMax: 2.83, lumens: 2200, pixels: 3840, shift: 80 },
  { label: 'Sony XW5000ES', throwMin: 1.38, throwMax: 2.21, lumens: 2000, pixels: 3840, shift: 71 },
  { label: 'Short throw (UST)', throwMin: 0.25, throwMax: 0.25, lumens: 2800, pixels: 3840, shift: 0 },
];

const ASPECTS = [
  { label: '16:9', value: 16 / 9 },
  { label: '2.35:1 (Scope)', value: 2.35 },
  { label: '2.40:1', value: 2.4 },
  { label: '4:3', value: 4 / 3 },
];

const SCREEN_WALLS = [
  { key: 'north', label: 'Top of plan' },
  { key: 'south', label: 'Bottom of plan' },
  { key: 'west', label: 'Left of plan' },
  { key: 'east', label: 'Right of plan' },
];

function defaultTheater(box) {
  const depth = box ? box.height : 240;
  return {
    screenWall: 'north',
    format: '5.1.4',
    earHeightIn: 42,
    surroundHeightIn: 70,
    screen: {
      widthIn: 110,
      aspect: 16 / 9,
      bottomIn: 26,
      gain: 1.1,
      acousticallyTransparent: false,
    },
    projector: {
      preset: 'Epson LS12000 (4K)',
      throwMin: 1.35,
      throwMax: 2.84,
      lumens: 2700,
      lumensMode: 0.7,
      pixels: 3840,
      mountDistanceIn: Math.round(depth * 0.75),
      mountHeightIn: 88,
      lensShiftMaxPct: 96,
    },
    rows: [
      { id: 1, label: 'Row 1', distanceIn: Math.round(depth * 0.55), seats: 3, spacingIn: 32, riserHeightIn: 0 },
    ],
    referenceRowId: 1,
  };
}

// The room's front/centre axis, derived from which wall the screen is on.
function theaterAxes(box, screenWall) {
  const { front, right } = screenWallVectors(screenWall);
  const centerX = (box.minX + box.maxX) / 2;
  const centerY = (box.minY + box.maxY) / 2;

  let screenPlane;
  let depthIn;
  if (screenWall === 'north') {
    screenPlane = { xIn: centerX, yIn: box.minY };
    depthIn = box.height;
  } else if (screenWall === 'south') {
    screenPlane = { xIn: centerX, yIn: box.maxY };
    depthIn = box.height;
  } else if (screenWall === 'west') {
    screenPlane = { xIn: box.minX, yIn: centerY };
    depthIn = box.width;
  } else {
    screenPlane = { xIn: box.maxX, yIn: centerY };
    depthIn = box.width;
  }

  // Walking "back" from the screen is the opposite of facing it.
  const back = { x: -front.x, y: -front.y };
  const widthIn = screenWall === 'north' || screenWall === 'south' ? box.width : box.height;
  return { front, right, back, screenPlane, depthIn, widthIn };
}

function pointAt(axes, distanceFromScreenIn, lateralIn = 0) {
  return {
    xIn: axes.screenPlane.xIn + axes.back.x * distanceFromScreenIn + axes.right.x * lateralIn,
    yIn: axes.screenPlane.yIn + axes.back.y * distanceFromScreenIn + axes.right.y * lateralIn,
  };
}

export default function TheaterDesigner() {
  const { designId, roomId } = useParams();
  const { plan, status, mutate, pushHistory, undo } = usePlanDoc(designId);
  const { svgRef, wrapRef, view, setView, upp, containerSize, toPlan, handleWheel, fitToPoints } =
    useViewport();
  const { computedRooms } = useComputedRooms(plan);
  const [selection, setSelection] = useState(null);
  const [showOverlays, setShowOverlays] = useState(true);
  const [addChannel, setAddChannel] = useState('L');
  const dragRef = useRef(null);
  const framedRef = useRef(false);

  const room = computedRooms.find((r) => r.id === Number(roomId));
  const box = room ? roomBox(room) : null;
  const theater = room?.theater || (box ? defaultTheater(box) : null);

  useEffect(() => {
    if (!box || framedRef.current || !containerSize.w) return;
    framedRef.current = true;
    fitToPoints(
      [
        { xIn: box.minX, yIn: box.minY },
        { xIn: box.maxX, yIn: box.maxY },
      ],
      0.18
    );
  }, [box, containerSize.w, fitToPoints]);

  const updateTheater = useCallback(
    (patch, { history = true } = {}) => {
      if (history) pushHistory();
      mutate((prev) => ({
        ...prev,
        rooms: prev.rooms.map((r) =>
          r.id === Number(roomId)
            ? { ...r, theater: { ...(r.theater || defaultTheater(box)), ...patch } }
            : r
        ),
      }));
    },
    [mutate, pushHistory, roomId, box]
  );

  const axes = box && theater ? theaterAxes(box, theater.screenWall) : null;
  const screen = theater ? screenDimensions({ widthIn: theater.screen.widthIn, aspect: theater.screen.aspect }) : null;
  const ceilingHeightIn = room?.ceilingHeightIn || plan?.design.defaultCeilingHeightIn || 92;

  const referenceRow =
    theater?.rows.find((r) => r.id === theater.referenceRowId) || theater?.rows[0] || null;
  const mlp = axes && referenceRow ? pointAt(axes, referenceRow.distanceIn) : null;

  // Speakers are ordinary placed objects tagged with a channel, so they show up
  // on the floor plan and in 3D too.
  const speakers = useMemo(() => {
    if (!plan) return [];
    return plan.objects
      .filter((o) => o.meta?.channel && o.meta?.roomId === Number(roomId))
      .map((o) => ({
        id: o.id,
        channel: o.meta.channel,
        xIn: o.cxIn,
        yIn: o.cyIn,
        zIn: o.elevationIn + o.heightIn / 2,
      }));
  }, [plan, roomId]);

  const validated = useMemo(() => {
    if (!mlp || !theater) return [];
    return validateSpeakers({
      speakers,
      mlp,
      screenWall: theater.screenWall,
      earHeightIn: theater.earHeightIn,
    });
  }, [speakers, mlp, theater]);

  const validatedByChannel = useMemo(
    () => Object.fromEntries(validated.map((v) => [v.channel, v])),
    [validated]
  );

  const rowAnalysis = useMemo(() => {
    if (!theater || !screen) return [];
    return analyzeRows({
      rows: theater.rows,
      screenBottomIn: theater.screen.bottomIn,
      screenWidthIn: screen.widthIn,
      seatedEyeHeightIn: theater.earHeightIn,
    });
  }, [theater, screen]);

  const projector = useMemo(() => {
    if (!theater || !screen) return null;
    return projectorAnalysis({
      throwRatioMin: theater.projector.throwMin,
      throwRatioMax: theater.projector.throwMax,
      lumens: theater.projector.lumens,
      lumensMode: theater.projector.lumensMode,
      horizontalPixels: theater.projector.pixels,
      screenWidthIn: screen.widthIn,
      screenHeightIn: screen.heightIn,
      screenGain: theater.screen.gain,
      mountDistanceIn: theater.projector.mountDistanceIn,
      mountHeightIn: theater.projector.mountHeightIn,
      screenBottomIn: theater.screen.bottomIn,
      lensShiftMaxPct: theater.projector.lensShiftMaxPct,
      seats: rowAnalysis.map((r) => ({
        label: r.label,
        distanceIn: r.distanceIn,
        headHeightIn: r.eyeHeightIn + 4,
      })),
    });
  }, [theater, screen, rowAnalysis]);

  // --- generated objects ---------------------------------------------------
  const replaceGenerated = useCallback(
    (kind, makeObjects) => {
      pushHistory();
      mutate((prev) => {
        const kept = prev.objects.filter(
          (o) => !(o.meta?.gen === kind && o.meta?.roomId === Number(roomId))
        );
        return { ...prev, objects: [...kept, ...makeObjects()] };
      });
    },
    [mutate, pushHistory, roomId]
  );

  const placeSpeakers = useCallback(() => {
    if (!axes || !mlp || !theater || !box) return;
    const radiusIn = Math.max(
      48,
      Math.min(referenceRow.distanceIn - 12, Math.min(box.width, box.height) / 2 - 12)
    );
    const layout = autoLayout({
      format: theater.format,
      mlp,
      screenWall: theater.screenWall,
      radiusIn,
      earHeightIn: theater.earHeightIn,
      ceilingHeightIn,
      surroundHeightIn: theater.surroundHeightIn,
      roomBox: box,
    });

    replaceGenerated('speaker', () =>
      layout.map((p) => {
        const spec = CHANNELS_BY_KEY[p.channel];
        const isSub = spec.group === 'sub';
        const isOverhead = spec.group === 'overhead';
        const size = isSub
          ? { widthIn: 18, depthIn: 18, heightIn: 20 }
          : isOverhead
            ? { widthIn: 9, depthIn: 9, heightIn: 4 }
            : { widthIn: 10, depthIn: 12, heightIn: 16 };
        return {
          id: newLocalId(),
          category: 'av',
          type: isSub ? 'subwoofer' : isOverhead ? 'speaker-inceiling' : 'speaker-bookshelf',
          shape: 'speaker',
          label: p.channel,
          cxIn: p.xIn,
          cyIn: p.yIn,
          ...size,
          elevationIn: Math.max(0, p.zIn - (isOverhead ? 0 : size.heightIn / 2)),
          rotationDeg: 0,
          color: isSub ? '#7f1d1d' : isOverhead ? '#d97706' : '#b45309',
          meta: { channel: p.channel, roomId: Number(roomId), gen: 'speaker' },
        };
      })
    );
  }, [axes, mlp, theater, box, referenceRow, ceilingHeightIn, replaceGenerated, roomId]);

  const placeSeats = useCallback(() => {
    if (!axes || !theater) return;
    replaceGenerated('seat', () =>
      theater.rows.flatMap((row) => {
        const count = Math.max(1, row.seats);
        const spacing = row.spacingIn || 32;
        const startLateral = -((count - 1) * spacing) / 2;
        return Array.from({ length: count }, (_, i) => {
          const pos = pointAt(axes, row.distanceIn, startLateral + i * spacing);
          return {
            id: newLocalId(),
            category: 'seating',
            type: 'theater-seat',
            shape: 'sofa',
            label: `${row.label} S${i + 1}`,
            cxIn: pos.xIn,
            cyIn: pos.yIn,
            widthIn: Math.min(spacing - 2, 30),
            depthIn: 36,
            heightIn: 42,
            elevationIn: row.riserHeightIn || 0,
            rotationDeg: rotationForWall(theater.screenWall),
            color: '#991b1b',
            meta: { roomId: Number(roomId), gen: 'seat', rowId: row.id },
          };
        });
      })
    );
  }, [axes, theater, replaceGenerated, roomId]);

  const placeScreenAndProjector = useCallback(() => {
    if (!axes || !theater || !screen) return;
    replaceGenerated('screen', () => {
      const screenPos = pointAt(axes, 2);
      const projPos = pointAt(axes, theater.projector.mountDistanceIn);
      const horizontal = theater.screenWall === 'north' || theater.screenWall === 'south';
      return [
        {
          id: newLocalId(),
          category: 'av',
          type: 'wall-tv',
          shape: 'screen',
          label: 'Screen',
          cxIn: screenPos.xIn,
          cyIn: screenPos.yIn,
          widthIn: horizontal ? screen.widthIn : 4,
          depthIn: horizontal ? 4 : screen.widthIn,
          heightIn: screen.heightIn,
          elevationIn: theater.screen.bottomIn,
          rotationDeg: 0,
          color: '#0f172a',
          meta: { roomId: Number(roomId), gen: 'screen', role: 'screen' },
        },
        {
          id: newLocalId(),
          category: 'av',
          type: 'projector',
          shape: 'rect',
          label: 'Projector',
          cxIn: projPos.xIn,
          cyIn: projPos.yIn,
          widthIn: 20,
          depthIn: 18,
          heightIn: 8,
          elevationIn: theater.projector.mountHeightIn,
          rotationDeg: 0,
          color: '#475569',
          meta: { roomId: Number(roomId), gen: 'screen', role: 'projector' },
        },
      ];
    });
  }, [axes, theater, screen, replaceGenerated, roomId]);

  // --- dragging speakers ---------------------------------------------------
  const handlePointerDown = useCallback(
    (event) => {
      if (!plan) return;
      const raw = toPlan(event);
      const target = event.target.closest('[data-kind]');
      const kind = target?.dataset.kind;
      const id = target?.dataset.id ? Number(target.dataset.id) : null;

      if (event.button === 1 || event.button === 2) {
        dragRef.current = {
          type: 'pan',
          startClient: { x: event.clientX, y: event.clientY },
          startView: view,
        };
        event.preventDefault();
        return;
      }
      if (event.button !== 0) return;

      if (kind === 'object') {
        const obj = plan.objects.find((o) => o.id === id);
        if (!obj) return;
        setSelection(id);
        pushHistory();
        dragRef.current = {
          type: 'move',
          id,
          grab: { xIn: raw.xIn - obj.cxIn, yIn: raw.yIn - obj.cyIn },
        };
      } else {
        setSelection(null);
      }
    },
    [plan, toPlan, view, pushHistory]
  );

  const handlePointerMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const raw = toPlan(event);

      if (drag.type === 'pan') {
        const dx = (event.clientX - drag.startClient.x) * upp;
        const dy = (event.clientY - drag.startClient.y) * upp;
        setView({ ...drag.startView, x: drag.startView.x - dx, y: drag.startView.y - dy });
        return;
      }

      mutate((prev) => ({
        ...prev,
        objects: prev.objects.map((o) =>
          o.id === drag.id
            ? {
                ...o,
                cxIn: snap(raw.xIn - drag.grab.xIn, event.altKey ? 0 : 1),
                cyIn: snap(raw.yIn - drag.grab.yIn, event.altKey ? 0 : 1),
              }
            : o
        ),
      }));
    },
    [toPlan, upp, mutate, setView]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const addSpeaker = useCallback(() => {
    if (!mlp || !axes) return;
    const spec = CHANNELS_BY_KEY[addChannel];
    const pos = pointAt(axes, referenceRow?.distanceIn || 120, 0);
    pushHistory();
    mutate((prev) => ({
      ...prev,
      objects: [
        ...prev.objects,
        {
          id: newLocalId(),
          category: 'av',
          type: spec.group === 'sub' ? 'subwoofer' : 'speaker-bookshelf',
          shape: 'speaker',
          label: addChannel,
          cxIn: pos.xIn,
          cyIn: pos.yIn,
          widthIn: spec.group === 'sub' ? 18 : 10,
          depthIn: spec.group === 'sub' ? 18 : 12,
          heightIn: spec.group === 'sub' ? 20 : 16,
          elevationIn: spec.group === 'sub' ? 0 : theater.earHeightIn - 8,
          rotationDeg: 0,
          color: spec.group === 'sub' ? '#7f1d1d' : '#b45309',
          meta: { channel: addChannel, roomId: Number(roomId), gen: 'speaker' },
        },
      ],
    }));
  }, [addChannel, mlp, axes, referenceRow, mutate, pushHistory, roomId, theater]);

  const deleteSelected = useCallback(() => {
    if (!selection) return;
    pushHistory();
    mutate((prev) => ({ ...prev, objects: prev.objects.filter((o) => o.id !== selection) }));
    setSelection(null);
  }, [selection, mutate, pushHistory]);

  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if (e.key === 'Escape') setSelection(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, undo]);

  if (!plan) return <div className="loading">Loading…</div>;
  if (!room) {
    return (
      <div className="page">
        <p className="muted">That room no longer exists.</p>
        <Link to={`/designs/${designId}`}>← Back to the floor plan</Link>
      </div>
    );
  }
  if (room.missing || !box) {
    return (
      <div className="page">
        <h1>{room.name}</h1>
        <p className="muted">
          This room isn't enclosed yet, so there's no space to lay out. Go back to the floor plan
          and make sure walls fully enclose it.
        </p>
        <Link to={`/designs/${designId}`}>← Back to the floor plan</Link>
      </div>
    );
  }

  const seatDistances = rowAnalysis.map((r) => r.distanceIn);
  const closestSeat = Math.min(...seatDistances, Infinity);
  const farthestSeat = Math.max(...seatDistances, 0);

  return (
    <div className="editor-page">
      <div className="editor-header">
        <Link to={`/designs/${designId}`} className="back-link">
          &larr; Floor plan
        </Link>
        <h1>{room.name} — Theater</h1>
        <div className="editor-header-meta">
          {formatArea(room.areaSqIn)} · {formatFtIn(axes.widthIn)} wide ×{' '}
          {formatFtIn(axes.depthIn)} deep · {formatFtIn(ceilingHeightIn)} ceiling
        </div>
        <div className="toolbar-right">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={showOverlays}
              onChange={(e) => setShowOverlays(e.target.checked)}
            />
            Overlays
          </label>
          <span className="save-status">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
          </span>
        </div>
      </div>

      <div className="editor-body editor-body-wide">
        <aside className="palette">
          <h3>Speaker Layout</h3>
          <label>
            Format
            <select
              value={theater.format}
              onChange={(e) => updateTheater({ format: e.target.value })}
            >
              {Object.keys(FORMATS).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label>
            Screen wall
            <select
              value={theater.screenWall}
              onChange={(e) => updateTheater({ screenWall: e.target.value })}
            >
              {SCREEN_WALLS.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={placeSpeakers}>Auto-place speakers</button>
          <p className="calc-note">
            Places every channel at its Dolby reference angle, then you can drag any of them to fit
            real walls and soffits — the angles re-check as you move.
          </p>

          <div className="speaker-list">
            {(FORMATS[theater.format] || []).map((channelKey) => {
              const spec = CHANNELS_BY_KEY[channelKey];
              const found = validatedByChannel[channelKey];
              const worst = found?.issues.some((i) => i.level === 'error')
                ? 'error'
                : found?.issues.length
                  ? 'warn'
                  : found
                    ? 'good'
                    : 'missing';
              return (
                <div key={channelKey} className={`speaker-row ${worst}`}>
                  <div className="speaker-row-head">
                    <strong>{channelKey}</strong>
                    <span>{spec.label}</span>
                  </div>
                  {!found && <div className="speaker-detail">not placed</div>}
                  {found && (
                    <div className="speaker-detail">
                      {spec.group === 'sub'
                        ? `${formatFtIn(found.measured.distanceIn)} from MLP`
                        : `${Math.round(found.measured.azimuth)}° az · ${Math.round(
                            found.measured.elevation
                          )}° el · ${formatFtIn(found.measured.distanceIn)}`}
                    </div>
                  )}
                  {found?.issues.map((issue, i) => (
                    <div key={i} className={`speaker-issue ${issue.level}`}>
                      {issue.text}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="dims-row">
            <label>
              Add channel
              <select value={addChannel} onChange={(e) => setAddChannel(e.target.value)}>
                {CHANNELS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.key} — {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={addSpeaker}>Add single speaker</button>
          {selection && (
            <button className="danger" onClick={deleteSelected}>
              Delete selected
            </button>
          )}
        </aside>

        <div className="stage-wrap plan-wrap" ref={wrapRef}>
          <PlanCanvas
            plan={plan}
            computedRooms={computedRooms}
            view={view}
            upp={upp}
            selection={selection ? { kind: 'object', id: selection } : null}
            draft={null}
            layers={{ rooms: true, labels: false, dimensions: false, clearances: false }}
            svgRef={svgRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
          >
            {showOverlays && (
              <TheaterOverlay
                axes={axes}
                box={box}
                mlp={mlp}
                screen={screen}
                theater={theater}
                validated={validated}
                rowAnalysis={rowAnalysis}
                upp={upp}
              />
            )}
          </PlanCanvas>
        </div>

        <aside className="properties">
          <Section title="Screen">
            <LengthField
              label="Screen width"
              valueIn={theater.screen.widthIn}
              onCommit={(v) => updateTheater({ screen: { ...theater.screen, widthIn: v } })}
            />
            <div className="dims-row">
              <label>
                Aspect
                <select
                  value={theater.screen.aspect}
                  onChange={(e) =>
                    updateTheater({ screen: { ...theater.screen, aspect: Number(e.target.value) } })
                  }
                >
                  {ASPECTS.map((a) => (
                    <option key={a.label} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Gain
                <input
                  type="number"
                  step="0.05"
                  value={theater.screen.gain}
                  onChange={(e) =>
                    updateTheater({ screen: { ...theater.screen, gain: Number(e.target.value) } })
                  }
                />
              </label>
            </div>
            <LengthField
              label="Bottom of screen off floor"
              valueIn={theater.screen.bottomIn}
              onCommit={(v) => updateTheater({ screen: { ...theater.screen, bottomIn: v } })}
            />
            <div className="readout">
              {Math.round(screen.widthIn)}" × {Math.round(screen.heightIn)}" ·{' '}
              {Math.round(screen.diagonalIn)}" diagonal
              <br />
              Top of image at {formatFtIn(theater.screen.bottomIn + screen.heightIn)}
              {theater.screen.bottomIn + screen.heightIn > ceilingHeightIn && (
                <strong className="error-text"> — taller than the ceiling</strong>
              )}
            </div>
            <button onClick={placeScreenAndProjector}>Place screen + projector on plan</button>
          </Section>

          <Section title="Seats & Sightlines">
            {rowAnalysis.map((row) => {
              const needed =
                row.clearanceIn != null && row.clearanceIn < 2
                  ? requiredRiserHeight({
                      rowDistanceIn: row.distanceIn,
                      aheadDistanceIn:
                        rowAnalysis[rowAnalysis.indexOf(row) - 1]?.distanceIn || row.distanceIn,
                      aheadRiserIn:
                        rowAnalysis[rowAnalysis.indexOf(row) - 1]?.riserHeightIn || 0,
                      screenBottomIn: theater.screen.bottomIn,
                      seatedEyeHeightIn: theater.earHeightIn,
                    })
                  : null;
              return (
                <div key={row.id} className="row-card">
                  <div className="row-card-head">
                    <input
                      value={row.label}
                      onChange={(e) => updateRow(updateTheater, theater, row.id, { label: e.target.value })}
                    />
                    <button
                      className="danger-link"
                      onClick={() =>
                        updateTheater({ rows: theater.rows.filter((r) => r.id !== row.id) })
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <div className="dims-row">
                    <LengthField
                      label="From screen"
                      valueIn={row.distanceIn}
                      onCommit={(v) => updateRow(updateTheater, theater, row.id, { distanceIn: v })}
                    />
                    <label>
                      Seats
                      <input
                        type="number"
                        min="1"
                        value={row.seats}
                        onChange={(e) =>
                          updateRow(updateTheater, theater, row.id, { seats: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <div className="dims-row">
                    <LengthField
                      label="Riser height"
                      valueIn={row.riserHeightIn || 0}
                      onCommit={(v) =>
                        updateRow(updateTheater, theater, row.id, { riserHeightIn: v })
                      }
                    />
                    <LengthField
                      label="Seat spacing"
                      valueIn={row.spacingIn || 32}
                      onCommit={(v) => updateRow(updateTheater, theater, row.id, { spacingIn: v })}
                    />
                  </div>
                  <div className={`verdict ${row.viewingVerdict.level}`}>
                    {row.viewingAngleDeg.toFixed(0)}° viewing angle — {row.viewingVerdict.text}
                  </div>
                  <div className="verdict">
                    {detailVerdict(
                      pixelsPerDegree(theater.projector.pixels, screen.widthIn, row.distanceIn)
                    ).text}{' '}
                    ({pixelsPerDegree(theater.projector.pixels, screen.widthIn, row.distanceIn).toFixed(0)} PPD)
                  </div>
                  {row.clearanceIn != null && (
                    <div className={`verdict ${row.clearanceIn >= 2 ? 'good' : 'error'}`}>
                      {row.clearanceIn >= 2
                        ? `Sees over the row ahead with ${row.clearanceIn.toFixed(1)}" to spare.`
                        : `Blocked by the row ahead by ${Math.abs(row.clearanceIn).toFixed(1)}". Raise this riser to about ${Math.ceil(needed)}".`}
                    </div>
                  )}
                  <label className="inline-check">
                    <input
                      type="radio"
                      name="refRow"
                      checked={theater.referenceRowId === row.id}
                      onChange={() => updateTheater({ referenceRowId: row.id })}
                    />
                    Main listening position row
                  </label>
                </div>
              );
            })}
            <button
              onClick={() => {
                const last = theater.rows[theater.rows.length - 1];
                const id = Math.max(0, ...theater.rows.map((r) => r.id)) + 1;
                updateTheater({
                  rows: [
                    ...theater.rows,
                    {
                      id,
                      label: `Row ${theater.rows.length + 1}`,
                      distanceIn: (last?.distanceIn || 120) + 48,
                      seats: last?.seats || 3,
                      spacingIn: last?.spacingIn || 32,
                      riserHeightIn: (last?.riserHeightIn || 0) + 8,
                    },
                  ],
                });
              }}
            >
              Add row
            </button>
            <button onClick={placeSeats}>Place seats on plan</button>
          </Section>

          <Section title="Projector">
            <label>
              Model
              <select
                value={theater.projector.preset}
                onChange={(e) => {
                  const preset = PROJECTOR_PRESETS.find((p) => p.label === e.target.value);
                  updateTheater({
                    projector: {
                      ...theater.projector,
                      preset: preset.label,
                      throwMin: preset.throwMin,
                      throwMax: preset.throwMax,
                      lumens: preset.lumens,
                      pixels: preset.pixels,
                      lensShiftMaxPct: preset.shift,
                    },
                  });
                }}
              >
                {PROJECTOR_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="dims-row">
              <label>
                Throw min
                <input
                  type="number"
                  step="0.01"
                  value={theater.projector.throwMin}
                  onChange={(e) =>
                    updateTheater({
                      projector: { ...theater.projector, throwMin: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Throw max
                <input
                  type="number"
                  step="0.01"
                  value={theater.projector.throwMax}
                  onChange={(e) =>
                    updateTheater({
                      projector: { ...theater.projector, throwMax: Number(e.target.value) },
                    })
                  }
                />
              </label>
            </div>
            <div className="dims-row">
              <label>
                Lumens
                <input
                  type="number"
                  value={theater.projector.lumens}
                  onChange={(e) =>
                    updateTheater({
                      projector: { ...theater.projector, lumens: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Output %
                <input
                  type="number"
                  step="5"
                  value={Math.round(theater.projector.lumensMode * 100)}
                  onChange={(e) =>
                    updateTheater({
                      projector: {
                        ...theater.projector,
                        lumensMode: Number(e.target.value) / 100,
                      },
                    })
                  }
                />
              </label>
            </div>
            <div className="dims-row">
              <LengthField
                label="Mount distance from screen"
                valueIn={theater.projector.mountDistanceIn}
                onCommit={(v) =>
                  updateTheater({ projector: { ...theater.projector, mountDistanceIn: v } })
                }
              />
              <LengthField
                label="Lens height"
                valueIn={theater.projector.mountHeightIn}
                onCommit={(v) =>
                  updateTheater({ projector: { ...theater.projector, mountHeightIn: v } })
                }
              />
            </div>

            <div className={`verdict ${projector.withinThrow ? 'good' : 'error'}`}>
              {projector.withinThrow
                ? `Zoom covers this: usable range ${formatFtIn(projector.minThrowIn)} – ${formatFtIn(projector.maxThrowIn)}.`
                : `Out of range — for a ${Math.round(screen.widthIn)}" wide image this projector must sit between ${formatFtIn(projector.minThrowIn)} and ${formatFtIn(projector.maxThrowIn)} from the screen.`}
            </div>
            <div className={`verdict ${projector.brightness.level}`}>
              {projector.footLamberts.toFixed(0)} fL ({projector.nits.toFixed(0)} nits) —{' '}
              {projector.brightness.text}
            </div>
            <div className={`verdict ${projector.shiftOk ? 'good' : 'error'}`}>
              Needs {projector.shiftNeededPct >= 0 ? 'downward' : 'upward'} lens shift of{' '}
              {Math.abs(projector.shiftNeededPct).toFixed(0)}% of image height
              {projector.shiftOk
                ? ' — within this projector’s range.'
                : ` — more than its ±${theater.projector.lensShiftMaxPct}% range. Move the mount or raise the screen.`}
            </div>
            {projector.beamIssues.length > 0 && (
              <div className="verdict error">
                Light path clipped by heads in {projector.beamIssues.map((b) => b.seat).join(', ')}.
                Raise the lens or lower the screen.
              </div>
            )}
            {ceilingHeightIn - theater.projector.mountHeightIn < 8 && (
              <div className="verdict warn">
                Only {formatFtIn(ceilingHeightIn - theater.projector.mountHeightIn)} between the lens
                height and the ceiling — check the mount and the projector body fit.
              </div>
            )}
          </Section>

          <Section title="Room & Boundaries">
            <div className="dims-row">
              <LengthField
                label="Seated ear height"
                valueIn={theater.earHeightIn}
                onCommit={(v) => updateTheater({ earHeightIn: v })}
              />
              <LengthField
                label="Surround height"
                valueIn={theater.surroundHeightIn}
                onCommit={(v) => updateTheater({ surroundHeightIn: v })}
              />
            </div>
            <div className="readout">
              Closest seat {formatFtIn(closestSeat)} · farthest {formatFtIn(farthestSeat)} from the
              screen
            </div>
            <BoundaryNotes speakers={validated} box={box} />
          </Section>
        </aside>
      </div>
    </div>
  );
}

function rotationForWall(screenWall) {
  switch (screenWall) {
    case 'south':
      return 180;
    case 'west':
      return 270;
    case 'east':
      return 90;
    default:
      return 0;
  }
}

function updateRow(updateTheater, theater, rowId, patch) {
  updateTheater({
    rows: theater.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
  });
}

function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="props-section">
      <button className="palette-group-header" onClick={() => setOpen(!open)}>
        {title}
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="props-section-body">{children}</div>}
    </div>
  );
}

function LengthField({ label, valueIn, onCommit }) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  return (
    <label>
      {label}
      <input
        value={editing ? text : formatFtIn(valueIn, { fractions: true })}
        onFocus={(e) => {
          setEditing(true);
          setText(String(Math.round(valueIn * 100) / 100));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const parsed = parseLength(text, 'in');
          if (parsed != null) onCommit(parsed);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.target.blur();
        }}
      />
    </label>
  );
}

function BoundaryNotes({ speakers, box }) {
  const notes = speakers
    .filter((s) => s.spec.group === 'bed' || s.spec.group === 'surround')
    .map((s) => {
      const toWall = Math.min(
        Math.abs(s.xIn - box.minX),
        Math.abs(box.maxX - s.xIn),
        Math.abs(s.yIn - box.minY),
        Math.abs(box.maxY - s.yIn)
      );
      return { channel: s.channel, toWall, notch: sbirNotchHz(toWall) };
    })
    .filter((n) => n.notch && n.notch > 80 && n.notch < 400);

  if (!notes.length) {
    return (
      <p className="calc-note">
        No significant boundary interference flagged. Speakers very close to (or well away from) a
        wall push the cancellation notch out of the critical midbass range.
      </p>
    );
  }
  return (
    <>
      <p className="calc-note">
        Boundary interference (SBIR): the reflection off the nearest wall cancels around these
        frequencies. Moving the speaker closer to the wall pushes the notch higher and shallower.
      </p>
      <ul className="warning-list">
        {notes.map((n) => (
          <li key={n.channel} className="warn">
            {n.channel}: {formatFtIn(n.toWall)} from the nearest wall → dip near {n.notch} Hz
          </li>
        ))}
      </ul>
    </>
  );
}

function TheaterOverlay({ axes, box, mlp, screen, theater, validated, rowAnalysis, upp }) {
  if (!mlp || !axes || !screen) return null;
  const font = 12 * upp;
  const half = screen.widthIn / 2;
  const screenA = pointAt(axes, 2, -half);
  const screenB = pointAt(axes, 2, half);

  const colorFor = (v) => {
    if (v.issues.some((i) => i.level === 'error')) return '#ef4444';
    if (v.issues.length) return '#f59e0b';
    return '#4ade80';
  };

  return (
    <g pointerEvents="none">
      {/* Screen face */}
      <line
        x1={screenA.xIn}
        y1={screenA.yIn}
        x2={screenB.xIn}
        y2={screenB.yIn}
        stroke="#e2e8f0"
        strokeWidth={Math.max(2, 4 * upp)}
      />

      {/* Viewing cone from the MLP to the screen edges */}
      <polygon
        points={`${mlp.xIn},${mlp.yIn} ${screenA.xIn},${screenA.yIn} ${screenB.xIn},${screenB.yIn}`}
        fill="rgba(226,232,240,0.07)"
        stroke="rgba(226,232,240,0.25)"
        strokeWidth={upp}
      />

      {/* Row lines */}
      {rowAnalysis.map((row) => {
        const a = pointAt(axes, row.distanceIn, -axes.widthIn / 2 + 4);
        const b = pointAt(axes, row.distanceIn, axes.widthIn / 2 - 4);
        return (
          <g key={row.id}>
            <line
              x1={a.xIn}
              y1={a.yIn}
              x2={b.xIn}
              y2={b.yIn}
              stroke="rgba(148,163,184,0.5)"
              strokeWidth={upp}
              strokeDasharray={`${6 * upp} ${4 * upp}`}
            />
            <text x={a.xIn} y={a.yIn - font * 0.4} fill="#94a3b8" fontSize={font * 0.85}>
              {row.label} · {formatFtIn(row.distanceIn)} · {row.viewingAngleDeg.toFixed(0)}°
            </text>
          </g>
        );
      })}

      {/* Speaker sightlines from the MLP */}
      {validated.map((v) => (
        <g key={v.id ?? v.channel}>
          <line
            x1={mlp.xIn}
            y1={mlp.yIn}
            x2={v.xIn}
            y2={v.yIn}
            stroke={colorFor(v)}
            strokeWidth={Math.max(0.6, 1.4 * upp)}
            opacity={0.8}
          />
          <text
            x={v.xIn}
            y={v.yIn - 8 * upp}
            fill={colorFor(v)}
            fontSize={font * 0.9}
            textAnchor="middle"
            style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3 * upp }}
          >
            {v.channel}
            {v.spec.group !== 'sub' ? ` ${Math.round(v.measured.azimuth)}°` : ''}
          </text>
        </g>
      ))}

      {/* Main listening position */}
      <g>
        <circle cx={mlp.xIn} cy={mlp.yIn} r={5 * upp} fill="#22d3ee" />
        <circle
          cx={mlp.xIn}
          cy={mlp.yIn}
          r={14 * upp}
          fill="none"
          stroke="#22d3ee"
          strokeWidth={upp}
        />
        <text
          x={mlp.xIn}
          y={mlp.yIn + 26 * upp}
          fill="#22d3ee"
          fontSize={font * 0.9}
          textAnchor="middle"
          style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3 * upp }}
        >
          MLP
        </text>
      </g>
    </g>
  );
}
