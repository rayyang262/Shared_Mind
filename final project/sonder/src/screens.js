// ============================================================================
//  SONDER — ALL SCREENS
// ============================================================================
//  Use ctrl-F (cmd-F) to jump to a section:
//     [LOGIN]      sign in / sign up
//     [FEED]       your own memories
//     [LOG]        log a new memory (Spotify search + form)
//     [MEMORY]     single memory detail + comments
//     [DISCOVERY]  Three.js constellation
//     [PROFILE]    account info + sign out
// ============================================================================

import {
  auth, logout,
  signInEmail, signUpEmail, signInGoogle,
  createMemory, getMyMemories, getMemory, getPublicMemories, getFeedMemories,
  addComment, getComments
} from './firebase.js';
import { searchTracks, startLogin, isConnected, disconnect } from './spotify.js';
import { navigate } from './main.js';
import * as THREE from 'three';

// ----------------------------------------------------------------------------
// shared helper — escape user-provided strings before injecting into HTML
// ----------------------------------------------------------------------------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}


// ============================================================================
//  [LOGIN]  sign in / sign up
// ============================================================================
export function renderLogin(root) {
  root.innerHTML = `
    <h1>Sonder</h1>
    <p style="color: var(--text-dim); margin-bottom: 2rem;">
      A place for the songs that mean something.
    </p>

    <div class="card">
      <label>Email</label>
      <input id="email" type="email" placeholder="you@example.com" />
      <label>Password</label>
      <input id="password" type="password" placeholder="••••••••" />
      <div id="err" class="error"></div>
      <div style="display: flex; gap: 0.5rem;">
        <button id="signin">Sign in</button>
        <button id="signup" class="ghost">Create account</button>
      </div>
      <div style="margin-top: 1rem; text-align: center; color: var(--text-dim);">— or —</div>
      <button id="google" class="ghost" style="width: 100%; margin-top: 1rem;">Continue with Google</button>
    </div>
  `;

  const err = root.querySelector('#err');
  const showErr = (e) => { err.textContent = e.message || String(e); };
  const email = () => root.querySelector('#email').value;
  const pw = () => root.querySelector('#password').value;

  root.querySelector('#signin').onclick = async () => {
    err.textContent = '';
    try { await signInEmail(email(), pw()); } catch (e) { showErr(e); }
  };
  root.querySelector('#signup').onclick = async () => {
    err.textContent = '';
    try { await signUpEmail(email(), pw()); } catch (e) { showErr(e); }
  };
  root.querySelector('#google').onclick = async () => {
    err.textContent = '';
    try { await signInGoogle(); } catch (e) { showErr(e); }
  };
}


// ============================================================================
//  [FEED]  your own memories + everyone else's public ones, newest first
// ============================================================================
export async function renderFeed(root) {
  root.innerHTML = `<h1>Feed</h1><div id="list">Loading…</div>`;
  const list = root.querySelector('#list');
  const currentUid = auth.currentUser?.uid;

  try {
    const memories = await getFeedMemories();
    if (memories.length === 0) {
      list.innerHTML = `
        <div class="empty">
          Nothing yet. <a href="#/log">Log your first memory →</a>
        </div>`;
      return;
    }
    list.innerHTML = memories.map((m) => memoryCard(m, currentUid)).join('');
  } catch (e) {
    list.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

function memoryCard(m, currentUid) {
  const artists = m.song?.artists?.join(', ') || '';
  const date = m.date ? new Date(m.date).toLocaleDateString() : '';
  const isMine = m.uid === currentUid;
  const author = isMine ? 'you' : (m.authorName || m.authorEmail || 'someone');
  const visibility = isMine ? (m.isPublic ? 'public' : 'private') : 'public';
  return `
    <a href="#/memory/${m.id}" style="text-decoration: none; color: inherit;">
      <div class="card"${isMine ? ' style="border-left: 2px solid var(--accent);"' : ''}>
        <div class="meta">${esc(author)} · ${date} · ${esc(m.location || 'somewhere')} · ${visibility}</div>
        <div class="song">${esc(m.song?.name || 'Untitled')}</div>
        <div class="meta">${esc(artists)}</div>
        ${m.note ? `<div class="note">"${esc(m.note)}"</div>` : ''}
      </div>
    </a>`;
}


// ============================================================================
//  [LOG]  log a new memory (Spotify search + form)
// ============================================================================
let selectedSong = null;

export function renderLog(root) {
  selectedSong = null;
  root.innerHTML = `
    <h1>Log a memory</h1>

    ${isConnected() ? '' : `
      <div class="card">
        <label>Connect Spotify to search songs</label>
        <button id="connectSpotify">Connect Spotify</button>
      </div>`}

    <div class="card">
      <label>Search a song</label>
      <input id="search" type="text" placeholder="Try: 'sweater weather'" ${isConnected() ? '' : 'disabled'} />
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

  // Spotify connect button (if not connected)
  const connectBtn = root.querySelector('#connectSpotify');
  if (connectBtn) {
    connectBtn.onclick = () => startLogin();
  }

  // debounced spotify search
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
              <div class="song">${esc(t.name)}</div>
              <div class="meta">${esc(t.artists.join(', '))}</div>
            </div>
          </div>`).join('');
        results.querySelectorAll('[data-i]').forEach((el) => {
          el.onclick = () => {
            selectedSong = tracks[Number(el.dataset.i)];
            results.innerHTML = `
              <div class="card" style="border-color: var(--accent);">
                <div class="meta">selected</div>
                <div class="song">${esc(selectedSong.name)}</div>
                <div class="meta">${esc(selectedSong.artists.join(', '))}</div>
              </div>`;
          };
        });
      } catch (err) {
        results.innerHTML = `<div class="error">${esc(err.message)}</div>`;
      }
    }, 300);
  };

  // save memory
  root.querySelector('#save').onclick = async () => {
    const err = root.querySelector('#err');
    err.textContent = '';
    if (!selectedSong) { err.textContent = 'Pick a song first.'; return; }
    try {
      await createMemory({
        song: selectedSong,
        note: root.querySelector('#note').value.trim(),
        location: root.querySelector('#location').value.trim(),
        photoUrl: null, // photo upload comes later
        date: root.querySelector('#date').value,
        isPublic: root.querySelector('#isPublic').checked
      });
      navigate('/');
    } catch (e) {
      err.textContent = e.message;
    }
  };
}


// ============================================================================
//  [MEMORY]  single memory detail + comments
// ============================================================================
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
      <h1 style="margin-top: 1rem;">${esc(m.song?.name || 'Untitled')}</h1>
      <div class="meta" style="margin-bottom: 1rem;">
        ${esc(artists)} · ${date} · ${esc(m.location || 'somewhere')}
      </div>
      ${m.note ? `<p style="font-style: italic; color: var(--text-dim);">"${esc(m.note)}"</p>` : ''}

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
                <div class="meta">${esc(c.email || 'someone')}</div>
                <div>${esc(c.text)}</div>
              </div>`).join('');
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
    root.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}


// ============================================================================
//  [DISCOVERY]  Three.js constellation of all public memories
// ============================================================================
//  Each user's memories share a color and are linked by lines (constellation).
//  Real UMAP coords come from Cloud Function in Week 3 — for now, random scatter.
// ============================================================================
let discoveryAnimationId = null;

export async function renderDiscovery(root) {
  if (discoveryAnimationId) cancelAnimationFrame(discoveryAnimationId);

  root.innerHTML = `
    <h1>Discovery</h1>
    <p style="color: var(--text-dim);">Each point is a memory. Constellations belong to one user.</p>
    <div id="canvas" style="width: 100%; height: 500px; border-radius: var(--radius); overflow: hidden; background: #02030a;"></div>
  `;

  let memories = [];
  try { memories = await getPublicMemories(); } catch (e) { /* show empty */ }

  const container = root.querySelector('#canvas');
  const w = container.clientWidth;
  const h = 500;

  // --- scene + camera + renderer ---
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
  camera.position.z = 8;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // --- group memories by user → one constellation per user ---
  const byUser = new Map();
  for (const m of memories) {
    if (!byUser.has(m.uid)) byUser.set(m.uid, []);
    byUser.get(m.uid).push(m);
  }

  // fallback fake data so the scene isn't empty
  if (byUser.size === 0) {
    for (let u = 0; u < 5; u++) {
      const fakes = [];
      for (let i = 0; i < 4; i++) fakes.push({ id: `fake-${u}-${i}` });
      byUser.set(`user-${u}`, fakes);
    }
  }

  // --- draw each user's constellation ---
  const colors = [0xb794ff, 0xff7ab8, 0x7adfff, 0xffd66e, 0x9bff7a];
  let userIdx = 0;
  for (const [uid, mems] of byUser) {
    const color = colors[userIdx % colors.length];
    userIdx++;
    const anchor = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 4
    );
    const positions = mems.map(() => new THREE.Vector3(
      anchor.x + (Math.random() - 0.5) * 1.5,
      anchor.y + (Math.random() - 0.5) * 1.5,
      anchor.z + (Math.random() - 0.5) * 1.5
    ));
    // points
    const geom = new THREE.BufferGeometry().setFromPoints(positions);
    scene.add(new THREE.Points(geom, new THREE.PointsMaterial({ color, size: 0.18, sizeAttenuation: true })));
    // connecting lines
    if (positions.length > 1) {
      const lineGeom = new THREE.BufferGeometry().setFromPoints(positions);
      scene.add(new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 })));
    }
  }

  // --- background stars ---
  const starGeom = new THREE.BufferGeometry();
  const starPositions = [];
  for (let i = 0; i < 800; i++) {
    starPositions.push(
      (Math.random() - 0.5) * 60,
      (Math.random() - 0.5) * 60,
      (Math.random() - 0.5) * 60
    );
  }
  starGeom.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  scene.add(new THREE.Points(starGeom, new THREE.PointsMaterial({ color: 0xffffff, size: 0.04, transparent: true, opacity: 0.5 })));

  // --- animate ---
  const animate = () => {
    discoveryAnimationId = requestAnimationFrame(animate);
    scene.rotation.y += 0.0015;
    scene.rotation.x += 0.0005;
    renderer.render(scene, camera);
  };
  animate();
}


// ============================================================================
//  [PROFILE]  account info + Spotify token status + sign out
// ============================================================================
export function renderProfile(root) {
  const user = auth.currentUser;
  const connected = isConnected();
  root.innerHTML = `
    <h1>Profile</h1>
    <div class="card">
      <div class="meta">Signed in as</div>
      <div class="song">${esc(user?.email || user?.displayName || 'unknown')}</div>
    </div>

    <div class="card">
      <div class="meta">Spotify</div>
      <div style="margin-bottom: 1rem;">${connected ? 'Connected ✓' : 'Not connected'}</div>
      ${connected
        ? `<button id="disconnectSpotify" class="ghost">Disconnect Spotify</button>`
        : `<button id="connectSpotify">Connect Spotify</button>`}
    </div>

    <button id="logout" class="ghost">Sign out</button>
  `;
  const connectBtn = root.querySelector('#connectSpotify');
  const disconnectBtn = root.querySelector('#disconnectSpotify');
  if (connectBtn)    connectBtn.onclick    = () => startLogin();
  if (disconnectBtn) disconnectBtn.onclick = () => { disconnect(); renderProfile(root); };
  root.querySelector('#logout').onclick = () => logout();
}
