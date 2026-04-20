import { getMemory, getComments, addComment } from '../firebase.js';

export async function renderMemory(root, id) {
  if (!id) { root.innerHTML = `<div class="empty">No memory selected.</div>`; return; }
  root.innerHTML = `Loading…`;

  try {
    const m = await getMemory(id);
    if (!m) { root.innerHTML = `<div class="empty">Not found.</div>`; return; }

    const artists = m.song?.artists?.join(', ') || '';
    const date = m.date ? new Date(m.date).toLocaleDateString() : '';

    root.innerHTML = `
      <a href="#/" style="color: var(--text-dim);">← back</a>
      <h1 style="margin-top: 1rem;">${escapeHtml(m.song?.name || 'Untitled')}</h1>
      <div class="meta" style="margin-bottom: 1rem;">
        ${escapeHtml(artists)} · ${date} · ${escapeHtml(m.location || 'somewhere')}
      </div>
      ${m.note ? `<p style="font-style: italic; color: var(--text-dim);">"${escapeHtml(m.note)}"</p>` : ''}

      ${m.isPublic ? `
        <h2 style="margin-top: 2rem;">Comments</h2>
        <div id="comments">Loading…</div>
        <div class="card" style="margin-top: 1rem;">
          <textarea id="commentText" placeholder="Say something…"></textarea>
          <button id="postComment">Post</button>
        </div>
      ` : `<p class="empty">Private memory · only visible to you.</p>`}
    `;

    if (m.isPublic) {
      const list = root.querySelector('#comments');
      const refresh = async () => {
        const comments = await getComments(id);
        list.innerHTML = comments.length === 0
          ? `<div class="empty">No comments yet.</div>`
          : comments.map((c) => `
              <div class="card">
                <div class="meta">${escapeHtml(c.email || 'someone')}</div>
                <div>${escapeHtml(c.text)}</div>
              </div>
            `).join('');
      };
      refresh();
      root.querySelector('#postComment').onclick = async () => {
        const text = root.querySelector('#commentText').value.trim();
        if (!text) return;
        await addComment(id, text);
        root.querySelector('#commentText').value = '';
        refresh();
      };
    }
  } catch (e) {
    root.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
