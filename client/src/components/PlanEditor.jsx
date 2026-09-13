import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';

const PRESETS = [
  { type: 'screen', label: 'Screen', widthIn: 120, heightIn: 6, color: '#1f2937' },
  { type: 'projector', label: 'Projector', widthIn: 14, heightIn: 10, color: '#475569' },
  { type: 'seat', label: 'Seat', widthIn: 30, heightIn: 34, color: '#9a3412' },
  { type: 'seatrow', label: 'Seating Row', widthIn: 90, heightIn: 34, color: '#9a3412' },
  { type: 'riser', label: 'Riser', widthIn: 144, heightIn: 48, color: '#334155' },
  { type: 'speaker', label: 'Speaker', widthIn: 10, heightIn: 10, color: '#b45309' },
  { type: 'subwoofer', label: 'Subwoofer', widthIn: 16, heightIn: 16, color: '#7f1d1d' },
  { type: 'rack', label: 'AV Rack', widthIn: 30, heightIn: 20, color: '#4b5563' },
  { type: 'door', label: 'Door', widthIn: 32, heightIn: 6, color: '#059669' },
  { type: 'furniture', label: 'Furniture', widthIn: 60, heightIn: 30, color: '#6d28d9' },
];

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function inchesToFeetLabel(inches) {
  inches = Math.round(inches);
  const ft = Math.floor(inches / 12);
  const inch = inches % 12;
  return inch === 0 ? `${ft}'` : `${ft}'${inch}"`;
}

let localIdCounter = -1;
function localId() {
  return localIdCounter--;
}

export default function PlanEditor() {
  const { planId } = useParams();
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [scale, setScale] = useState(3);
  const [status, setStatus] = useState('idle');
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [p, its] = await Promise.all([api.getPlan(planId), api.getItems(planId)]);
      if (cancelled) return;
      setPlan(p);
      setItems(its);
      const fitScale = Math.max(1.5, Math.min(900 / p.widthIn, 550 / p.lengthIn, 5));
      setScale(Number(fitScale.toFixed(2)));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const selected = items.find((i) => i.id === selectedId) || null;

  const save = useCallback(
    async (nextItems) => {
      setStatus('saving');
      try {
        const saved = await api.saveItems(planId, nextItems);
        setItems(saved);
        setStatus('saved');
      } catch (e) {
        setStatus('error');
      }
    },
    [planId]
  );

  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = setTimeout(() => {
      save(items);
      dirtyRef.current = false;
    }, 900);
    return () => clearTimeout(t);
  }, [items, save]);

  function updateItems(updater) {
    dirtyRef.current = true;
    setStatus('editing');
    setItems((prev) => updater(prev));
  }

  function addItem(preset) {
    if (!plan) return;
    const count = items.filter((i) => i.type === preset.type).length + 1;
    const newItem = {
      id: localId(),
      type: preset.type,
      label: count > 1 ? `${preset.label} ${count}` : preset.label,
      xIn: clamp(plan.widthIn / 2 - preset.widthIn / 2, 0, Math.max(0, plan.widthIn - preset.widthIn)),
      yIn: clamp(plan.lengthIn / 2 - preset.heightIn / 2, 0, Math.max(0, plan.lengthIn - preset.heightIn)),
      widthIn: preset.widthIn,
      heightIn: preset.heightIn,
      rotation: 0,
      color: preset.color,
    };
    updateItems((prev) => [...prev, newItem]);
    setSelectedId(newItem.id);
  }

  function patchItem(id, patch) {
    updateItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function deleteItem(id) {
    updateItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedId(null);
  }

  function rotateItem(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    patchItem(id, { rotation: (item.rotation + 90) % 360 });
  }

  function startDrag(e, item) {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(item.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const startXIn = item.xIn;
    const startYIn = item.yIn;
    const sideways = item.rotation === 90 || item.rotation === 270;
    const boxW = sideways ? item.heightIn : item.widthIn;
    const boxH = sideways ? item.widthIn : item.heightIn;

    function onMove(ev) {
      const dxIn = (ev.clientX - startX) / scale;
      const dyIn = (ev.clientY - startY) / scale;
      patchItem(item.id, {
        xIn: clamp(startXIn + dxIn, 0, Math.max(0, plan.widthIn - boxW)),
        yIn: clamp(startYIn + dyIn, 0, Math.max(0, plan.lengthIn - boxH)),
      });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startResize(e, item) {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(item.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const sideways = item.rotation === 90 || item.rotation === 270;
    const startW = item.widthIn;
    const startH = item.heightIn;

    function onMove(ev) {
      const dxIn = (ev.clientX - startX) / scale;
      const dyIn = (ev.clientY - startY) / scale;
      if (!sideways) {
        patchItem(item.id, {
          widthIn: clamp(startW + dxIn, 4, plan.widthIn - item.xIn),
          heightIn: clamp(startH + dyIn, 4, plan.lengthIn - item.yIn),
        });
      } else {
        patchItem(item.id, {
          widthIn: clamp(startW + dyIn, 4, plan.lengthIn - item.yIn),
          heightIn: clamp(startH + dxIn, 4, plan.widthIn - item.xIn),
        });
      }
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function saveNotes(notes) {
    const updated = await api.updatePlan(planId, { notes });
    setPlan(updated);
  }

  if (!plan) return <div className="loading">Loading layout…</div>;

  const stageWidthPx = plan.widthIn * scale;
  const stageHeightPx = plan.lengthIn * scale;
  const gridPx = 12 * scale;

  return (
    <div className="editor-page">
      <div className="editor-header">
        <Link to="/" className="back-link">
          &larr; All layouts
        </Link>
        <h1>{plan.name}</h1>
        <div className="editor-header-meta">
          {inchesToFeetLabel(plan.widthIn)} × {inchesToFeetLabel(plan.lengthIn)} · {inchesToFeetLabel(plan.heightIn)}{' '}
          ceiling
        </div>
        <div className="save-status">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Save failed' : ''}
        </div>
      </div>

      <div className="editor-body">
        <aside className="palette">
          <h3>Add to Layout</h3>
          {PRESETS.map((p) => (
            <button key={p.type} className="palette-btn" onClick={() => addItem(p)}>
              <span className="swatch" style={{ background: p.color }} />
              {p.label}
            </button>
          ))}
          <div className="zoom-controls">
            <span>Zoom</span>
            <button onClick={() => setScale((s) => Math.max(1, Number((s - 0.5).toFixed(2))))}>-</button>
            <button onClick={() => setScale((s) => Math.min(8, Number((s + 0.5).toFixed(2))))}>+</button>
          </div>
        </aside>

        <div className="stage-wrap">
          <div
            className="stage"
            style={{
              width: stageWidthPx,
              height: stageHeightPx,
              backgroundSize: `${gridPx}px ${gridPx}px`,
            }}
            onPointerDown={() => setSelectedId(null)}
          >
            {items.map((item) => {
              const sideways = item.rotation === 90 || item.rotation === 270;
              const boxW = sideways ? item.heightIn : item.widthIn;
              const boxH = sideways ? item.widthIn : item.heightIn;
              return (
                <div
                  key={item.id}
                  className={`stage-item${selectedId === item.id ? ' selected' : ''}`}
                  style={{
                    left: item.xIn * scale,
                    top: item.yIn * scale,
                    width: boxW * scale,
                    height: boxH * scale,
                    background: item.color,
                  }}
                  onPointerDown={(e) => startDrag(e, item)}
                >
                  <span className="stage-item-label">{item.label}</span>
                  {selectedId === item.id && (
                    <span className="resize-handle" onPointerDown={(e) => startResize(e, item)} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="properties">
          <h3>Properties</h3>
          {!selected && <p className="muted">Select an item to edit it, or add one from the palette.</p>}
          {selected && (
            <div className="props-form">
              <label>
                Label
                <input value={selected.label} onChange={(e) => patchItem(selected.id, { label: e.target.value })} />
              </label>
              <div className="dims-row">
                <label>
                  Width (in)
                  <input
                    type="number"
                    min="1"
                    value={Math.round(selected.widthIn)}
                    onChange={(e) => patchItem(selected.id, { widthIn: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Depth (in)
                  <input
                    type="number"
                    min="1"
                    value={Math.round(selected.heightIn)}
                    onChange={(e) => patchItem(selected.id, { heightIn: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label>
                Color
                <input
                  type="color"
                  value={selected.color}
                  onChange={(e) => patchItem(selected.id, { color: e.target.value })}
                />
              </label>
              <button onClick={() => rotateItem(selected.id)}>Rotate 90°</button>
              <button className="danger" onClick={() => deleteItem(selected.id)}>
                Delete Item
              </button>
            </div>
          )}

          <h3>Notes</h3>
          <textarea
            defaultValue={plan.notes}
            placeholder="Ideas, TODOs, measurements to double check…"
            onBlur={(e) => saveNotes(e.target.value)}
          />
        </aside>
      </div>
    </div>
  );
}
