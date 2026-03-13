// imageGen.js — Text-to-image via Replicate + position-based prompt morphing
// Generated images are placed in world space at the elevator's position —
// they stay fixed in the building as the elevator moves away.
import * as THREE from 'https://esm.sh/three@0.165.0';
import { getScene, embedToWorld } from './world3D.js';

// ── Replicate proxy ────────────────────────────────────────────────────────────
const PROXY_URL = 'https://itp-ima-replicate-proxy.web.app/api/create_n_get';
const MODEL     = 'google/imagen-4-fast';

// ── State ─────────────────────────────────────────────────────────────────────
let basePrompt   = null;
let isGenerating = false;
let genTimer     = null;
let statusEl     = null;
let loaderEl     = null;

// Snapshot of embedding pos when generation was kicked off (for placement)
let pendingPos   = null;

const loader = new THREE.TextureLoader();

// ── Build prompt from base + elevator position ────────────────────────────────
function buildPrompt(base, pos) {
  const style = [];

  if      (pos.x < 25)  style.push('sweeping public vista, crowd, wide-angle');
  else if (pos.x < 50)  style.push('semi-public scene, open framing');
  else if (pos.x < 75)  style.push('small group, warm intimate lighting');
  else                   style.push('extreme close-up, intimate, shallow depth of field');

  if      (pos.y < 25)  style.push('stark contrast, visual tension, dissonance');
  else if (pos.y < 50)  style.push('unresolved energy, moody, slightly off-balance');
  else if (pos.y < 75)  style.push('flowing harmony, soft tones');
  else                   style.push('pure resonance, unified palette, serene');

  if      (pos.z < 25)  style.push('long exposure, still, meditative, ambient light');
  else if (pos.z < 50)  style.push('unhurried, soft motion blur');
  else if (pos.z < 75)  style.push('purposeful, moderate energy');
  else                   style.push('kinetic, high contrast, urgent, dynamic motion blur');

  return `${base}. Visual style: ${style.join(', ')}. Cinematic, 4K, no text.`;
}

// ── Init: just DOM overlays — no elevator-attached plane ──────────────────────
export function initVideoScreen() {
  if (!document.getElementById('spin-style')) {
    const s = document.createElement('style');
    s.id = 'spin-style';
    s.textContent = '@keyframes spin { to { transform: translate(-50%,-50%) rotate(360deg); } }';
    document.head.appendChild(s);
  }

  loaderEl = document.createElement('div');
  loaderEl.style.cssText = `
    position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    z-index:15; pointer-events:none; width:36px; height:36px;
    border:2px solid rgba(255,200,80,0.15);
    border-top:2px solid rgba(255,200,80,0.75);
    border-radius:50%; animation:spin 1s linear infinite;
    opacity:0; transition:opacity 0.3s;
  `;
  document.body.appendChild(loaderEl);

  statusEl = document.createElement('div');
  statusEl.style.cssText = `
    position:fixed; bottom:130px; left:50%; transform:translateX(-50%);
    z-index:15; pointer-events:none; text-align:center;
    color:rgba(255,200,80,0.75); font-family:'Courier New',monospace;
    font-size:11px; letter-spacing:3px;
    opacity:0; transition:opacity 0.3s;
  `;
  document.body.appendChild(statusEl);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function setBasePrompt(text) { basePrompt = text; }
export function getBasePrompt()     { return basePrompt; }

// Called on elevator move — debounced 1.8 s
export function onPositionChange(pos) {
  if (!basePrompt) return;
  clearTimeout(genTimer);
  genTimer = setTimeout(() => generateVideo(basePrompt, pos), 1800);
}

// Main generation — called on submit and after debounce
export async function generateVideo(base, pos) {
  if (isGenerating) return;
  isGenerating  = true;
  pendingPos    = { ...pos };   // snapshot position at time of request

  const fullPrompt = buildPrompt(base, pos);
  console.log('[imagen] prompt:', fullPrompt);

  setStatus('generating…');
  setLoader(true);

  try {
    const resp = await fetch(PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        input: { prompt: fullPrompt, aspect_ratio: '9:16' },
      }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    console.log('[imagen] response:', json);

    const imgUrl = extractUrl(json.output);
    if (!imgUrl) throw new Error('no image URL in response');

    // Place image in world at the position it was generated
    await placeImageInWorld(imgUrl, pendingPos);
    setStatus('');

  } catch (e) {
    console.error('[imagen] error:', e);
    setStatus('failed — ' + e.message);
  } finally {
    setLoader(false);
    isGenerating = false;
  }
}

// ── Place generated image as a fixed plane in world space ─────────────────────
function placeImageInWorld(url, embedPos) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;

        // Portrait frame: 9:16 ratio
        const W = 5.06, H = 9;
        const mat = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);

        // Convert embedding coords → Three.js world position
        const wp = embedToWorld(embedPos.x, embedPos.y, embedPos.z);
        plane.position.copy(wp);
        plane.position.x += 8;   // offset to right wall of elevator shaft

        // Face inward toward the elevator center with a slight tilt
        plane.rotation.y = -Math.PI / 2 + (Math.random() - 0.5) * 0.15;
        plane.rotation.x = (Math.random() - 0.5) * 0.08;

        // Thin glowing border frame
        const frameEdges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(W + 0.15, H + 0.15));
        const frameMat   = new THREE.LineBasicMaterial({
          color: 0xffcc66, transparent: true, opacity: 0.35,
        });
        plane.add(new THREE.LineSegments(frameEdges, frameMat));

        // Add to scene (not elevator group — stays fixed in world)
        getScene().add(plane);

        // Fade in
        fadeMaterial(mat, 0.92, 700);
        resolve();
      },
      undefined,
      (err) => { setStatus('image load error'); reject(err); }
    );
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractUrl(output) {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length) return output[0];
  if (typeof output === 'object') return output.url ?? output.image ?? null;
  return null;
}

function fadeMaterial(mat, target, ms) {
  const start = mat.opacity;
  const t0    = performance.now();
  const tick  = (now) => {
    const p = Math.min((now - t0) / ms, 1);
    mat.opacity = start + (target - start) * p;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function setLoader(show) { loaderEl.style.opacity = show ? '1' : '0'; }
function setStatus(msg)  { statusEl.textContent = msg; statusEl.style.opacity = msg ? '1' : '0'; }
