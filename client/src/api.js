const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (res.status === 401) {
    const err = new Error('unauthorized');
    err.unauthorized = true;
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  session: () => request('/session'),
  login: (password) => request('/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/logout', { method: 'POST' }),

  getDesigns: () => request('/designs'),
  getDesign: (id) => request(`/designs/${id}`),
  createDesign: (data) => request('/designs', { method: 'POST', body: JSON.stringify(data) }),
  updateDesign: (id, data) => request(`/designs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDesign: (id) => request(`/designs/${id}`, { method: 'DELETE' }),

  getPlan: (id) => request(`/designs/${id}/plan`),
  savePlan: (id, plan) => request(`/designs/${id}/plan`, { method: 'PUT', body: JSON.stringify(plan) }),

  getEquipment: () => request('/equipment'),
  createEquipment: (data) => request('/equipment', { method: 'POST', body: JSON.stringify(data) }),
  updateEquipment: (id, data) => request(`/equipment/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEquipment: (id) => request(`/equipment/${id}`, { method: 'DELETE' }),
};
