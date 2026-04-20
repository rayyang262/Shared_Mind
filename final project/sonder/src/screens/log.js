import { createMemory } from '../firebase.js';
import { searchTracks, setToken, getToken } from '../spotify.js';
import { navigate } from '../router.js';

let selectedSong = null;

export function renderLog(root) {
  selectedSong = null;
  root.innerHTML = `
    <h1>Log a memory</h1>

    ${getToken() ? '' : `
      <div class="card">
        <label>Spotify token (temporary — paste from developer.spotify.com/console)</label>
        <input id="tokenInput" type="text" placeholder="BQC..." />
        <button id="saveToken">Save token</button>
      </div>
    `}

    <div class="card">
      <label>Search a song</label>
      <input id="search" type="text" placeholder="Try: 'sweater weather'" />
      <div id="results"></div>
    </div>

    <div class="card">
      <label>The memory</label>
      <textarea id="note" placeholder="What was happening? Who was there?"></textarea>

      <label>Where</label>
      <input id="location" type="text" placeholder="City, place, room — anything" />

      <label>When</label>
      <input id="date" type="date" />

      <div class="toggle-row">
        <input id="isPublic" type="checkbox" checked />
        <label for="isPublic" style="margin: 0;">Make this public (default)</label>
      </div>

      <div id="err" class="error"></div>
      <button id="save">Save memory</button>
    </div>
  `;

  // default date = today
  root.querySelector('#date').value = new Date().toISOString().slice(0, 10);

  const tokenBtn = root.querySelector('#saveToken');
  if (tokenBtn) {
    tokenBtn.onclick = () => {
      const v = root.querySelector('#tokenInput').value.trim();
      if (v) { setToken(v); renderLog(root); }
    };
  }

  // Debounced search
  let timer;
  root.querySelector('#search').oninput = (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    const results = root.querySelector('#results');
    if (!q) { results.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      results.innerHTML = 'Searching…';
      try {
        const tracks = await searchTracks(q);
        results.innerHTML = tracks.map((t, i) => `
          <div class="card" data-i="${i}" style="cursor: pointer; display: flex; gap: 0.75rem; align-items: center;">
            ${t.albumArt ? `<img src="${t.albumArt}" width="48" height="48" style="border-radius: 6px;" />` : ''}
            <div>
              <div class="song">${escapeHtml(t.name)}</div>
              <div class="meta">${escapeHtml(t.artists.join(', '))}</div>
            </div>
          </div>
        `).join('');
        results.querySelectorAll('[data-i]').forEach((el) => {
          el.onclick = () => {
            selectedSong = tracks[Number(el.dataset.i)];
            results.innerHTML = `
              <div class="card" style="border-color: var(--accent);">
                <div class="meta">selected</div>
                <div class="song">${escapeHtml(selectedSong.name)}</div>
                <div class="meta">${escapeHtml(selectedSong.artists.join(', '))}</div>
              </div>
            `;
          };
        });
      } catch (err) {
        results.innerHTML = `<div class="error">${err.message}</div>`;
      }
    }, 300);
  };

  root.querySelector('#save').onclick = async () => {
    const err = root.querySelector('#err');
    err.textContent = '';
    if (!selectedSong) { err.textContent = 'Pick a song first.'; return; }
    try {
      await createMemory({
        song: selectedSong,
        note: root.querySelector('#note').value.trim(),
        location: root.querySelector('#location').value.trim(),
        photoUrl: null, // photo upload comes next session
        date: root.querySelector('#date').value,
        isPublic: root.querySelector('#isPublic').checked
      });
      navigate('/');
    } catch (e) {
      err.textContent = e.message;
    }
  };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
