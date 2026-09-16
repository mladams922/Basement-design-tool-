import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { exportEquipmentCSV } from '../exporters.js';
import { PRESETS_BY_KEY } from '../objectLibrary.js';

const CATEGORIES = [
  'Display',
  'Audio',
  'Amplification',
  'Seating',
  'Furniture',
  'Cabling/Electrical',
  'Lighting',
  'Networking',
  'Treatment',
  'Construction',
  'Other',
];

const STATUSES = ['wishlist', 'ordered', 'purchased', 'installed'];
const PRIORITIES = [
  { key: 'must', label: 'Must have' },
  { key: 'want', label: 'Want' },
  { key: 'later', label: 'Phase 2' },
];

// Placed objects map onto sensible purchase categories so the list can be
// seeded from what's already drawn on the plan.
const CATEGORY_FROM_OBJECT = {
  av: 'Audio',
  lighting: 'Lighting',
  seating: 'Seating',
  furniture: 'Furniture',
  tables: 'Furniture',
  bar: 'Furniture',
  gym: 'Other',
  storage: 'Furniture',
  structure: 'Construction',
  utility: 'Construction',
  stairs: 'Construction',
};

function dollars(cents) {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export default function Equipment() {
  const [items, setItems] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [importDesignId, setImportDesignId] = useState('');
  const [groupBy, setGroupBy] = useState('category');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    model: '',
    category: 'Audio',
    price: '',
    quantity: 1,
    status: 'wishlist',
    priority: 'want',
    roomId: '',
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [equipment, designList] = await Promise.all([api.getEquipment(), api.getDesigns()]);
    setItems(equipment);
    setDesigns(designList);
    // Room names come from each design's plan; one fetch per design is fine at
    // the handful-of-designs scale this tool operates at.
    const plans = await Promise.all(designList.map((d) => api.getPlan(d.id).catch(() => null)));
    setRooms(
      plans
        .filter(Boolean)
        .flatMap((p) => p.rooms.map((r) => ({ ...r, designName: p.design.name })))
    );
  }

  async function addItem(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createEquipment({
      name: form.name,
      model: form.model,
      category: form.category,
      priceCents: Math.round(Number(form.price || 0) * 100),
      quantity: Number(form.quantity) || 1,
      status: form.status,
      priority: form.priority,
      roomId: form.roomId ? Number(form.roomId) : null,
    });
    setForm({ ...form, name: '', model: '', price: '', quantity: 1 });
    load();
  }

  async function patch(id, changes) {
    await api.updateEquipment(id, changes);
    load();
  }

  async function remove(id) {
    if (!confirm('Remove this item?')) return;
    await api.deleteEquipment(id);
    load();
  }

  // Pulls everything placed on a design into the list, skipping anything with a
  // matching name so it can be re-run safely after adding more to the plan.
  async function importFromDesign() {
    if (!importDesignId) return;
    setBusy(true);
    try {
      const plan = await api.getPlan(importDesignId);
      const existing = new Set((items || []).map((i) => i.name.toLowerCase()));
      const counts = new Map();
      for (const obj of plan.objects) {
        const key = `${obj.type}|${obj.label}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const toCreate = [];
      for (const [key, quantity] of counts) {
        const [type, label] = key.split('|');
        if (existing.has(label.toLowerCase())) continue;
        const preset = PRESETS_BY_KEY[type];
        const sample = plan.objects.find((o) => o.type === type && o.label === label);
        toCreate.push({
          name: label || preset?.label || type,
          model: '',
          category: CATEGORY_FROM_OBJECT[sample?.category] || 'Other',
          priceCents: 0,
          quantity,
          status: 'wishlist',
          priority: 'want',
          designId: Number(importDesignId),
        });
      }
      for (const item of toCreate) await api.createEquipment(item);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const totals = useMemo(() => {
    if (!items) return null;
    const line = (i) => i.priceCents * (i.quantity || 1);
    const spent = items
      .filter((i) => i.status === 'purchased' || i.status === 'installed')
      .reduce((sum, i) => sum + line(i), 0);
    const committed = items
      .filter((i) => i.status === 'ordered')
      .reduce((sum, i) => sum + line(i), 0);
    const planned = items.reduce((sum, i) => sum + line(i), 0);
    const mustHave = items
      .filter((i) => i.priority === 'must')
      .reduce((sum, i) => sum + line(i), 0);
    const unpriced = items.filter((i) => !i.priceCents).length;
    return { spent, committed, planned, mustHave, unpriced };
  }, [items]);

  const groups = useMemo(() => {
    if (!items) return [];
    const keyFor = (item) => {
      if (groupBy === 'category') return item.category || 'Other';
      if (groupBy === 'status') return item.status;
      if (groupBy === 'priority') {
        return PRIORITIES.find((p) => p.key === item.priority)?.label || 'Want';
      }
      const room = rooms.find((r) => r.id === item.roomId);
      return room ? `${room.name} (${room.designName})` : 'Unassigned';
    };
    const map = new Map();
    for (const item of items) {
      const key = keyFor(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()]
      .map(([key, list]) => ({
        key,
        list,
        total: list.reduce((sum, i) => sum + i.priceCents * (i.quantity || 1), 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [items, groupBy, rooms]);

  if (!items) return <div className="loading">Loading equipment…</div>;

  return (
    <div className="page">
      <h1>Equipment &amp; Budget</h1>

      <div className="budget-summary">
        <div className="card stat">
          <div className="stat-value">{dollars(totals.planned)}</div>
          <div className="stat-label">Total planned</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{dollars(totals.spent)}</div>
          <div className="stat-label">Purchased / installed</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{dollars(totals.committed)}</div>
          <div className="stat-label">On order</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{dollars(totals.mustHave)}</div>
          <div className="stat-label">Must-have subtotal</div>
        </div>
      </div>

      {totals.unpriced > 0 && (
        <div className="verdict warn">
          {totals.unpriced} item{totals.unpriced === 1 ? ' has' : 's have'} no price yet, so the
          totals above are low.
        </div>
      )}

      <div className="card">
        <div className="equip-toolbar">
          <label className="inline-field">
            Group by
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="category">Category</option>
              <option value="room">Room</option>
              <option value="status">Status</option>
              <option value="priority">Priority</option>
            </select>
          </label>
          <label className="inline-field">
            Import from
            <select value={importDesignId} onChange={(e) => setImportDesignId(e.target.value)}>
              <option value="">Choose a design…</option>
              {designs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={importFromDesign} disabled={!importDesignId || busy}>
            {busy ? 'Importing…' : 'Add placed items'}
          </button>
          <button onClick={() => exportEquipmentCSV(items, rooms)}>Export CSV</button>
        </div>

        {groups.map((group) => (
          <div key={group.key} className="equip-group">
            <div className="equip-group-head">
              <h3>{group.key}</h3>
              <span>{dollars(group.total)}</span>
            </div>
            <table className="equip-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Model</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Line</th>
                  <th>Room</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {group.list.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        defaultValue={item.name}
                        onBlur={(e) => patch(item.id, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={item.model || ''}
                        placeholder="model / part #"
                        onBlur={(e) => patch(item.id, { model: e.target.value })}
                      />
                    </td>
                    <td className="narrow">
                      <input
                        type="number"
                        min="1"
                        defaultValue={item.quantity || 1}
                        onBlur={(e) => patch(item.id, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td className="narrow">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={(item.priceCents / 100).toFixed(2)}
                        onBlur={(e) =>
                          patch(item.id, { priceCents: Math.round(Number(e.target.value) * 100) })
                        }
                      />
                    </td>
                    <td className="line-total">
                      {dollars(item.priceCents * (item.quantity || 1))}
                    </td>
                    <td>
                      <select
                        defaultValue={item.roomId || ''}
                        onChange={(e) => patch(item.id, { roomId: e.target.value || null })}
                      >
                        <option value="">—</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        defaultValue={item.status}
                        onChange={(e) => patch(item.id, { status: e.target.value })}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        defaultValue={item.priority || 'want'}
                        onChange={(e) => patch(item.id, { priority: e.target.value })}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button className="danger-link" onClick={() => remove(item.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {items.length === 0 && (
          <div className="empty">
            Nothing here yet — add an item below, or pull in everything you've already placed on a
            design.
          </div>
        )}
      </div>

      <form className="card new-equip-form" onSubmit={addItem}>
        <h2>Add Item</h2>
        <div className="dims-row">
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Front left speaker"
            />
          </label>
          <label>
            Model
            <input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="e.g. SVS Ultra Tower"
            />
          </label>
          <label>
            Category
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="dims-row">
          <label>
            Unit price ($)
            <input
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </label>
          <label>
            Qty
            <input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </label>
          <label>
            Room
            <select
              value={form.roomId}
              onChange={(e) => setForm({ ...form, roomId: e.target.value })}
            >
              <option value="">—</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.designName})
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit">Add Item</button>
      </form>
    </div>
  );
}
