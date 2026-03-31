// main.js — Orchestrator: state, navigation, UI, Firebase callbacks
import {
  initWorld, animate, moveElevator,
  addRemoteUser, removeRemoteUser, updateRemoteUser,
  addContentNode, getNeighbourPreview,
  getExploredCells,
  rotateCameraByDelta, zoomCameraByDelta,
} from './world3D.js';

import {
  initFirebase, registerCallbacks,
  broadcastPosition, postContent, queueCellBroadcast,
  localUserId, localColor, localName,
} from './firebase.js';

import {
  initVideoScreen, setBasePrompt, getBasePrompt,
  generateVideo, onPositionChange, placeImageInWorld,
} from './ImageGen.js';

// ── State ─────────────────────────────────────────────────────────────────────
const STEP  = 6;
const myPos = { x: 50, y: 50, z: 50 };

// ── Arrow hint text ───────────────────────────────────────────────────────────
const HINT = {
  up:       { label: 'more resonance',  desc: 'aligned wavelengths — harmony, shared frequency' },
  down:     { label: 'more friction',   desc: 'challenge & tension — productive disagreement' },
  right:    { label: 'more private',    desc: 'intimate space — vulnerable, one-to-one exchange' },
  left:     { label: 'more public',     desc: 'broadcast mode — open presence, wide audience' },
  forward:  { label: 'more urgent',     desc: 'high intensity — kinetic, time-sensitive energy' },
  backward: { label: 'more ambient',    desc: 'contemplative depth — slow, background presence' },
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  document.getElementById('loading-sub').textContent = 'building the world...';
  initWorld();
  animate();

  // Init video screen (must happen after initWorld so elevatorGroup exists)
  initVideoScreen();

  document.getElementById('loading-sub').textContent = 'connecting presence...';
  registerCallbacks({
    onUserJoined:   handleUserJoined,
    onUserLeft:     handleUserLeft,
    onUserMoved:    handleUserMoved,
    onContentAdded: handleContentAdded,
    onImageAdded:   handleImageAdded,
  });

  const { color, name } = await initFirebase();
  showMyself(name, color);
  document.getElementById('loading').style.display = 'none';

  moveElevator(myPos.x, myPos.y, myPos.z);
  await broadcastPosition({ ...myPos });
  updateHUD();

  // HUD toggle
  document.getElementById('hud-toggle').addEventListener('click', () => {
    document.getElementById('hud').classList.toggle('open');
  });

  setupArrows();
  setupKeyboard();
  setupPostUI();
  setupGestures();
}

// ── Navigation ────────────────────────────────────────────────────────────────
function move(dir) {
  const prev = { ...myPos };

  switch (dir) {
    case 'up':       myPos.y = Math.min(100, myPos.y + STEP); break;
    case 'down':     myPos.y = Math.max(0,   myPos.y - STEP); break;
    case 'right':    myPos.x = Math.min(100, myPos.x + STEP); break;
    case 'left':     myPos.x = Math.max(0,   myPos.x - STEP); break;
    case 'forward':  myPos.z = Math.min(100, myPos.z + STEP); break;
    case 'backward': myPos.z = Math.max(0,   myPos.z - STEP); break;
  }

  if (JSON.stringify(prev) !== JSON.stringify(myPos)) {
    moveElevator(myPos.x, myPos.y, myPos.z);
    broadcastPosition({ ...myPos });
    queueCellBroadcast(getExploredCells());
    updateHUD();

    // Morph the image based on new position (debounced inside onPositionChange)
    onPositionChange({ ...myPos });
  }
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function updateHUD() {
  [
    { barId: 'bar-x', valId: 'val-x', v: myPos.x },
    { barId: 'bar-y', valId: 'val-y', v: myPos.y },
    { barId: 'bar-z', valId: 'val-z', v: myPos.z },
  ].forEach(({ barId, valId, v }) => {
    document.getElementById(barId).style.width = v + '%';
    document.getElementById(valId).textContent  = Math.round(v);
  });
}

// ── Arrow buttons ──────────────────────────────────────────────────────────────
function setupArrows() {
  const tooltip = document.getElementById('hint-tooltip');

  document.querySelectorAll('.nav-arrow').forEach(btn => {
    const dir = btn.dataset.dir;
    btn.addEventListener('click', () => move(dir));

    btn.addEventListener('mouseenter', () => {
      const h      = HINT[dir];
      const nearby = getNeighbourPreview(dir, myPos, STEP);
      const base   = getBasePrompt();

      // Preview how the prompt would change in this direction
      let promptPreview = '';
      if (base) {
        const nextPos = { ...myPos };
        switch (dir) {
          case 'up':       nextPos.y = Math.min(100, nextPos.y + STEP); break;
          case 'down':     nextPos.y = Math.max(0,   nextPos.y - STEP); break;
          case 'right':    nextPos.x = Math.min(100, nextPos.x + STEP); break;
          case 'left':     nextPos.x = Math.max(0,   nextPos.x - STEP); break;
          case 'forward':  nextPos.z = Math.min(100, nextPos.z + STEP); break;
          case 'backward': nextPos.z = Math.max(0,   nextPos.z - STEP); break;
        }
        const vibeX = nextPos.x > 60 ? 'intimate' : nextPos.x < 40 ? 'public' : '';
        const vibeY = nextPos.y > 60 ? 'resonant' : nextPos.y < 40 ? 'tense' : '';
        const vibeZ = nextPos.z > 60 ? 'urgent'   : nextPos.z < 40 ? 'ambient' : '';
        const vibes = [vibeX, vibeY, vibeZ].filter(Boolean);
        if (vibes.length) promptPreview = `video shifts: ${vibes.join(' + ')}`;
      }

      tooltip.innerHTML =
        `<strong>${h.label}</strong>${h.desc}` +
        (promptPreview ? `<div class="nearby">${promptPreview}</div>` : '') +
        (nearby        ? `<div class="nearby">nearby: ${nearby}</div>` : '');

      const rect = btn.getBoundingClientRect();
      tooltip.style.left = Math.max(0, rect.left + rect.width / 2 - 110) + 'px';
      tooltip.style.top  = Math.max(0, rect.top - 100) + 'px';
      tooltip.classList.add('visible');
    });

    btn.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
  });
}

// ── Gesture Control ───────────────────────────────────────────────────────────
function setupGestures() {
  // Right hand index finger movement tracking
  let handAccumX = 0;
  let handAccumY = 0;
  const HAND_THRESHOLD = 0.12; // Threshold for triggering movement — deliberate pace

  window.addEventListener('gesture:rightHandMove', (e) => {
    const { deltaX, deltaY } = e.detail;

    // Accumulate deltas (camera is mirrored so invert X)
    handAccumX -= deltaX;
    handAccumY += deltaY;

    // Check if we've crossed the threshold to trigger movement
    if (Math.abs(handAccumX) > HAND_THRESHOLD) {
      move(handAccumX > 0 ? 'right' : 'left');
      handAccumX = 0;
    }
    if (Math.abs(handAccumY) > HAND_THRESHOLD) {
      move(handAccumY > 0 ? 'down' : 'up');
      handAccumY = 0;
    }
  });

  // Left hand rotation (swipe) — direct call, no dynamic import
  window.addEventListener('gesture:leftHandRotate', (e) => {
    const { direction, magnitude } = e.detail;
    const deltaTheta = direction === 'right' ? magnitude * 1.5 : -magnitude * 1.5;
    rotateCameraByDelta(deltaTheta);
  });

  // Left hand zoom (pinch) — direct call
  window.addEventListener('gesture:leftHandZoom', (e) => {
    const { direction, magnitude } = e.detail;
    const deltaRadius = direction === 'in' ? -magnitude * 30 : magnitude * 30;
    zoomCameraByDelta(deltaRadius);
  });

  console.log('Gesture control system initialized');
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function setupKeyboard() {
  const map = {
    ArrowUp: 'up', ArrowDown: 'down',
    ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'forward', KeyS: 'backward',
    KeyE: 'forward', KeyQ: 'backward',
  };
  window.addEventListener('keydown', e => {
    if (e.code in map && !e.target.matches('input')) {
      e.preventDefault();
      move(map[e.code]);
    }
  });
}

// ── Post UI ───────────────────────────────────────────────────────────────────
function setupPostUI() {
  const input = document.getElementById('post-input');
  const btn   = document.getElementById('post-btn');

  const submit = async () => {
    const text = input.value.trim();
    if (!text) return;

    // 1. Set as new video seed and immediately generate
    setBasePrompt(text);
    generateVideo(text, { ...myPos });

    // 2. Also store in Firebase as a spatial thought node
    btn.textContent = 'transmitting...';
    btn.disabled    = true;
    await postContent(text, { ...myPos });
    input.value     = '';
    btn.textContent = 'transmit';
    btn.disabled    = false;
  };

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

// ── My identity ───────────────────────────────────────────────────────────────
function showMyself(name, color) {
  const panel = document.getElementById('users-panel');
  panel.querySelector('.no-users')?.remove();
  const hex   = '#' + color.toString(16).padStart(6, '0');
  const row   = document.createElement('div');
  row.className = 'user-entry';
  row.style.marginBottom = '4px';
  row.innerHTML = `<span class="user-dot" style="background:${hex};box-shadow:0 0 6px ${hex}88"></span>
    <span style="color:${hex};opacity:0.9;font-size:10px">${name}</span>
    <span style="color:rgba(255,255,255,0.18);font-size:8px"> you</span>`;
  panel.prepend(row);
}

// ── Firebase event handlers ───────────────────────────────────────────────────
function handleUserJoined(userId, data) {
  addRemoteUser(userId, data.position, data.color, data.displayName);
  appendUserRow(userId, data);
}
function handleUserLeft(userId) {
  removeRemoteUser(userId);
  document.getElementById(`user-row-${userId}`)?.remove();
}
function handleUserMoved(userId, data) {
  updateRemoteUser(userId, data.position, data.color, data.displayName);
}
function handleContentAdded(contentId, data) {
  addContentNode(contentId, data);
  flashContentNotice(data);
}

function handleImageAdded(imageId, data) {
  if (!data?.url || !data?.embedPos) return;
  placeImageInWorld(data.url, data.embedPos);
}

function appendUserRow(userId, data) {
  const panel = document.getElementById('users-panel');
  // Remove "no others" placeholder if present
  panel.querySelector('.no-users')?.remove();
  const hex   = '#' + (data.color ?? 0xffffff).toString(16).padStart(6, '0');
  const row   = document.createElement('div');
  row.id        = `user-row-${userId}`;
  row.className = 'user-entry';
  row.innerHTML = `<span class="user-dot" style="background:${hex};box-shadow:0 0 6px ${hex}88"></span>
    <span style="color:${hex};opacity:0.85;font-size:10px">${data.displayName ?? userId.slice(0,6)}</span>`;
  panel.appendChild(row);
}

function flashContentNotice(data) {
  const notice = document.createElement('div');
  notice.className = 'content-flash';
  notice.textContent = `${data.authorName ?? '?'}: "${(data.text ?? '').slice(0, 80)}"`;
  document.body.appendChild(notice);
  setTimeout(() => { notice.style.opacity = '0'; }, 3500);
  setTimeout(() => { notice.remove(); }, 4700);
}

init().catch(console.error);
