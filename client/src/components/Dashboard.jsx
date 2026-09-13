import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

function feetIn(inches) {
  inches = Math.round(inches);
  const ft = Math.floor(inches / 12);
  const inch = inches % 12;
  return `${ft}'${inch}"`;
}

export default function Dashboard() {
  const [plans, setPlans] = useState(null);
  const [form, setForm] = useState({ name: '', widthFt: 16, lengthFt: 20, heightFt: 8 });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setPlans(await api.getPlans());
  }

  async function createPlan(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const plan = await api.createPlan({
        name: form.name || 'New Layout',
        widthIn: Number(form.widthFt) * 12,
        lengthIn: Number(form.lengthFt) * 12,
        heightIn: Number(form.heightFt) * 12,
      });
      navigate(`/plans/${plan.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function removePlan(id) {
    if (!confirm('Delete this layout? This cannot be undone.')) return;
    await api.deletePlan(id);
    load();
  }

  if (!plans) return <div className="loading">Loading plans…</div>;

  return (
    <div className="page">
      <h1>Your Layouts</h1>
      <p className="muted">
        Create a layout for each basement configuration you want to test — screen placement, seating rows, speaker
        positions.
      </p>

      <div className="grid">
        {plans.map((p) => (
          <div className="card plan-card" key={p.id}>
            <Link to={`/plans/${p.id}`} className="plan-card-link">
              <div className="plan-card-title">{p.name}</div>
              <div className="plan-card-dims">
                {feetIn(p.widthIn)} × {feetIn(p.lengthIn)} room · {feetIn(p.heightIn)} ceiling
              </div>
            </Link>
            <button className="danger-link" onClick={() => removePlan(p.id)}>
              Delete
            </button>
          </div>
        ))}
        {plans.length === 0 && <div className="empty">No layouts yet — create your first one below.</div>}
      </div>

      <form className="card new-plan-form" onSubmit={createPlan}>
        <h2>New Layout</h2>
        <label>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Option A - center speakers"
          />
        </label>
        <div className="dims-row">
          <label>
            Width (ft)
            <input
              type="number"
              min="5"
              step="0.5"
              value={form.widthFt}
              onChange={(e) => setForm({ ...form, widthFt: e.target.value })}
            />
          </label>
          <label>
            Length (ft)
            <input
              type="number"
              min="5"
              step="0.5"
              value={form.lengthFt}
              onChange={(e) => setForm({ ...form, lengthFt: e.target.value })}
            />
          </label>
          <label>
            Ceiling (ft)
            <input
              type="number"
              min="6"
              step="0.5"
              value={form.heightFt}
              onChange={(e) => setForm({ ...form, heightFt: e.target.value })}
            />
          </label>
        </div>
        <button type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create Layout'}
        </button>
      </form>
    </div>
  );
}
