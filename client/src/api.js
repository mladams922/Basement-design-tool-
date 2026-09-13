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

  getPlans: () => request('/plans'),
  getPlan: (id) => request(`/plans/${id}`),
  createPlan: (data) => request('/plans', { method: 'POST', body: JSON.stringify(data) }),
  updatePlan: (id, data) => request(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePlan: (id) => request(`/plans/${id}`, { method: 'DELETE' }),

  getItems: (planId) => request(`/plans/${planId}/items`),
  saveItems: (planId, items) =>
    request(`/plans/${planId}/items`, { method: 'PUT', body: JSON.stringify({ items }) }),

  getEquipment: () => request('/equipment'),
  createEquipment: (data) => request('/equipment', { method: 'POST', body: JSON.stringify(data) }),
  updateEquipment: (id, data) => request(`/equipment/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEquipment: (id) => request(`/equipment/${id}`, { method: 'DELETE' }),
};
