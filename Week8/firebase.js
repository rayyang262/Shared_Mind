// firebase.js — Firebase Realtime Database + Google / Email Auth
// Handles: presence (user positions), content nodes, explored cell sharing

import { initializeApp }      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getDatabase, ref, set, push, onDisconnect,
  onChildAdded, onChildChanged, onChildRemoved, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// ── Config ────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyBmXSuLjHRF1-JerUfXVp7qbwlRUj2aSPY',
  authDomain:        'elevator-world.firebaseapp.com',
  projectId:         'elevator-world',
  storageBucket:     'elevator-world.firebasestorage.app',
  messagingSenderId: '681903564322',
  appId:             '1:681903564322:web:1be8978f3ecc1b0d770c7b',
  measurementId:     'G-2WMJKBYVDX',
  databaseURL:       'https://elevator-world-default-rtdb.firebaseio.com',
};

// ── Random user identity ───────────────────────────────────────────────────────
const PALETTES = [
  0xff6b6b, 0x6bffb8, 0x6bb8ff, 0xffb86b,
  0xd46bff, 0xff6bd4, 0x6bffd4, 0xffff6b,
];
const ADJS  = ['wandering','silent','curious','drifting','distant','gentle','restless','lucid'];
const NOUNS = ['ember','signal','echo','vessel','current','witness','dusk','cipher'];

export let localUserId   = null;
export let localColor    = null;
export let localName     = null;

let db;
let userRef = null;

// Callbacks registered by main.js
let _onUserJoined   = () => {};
let _onUserLeft     = () => {};
let _onUserMoved    = () => {};
let _onContentAdded = () => {};
let _onImageAdded   = () => {};

export function registerCallbacks({ onUserJoined, onUserLeft, onUserMoved, onContentAdded, onImageAdded = () => {} }) {
  _onUserJoined   = onUserJoined;
  _onUserLeft     = onUserLeft;
  _onUserMoved    = onUserMoved;
  _onContentAdded = onContentAdded;
  _onImageAdded   = onImageAdded;
}

// ── Init ───────────────────────────────────────────────────────────────────────
// Expects the user to already be signed in via login.html.
// If not signed in, redirects back to login.html.
export async function initFirebase() {
  // Assign a colour for this session
  localColor = PALETTES[Math.floor(Math.random() * PALETTES.length)];

  let app, auth;
  try {
    app  = initializeApp(firebaseConfig);
    db   = getDatabase(app);
    auth = getAuth(app);
  } catch (e) {
    console.error('[firebase] init failed:', e.message);
    window.location.href = './login.html';
    return;
  }

  return new Promise(resolve => {
    onAuthStateChanged(auth, async user => {
      if (!user) {
        // Not signed in — send back to login
        window.location.href = './login.html';
        return;
      }

      localUserId = user.uid;

      // Use real display name (Google) or email prefix, fall back to poetic name
      const emailName = user.email ? user.email.split('@')[0] : null;
      const poeticName = ADJS[Math.floor(Math.random() * ADJS.length)]
                       + ' ' + NOUNS[Math.floor(Math.random() * NOUNS.length)];
      localName = user.displayName || emailName || poeticName;

      // Write presence entry
      userRef = ref(db, `elevatorWorld/users/${localUserId}`);
      const initialData = {
        position:    { x: 50, y: 50, z: 50 },
        color:       localColor,
        displayName: localName,
        joinedAt:    serverTimestamp(),
      };

      try {
        await set(userRef, initialData);
        onDisconnect(userRef).remove();
      } catch (e) {
        console.warn('[firebase] RTDB write failed — check database rules:', e.message);
        resolve({ userId: localUserId, color: localColor, name: localName });
        return;
      }

      // Subscribe to other users
      const usersRef = ref(db, 'elevatorWorld/users');
      onChildAdded(usersRef, snap => {
        if (snap.key === localUserId) return;
        _onUserJoined(snap.key, snap.val());
      });
      onChildChanged(usersRef, snap => {
        if (snap.key === localUserId) return;
        _onUserMoved(snap.key, snap.val());
      });
      onChildRemoved(usersRef, snap => {
        if (snap.key === localUserId) return;
        _onUserLeft(snap.key);
      });

      // Subscribe to content
      const contentRef = ref(db, 'elevatorWorld/content');
      onChildAdded(contentRef, snap => {
        _onContentAdded(snap.key, snap.val());
      });

      // Subscribe to images — fires for all existing + new ones
      const imagesRef = ref(db, 'elevatorWorld/images');
      onChildAdded(imagesRef, snap => {
        _onImageAdded(snap.key, snap.val());
      });

      resolve({ userId: localUserId, color: localColor, name: localName });
    });
  });
}

// ── Broadcast my position ──────────────────────────────────────────────────────
export async function broadcastPosition(pos) {
  if (!userRef) return;  // silently skip in local-only mode
  try {
    await set(ref(db, `elevatorWorld/users/${localUserId}/position`), pos);
  } catch (e) { /* ignore — local-only mode */ }
}

// ── Broadcast explored cells (throttled) ──────────────────────────────────────
let cellBroadcastTimer = null;
let pendingCells = new Set();

export function queueCellBroadcast(cellKeys) {
  if (!userRef) return;  // local-only mode — skip
  cellKeys.forEach(k => pendingCells.add(k));
  if (cellBroadcastTimer) return;
  cellBroadcastTimer = setTimeout(async () => {
    cellBroadcastTimer = null;
    if (!userRef || pendingCells.size === 0) return;
    const update = {};
    pendingCells.forEach(k => { update[k.replace(/,/g, '_')] = true; });
    try { await set(ref(db, `elevatorWorld/exploredCells`), update); } catch (e) {}
    pendingCells.clear();
  }, 3000);
}

// ── Post a thought at current position ────────────────────────────────────────
export async function postContent(text, position) {
  if (!db || !userRef) return;
  const contentRef = ref(db, 'elevatorWorld/content');
  await push(contentRef, {
    text,
    position,
    authorId:   localUserId,
    authorName: localName,
    color:      localColor,
    timestamp:  serverTimestamp(),
  });
}

// ── Save a generated image so all users can see it ────────────────────────────
export async function postImage(url, embedPos, prompt) {
  if (!db || !userRef) return null;
  const imagesRef = ref(db, 'elevatorWorld/images');
  const snap = await push(imagesRef, {
    url,
    embedPos,
    prompt,
    authorId:   localUserId,
    authorName: localName,
    color:      localColor,
    timestamp:  serverTimestamp(),
  });
  return snap.key;
}
