import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatFtIn, parseLength } from '../units.js';
import { bbox } from '../geometry.js';

export default function Dashboard() {
  const [designs, setDesigns] = useState(null);
  const [form, setForm] = useState({ name: '', width: "32'", length: "24'", ceiling: "7'8\"" });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setDesigns(await api.getDesigns());
  }

  async function createDesign(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const widthIn = parseLength(form.width, 'ft') || 384;
      const lengthIn = parseLength(form.length, 'ft') || 288;
      const ceilingIn = parseLength(form.ceiling, 'ft') || 92;
      const design = await api.createDesign({
        name: form.name || 'Basement Plan',
        shellPoints: [
          { xIn: 0, yIn: 0 },
          { xIn: widthIn, yIn: 0 },
          { xIn: widthIn, yIn: lengthIn },
          { xIn: 0, yIn: lengthIn },
        ],
        defaultCeilingHeightIn: ceilingIn,
      });
      navigate(`/designs/${design.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function removeDesign(id) {
    if (!confirm('Delete this design and everything in it? This cannot be undone.')) return;
    await api.deleteDesign(id);
    load();
  }

  if (!designs) return <div className="loading">Loading designs…</div>;

  return (
    <div className="page">
      <h1>Basement Designs</h1>
      <p className="muted">
        Each design is a complete basement layout — outer shell, interior walls, rooms and
        everything in them. Make several to compare approaches.
      </p>

      <div className="grid">
        {designs.map((d) => {
          const box = bbox(d.shellPoints);
          return (
            <div className="card plan-card" key={d.id}>
              <Link to={`/designs/${d.id}`} className="plan-card-link">
                <div className="plan-card-title">{d.name}</div>
                <div className="plan-card-dims">
                  {formatFtIn(box.width)} × {formatFtIn(box.height)} envelope
                  <br />
                  {formatFtIn(d.defaultCeilingHeightIn)} ceiling
                </div>
              </Link>
              <button className="danger-link" onClick={() => removeDesign(d.id)}>
                Delete
              </button>
            </div>
          );
        })}
        {designs.length === 0 && (
          <div className="empty">No designs yet — start one below with your basement's overall size.</div>
        )}
      </div>

      <form className="card new-plan-form" onSubmit={createDesign}>
        <h2>New Design</h2>
        <p className="muted">
          Start with the overall rectangle of your basement; you can reshape the outline, add
          bump-outs and draw interior walls once you're in the editor.
        </p>
        <label>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Basement v1 — theater on the west end"
          />
        </label>
        <div className="dims-row">
          <label>
            Overall width
            <input
              value={form.width}
              onChange={(e) => setForm({ ...form, width: e.target.value })}
              placeholder="32' or 384&quot;"
            />
          </label>
          <label>
            Overall length
            <input
              value={form.length}
              onChange={(e) => setForm({ ...form, length: e.target.value })}
            />
          </label>
          <label>
            Ceiling height
            <input
              value={form.ceiling}
              onChange={(e) => setForm({ ...form, ceiling: e.target.value })}
            />
          </label>
        </div>
        <p className="calc-note">
          Accepts 32', 32'6", 390" or plain numbers. Measure to the inside face of the foundation
          wall — that's what the shell outline represents.
        </p>
        <button type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create Design'}
        </button>
      </form>
    </div>
  );
}
