import { onAuth, logout } from './firebase.js';
import { route, rerender, start } from './router.js';

import { renderLogin } from './screens/login.js';
import { renderFeed } from './screens/feed.js';
import { renderLog } from './screens/log.js';
import { renderMemory } from './screens/memory.js';
import { renderDiscovery } from './screens/discovery.js';
import { renderProfile } from './screens/profile.js';

let currentUser = null;
let authReady = false;

// --- Routes ---
route('/', (root) => {
  if (!authReady) { root.innerHTML = ''; return; } // wait for first auth state
  if (!currentUser) return renderLogin(root);
  return renderFeed(root);
});
route('/log', (root) => currentUser ? renderLog(root) : renderLogin(root));
route('/memory', (root, id) => currentUser ? renderMemory(root, id) : renderLogin(root));
route('/discovery', (root) => currentUser ? renderDiscovery(root) : renderLogin(root));
route('/profile', (root) => currentUser ? renderProfile(root) : renderLogin(root));

// --- Nav ---
function renderNav() {
  const nav = document.getElementById('nav');
  if (!currentUser) {
    nav.innerHTML = `<div class="brand">SONDER</div>`;
    return;
  }
  nav.innerHTML = `
    <a href="#/" class="brand">SONDER</a>
    <div class="links">
      <a href="#/">Feed</a>
      <a href="#/log">Log</a>
      <a href="#/discovery">Discovery</a>
      <a href="#/profile">Profile</a>
      <a href="#" id="logoutLink">Logout</a>
    </div>
  `;
  document.getElementById('logoutLink').onclick = (e) => {
    e.preventDefault();
    logout();
  };
}

// --- Boot ---
onAuth((user) => {
  currentUser = user;
  authReady = true;
  renderNav();
  rerender();
});

start();
