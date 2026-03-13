// firebase.js — Firebase Realtime Database + Anonymous Auth
// Handles: presence (user positions), content nodes, explored cell sharing
//
// ⚠️ SETUP REQUIRED:
//   1. In your Firebase console → Realtime Database → create database
//      (the URL is auto-generated as https://ginsengmuseum-default-rtdb.firebaseio.com)
//   2. Set rules to allow authenticated reads/writes:
//      { "rules": { ".read": "auth != null", ".write": "auth != null" } }
//   3. Enable Anonymous Auth: Firebase console → Authentication → Sign-in method → Anonymous

import { initializeApp }      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged }
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

export function registerCallbacks({ onUserJoined, onUserLeft, onUserMoved, onContentAdded }) {
  _onUserJoined   = onUserJoined;
  _onUserLeft     = onUserLeft;
  _onUserMoved    = onUserMoved;
  _onContentAdded = onContentAdded;
}

// ── Init ───────────────────────────────────────────────────────────────────────
// Falls back to local-only (guest) mode if Firebase auth/RTDB isn't enabled yet.
export async function initFirebase() {
  // Always assign a local identity first so the world loads regardless
  localColor = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  localName  = ADJS[Math.floor(Math.random() * ADJS.length)]
             + ' ' + NOUNS[Math.floor(Math.random() * NOUNS.length)];
  localUserId = 'guest-' + Math.random().toString(36).slice(2, 8);

  let app, auth;
  try {
    app  = initializeApp(firebaseConfig);
    db   = getDatabase(app);
    auth = getAuth(app);
  } catch (e) {
    console.warn('[firebase] init failed — running in local-only mode:', e.message);
    return { userId: localUserId, color: localColor, name: localName };
  }

  try {
    await signInAnonymously(auth);
  } catch (e) {
    // auth/admin-restricted-operation = Anonymous Auth not enabled in console
    console.warn('[firebase] Anonymous Auth failed — running in local-only mode.\n' +
      '  → Enable it: Firebase Console → Authentication → Sign-in method → Anonymous → Enable\n' +
      '  Error:', e.message);
    showFirebaseHint();
    return { userId: localUserId, color: localColor, name: localName };
  }

  return new Promise(resolve => {
    onAuthStateChanged(auth, async user => {
      if (!user) return;

      localUserId = user.uid;

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
        showFirebaseHint('RTDB rules');
        resolve({ userId: localUserId, color: localColor, name: localName });
        return;
      }

      // Auto-remove on disconnect

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

      resolve({ userId: localUserId, color: localColor, name: localName });
    });
  });
}

// ── Firebase setup hint (shown once on screen) ────────────────────────────────
function showFirebaseHint(detail = 'Anonymous Auth') {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; bottom:20px; right:20px; z-index:200;
    background:rgba(20,0,0,0.9); border:1px solid rgba(255,80,80,0.5);
    color:rgba(255,160,160,0.9); padding:12px 16px; font-size:10px;
    font-family:'Courier New',monospace; max-width:300px; line-height:1.7;
  `;
  el.innerHTML =
    `<strong style="color:#ff6b6b">Firebase not connected (${detail})</strong><br>` +
    `Running in local-only mode — world works, no multi-user.<br><br>` +
    `To enable multi-user:<br>` +
    `1. Firebase Console → Auth → Sign-in method → <b>Anonymous → Enable</b><br>` +
    `2. Realtime Database → Create database (US region)<br>` +
    `3. Rules: <code>".read/.write": "auth != null"</code><br><br>` +
    `<span style="cursor:pointer;text-decoration:underline" onclick="this.parentElement.remove()">dismiss</span>`;
  document.body.appendChild(el);
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
  if (!db || !userRef) return;  // local-only mode
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
