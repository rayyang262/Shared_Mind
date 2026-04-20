import { getMyMemories } from '../firebase.js';

export async function renderFeed(root) {
  root.innerHTML = `<h1>Your memories</h1><div id="list">Loading…</div>`;
  const list = root.querySelector('#list');

  try {
    const memories = await getMyMemories();
    if (memories.length === 0) {
      list.innerHTML = `
        <div class="empty">
          No memories yet. <a href="#/log">Log your first one →</a>
        </div>
      `;
      return;
    }
    list.innerHTML = memories.map(memoryCard).join('');
  } catch (e) {
    list.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

function memoryCard(m) {
  const artists = m.song?.artists?.join(', ') || '';
  const date = m.date ? new Date(m.date).toLocaleDateString() : '';
  const visibility = m.isPublic ? 'public' : 'private';
  return `
    <a href="#/memory/${m.id}" style="text-decoration: none; color: inherit;">
      <div class="card">
        <div class="meta">${date} · ${m.location || 'somewhere'} · ${visibility}</div>
        <div class="song">${escapeHtml(m.song?.name || 'Untitled')}</div>
        <div class="meta">${escapeHtml(artists)}</div>
        ${m.note ? `<div class="note">"${escapeHtml(m.note)}"</div>` : ''}
      </div>
    </a>
  `;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
