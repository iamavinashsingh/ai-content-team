import { API_BASE } from '@/lib/constants';

export async function initProject(brief, cmsTarget = 'none') {
  const response = await fetch(`${API_BASE}/project/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief, cmsTarget }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function submitFeedback(projectId, type, payload) {
  const response = await fetch(`${API_BASE}/project/${projectId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, payload }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function getProject(projectId) {
  const response = await fetch(`${API_BASE}/project/${projectId}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function getSnapshots(projectId) {
  const response = await fetch(`${API_BASE}/project/${projectId}/snapshots`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
