import { signInEmail, signUpEmail, signInGoogle } from '../firebase.js';

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

  root.querySelector('#signin').onclick = async () => {
    err.textContent = '';
    try {
      await signInEmail(
        root.querySelector('#email').value,
        root.querySelector('#password').value
      );
    } catch (e) { showErr(e); }
  };

  root.querySelector('#signup').onclick = async () => {
    err.textContent = '';
    try {
      await signUpEmail(
        root.querySelector('#email').value,
        root.querySelector('#password').value
      );
    } catch (e) { showErr(e); }
  };

  root.querySelector('#google').onclick = async () => {
    err.textContent = '';
    try { await signInGoogle(); } catch (e) { showErr(e); }
  };
}
