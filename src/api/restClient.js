/**
 * restClient.js
 * REST API client for tenant business data endpoints.
 */
const BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

function getBusinessId() {
  const id = Number(localStorage.getItem('business_id'));
  if (!id) throw new Error('No business context. Please log in again.');
  return id;
}

function getHeaders() {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse(res) {
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}

export function bizUrl(path) {
  return `${BASE}/b/${getBusinessId()}${path}`;
}

export const restGet = (path, params = {}) => {
  const url = new URL(bizUrl(path), window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  return fetch(url.toString(), { headers: getHeaders() }).then(handleResponse);
};

export const restPost = (path, body) => fetch(bizUrl(path), { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) }).then(handleResponse);
export const restPut = (path, body) => fetch(bizUrl(path), { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) }).then(handleResponse);
export const restDelete = (path) => fetch(bizUrl(path), { method: 'DELETE', headers: getHeaders() }).then(handleResponse);
export const restPatch = (path, body) => fetch(bizUrl(path), { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(body) }).then(handleResponse);
