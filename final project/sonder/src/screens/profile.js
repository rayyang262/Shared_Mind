import { auth, logout } from '../firebase.js';
import { clearToken, getToken } from '../spotify.js';

export function renderProfile(root) {
  const user = auth.currentUser;
  root.innerHTML = `
    <h1>Profile</h1>
    <div class="card">
      <div class="meta">Signed in as</div>
      <div class="song">${user?.email || user?.displayName || 'unknown'}</div>
    </div>

    <div class="card">
      <div class="meta">Spotify</div>
      <div>${getToken() ? 'Token saved' : 'No token saved'}</div>
      <button id="clearToken" class="ghost" style="margin-top: 1rem;">Clear Spotify token</button>
    </div>

    <button id="logout" class="ghost">Sign out</button>
  `;

  root.querySelector('#clearToken').onclick = () => { clearToken(); renderProfile(root); };
  root.querySelector('#logout').onclick = () => logout();
}
