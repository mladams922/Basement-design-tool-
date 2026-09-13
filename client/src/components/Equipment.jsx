import { useEffect, useState } from 'react';
import { api } from '../api.js';

const CATEGORIES = ['Display', 'Audio', 'Seating', 'Furniture', 'Cabling/Electrical', 'Lighting', 'Other'];
const STATUSES = ['wishlist', 'ordered', 'purchased', 'installed'];

function dollars(cents) {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export default function Equipment() {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ name: '', category: 'Display', price: '', status: 'wishlist' });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setItems(await api.getEquipment());
  }

  async function addItem(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createEquipment({
      name: form.name,
      category: form.category,
      priceCents: Math.round(Number(form.price || 0) * 100),
      status: form.status,
    });
    setForm({ name: '', category: 'Display', price: '', status: 'wishlist' });
    load();
  }

  async function patch(id, patch) {
    await api.updateEquipment(id, patch);
    load();
  }

  async function remove(id) {
    if (!confirm('Remove this item?')) return;
    await api.deleteEquipment(id);
    load();
  }

  if (!items) return <div className="loading">Loading equipment…</div>;

  const total = items.reduce((sum, i) => sum + i.priceCents, 0);
  const purchased = items
    .filter((i) => i.status === 'purchased' || i.status === 'installed')
    .reduce((sum, i) => sum + i.priceCents, 0);

  return (
    <div className="page">
      <h1>Equipment &amp; Budget</h1>

      <div className="budget-summary">
        <div className="card stat">
          <div className="stat-value">{dollars(total)}</div>
          <div className="stat-label">Total planned</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{dollars(purchased)}</div>
          <div className="stat-label">Purchased / installed</div>
        </div>
        <div className="card stat">
          <div className="stat-value">{items.length}</div>
          <div className="stat-label">Line items</div>
        </div>
      </div>

      <div className="card">
        <table className="equip-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Price</th>
              <th>Status</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input defaultValue={item.name} onBlur={(e) => patch(item.id, { name: e.target.value })} />
                </td>
                <td>
                  <select defaultValue={item.category} onChange={(e) => patch(item.id, { category: e.target.value })}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={(item.priceCents / 100).toFixed(2)}
                    onBlur={(e) => patch(item.id, { priceCents: Math.round(Number(e.target.value) * 100) })}
                  />
                </td>
                <td>
                  <select defaultValue={item.status} onChange={(e) => patch(item.id, { status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input defaultValue={item.notes} onBlur={(e) => patch(item.id, { notes: e.target.value })} />
                </td>
                <td>
                  <button className="danger-link" onClick={() => remove(item.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No equipment yet — add your first item below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form className="card new-equip-form" onSubmit={addItem}>
        <h2>Add Item</h2>
        <div className="dims-row">
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Epson LS12000 Projector"
            />
          </label>
          <label>
            Category
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Price ($)
            <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </label>
          <label>
            Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
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
