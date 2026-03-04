// ===== IMPORTS =====
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ==========================================================
// ===== MODULE A: FIREBASE + AUTH + USER MANAGEMENT =====
// ==========================================================

// !! IMPORTANT !! Replace with your own Google account email.
// Only this account will see the true, undistorted scene.
const CREATOR_EMAIL = 'ry2541@nyu.edu';

const firebaseConfig = {
  apiKey: "AIzaSyCg25we8nTvWlvCf4_aAg-l7cYyM9rXlcA",
  authDomain: "ginsengmuseum.firebaseapp.com",
  projectId: "ginsengmuseum",
  storageBucket: "ginsengmuseum.firebasestorage.app",
  messagingSenderId: "417838536424",
  appId: "1:417838536424:web:56564f4418dd0b79211b5d",
  measurementId: "G-8GLX3N9WMJ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ===== GLOBAL APP STATE =====
const AppState = {
  currentUser: null,
  username: null,
  isCreator: false,
  selectedColor: '#e74c3c',
  selectedType: 'box',
  placingMode: false,
  placingGhost: null,
  selectedMeshId: null,
  shapes: {},          // { firestoreId: THREE.Mesh }
  unsubscribeShapes: null,
  draggingMesh: null,      // mesh currently being repositioned by drag
  isDraggingShape: false   // true once drag threshold (5px) is crossed
};

// Three.js globals (set by initScene)
let scene, camera, renderer, css2dRenderer, controls;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const ndcMouse = new THREE.Vector2();
const intersectPoint = new THREE.Vector3();

// ---- Auth helpers ----
function initAuth() {
  const googleProvider = new firebase.auth.GoogleAuthProvider();

  // Handle result when page reloads after Google redirect
  auth.getRedirectResult().catch(err => showAuthError(err.message));

  // Google sign-in (redirect avoids COOP popup issue on localhost)
  document.getElementById('google-sign-in-btn').addEventListener('click', () => {
    auth.signInWithRedirect(googleProvider);
  });

  // Email sign-in
  document.getElementById('email-signin-btn').addEventListener('click', () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) { showAuthError('Enter email and password.'); return; }
    auth.signInWithEmailAndPassword(email, password).catch(err => {
      showAuthError(err.message);
    });
  });

  // Email sign-up
  document.getElementById('email-signup-btn').addEventListener('click', () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) { showAuthError('Enter email and password.'); return; }
    if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
    auth.createUserWithEmailAndPassword(email, password).catch(err => {
      showAuthError(err.message);
    });
  });

  document.getElementById('sign-out-btn').addEventListener('click', () => {
    if (AppState.unsubscribeShapes) AppState.unsubscribeShapes();
    auth.signOut();
  });

  let sceneInitialized = false;

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      AppState.currentUser = user;
      AppState.isCreator = (user.email === CREATOR_EMAIL);

      try {
        const username = await ensureUsername(user.uid);
        AppState.username = username;
      } catch (err) {
        console.error('ensureUsername error:', err);
        // Fall back to display name or email prefix
        AppState.username = user.displayName || user.email.split('@')[0];
      }

      showApp();

      if (!sceneInitialized) {
        sceneInitialized = true;
        // Wait one frame so #app is visible and has proper dimensions
        requestAnimationFrame(() => {
          initScene();
          initDragInteraction();
          initUI();
          subscribeShapes();
          startRenderLoop();
        });
      }
    } else {
      AppState.currentUser = null;
      AppState.isCreator = false;
      AppState.username = null;
      AppState.shapes = {};
      showAuthOverlay();
    }
  });
}

async function ensureUsername(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists && doc.data().username) {
      return doc.data().username;
    }
  } catch (err) {
    console.warn('Could not fetch username from Firestore:', err);
  }
  return promptForUsername(uid);
}

function promptForUsername(uid) {
  return new Promise((resolve) => {
    document.getElementById('username-overlay').classList.remove('hidden');
    const submitBtn = document.getElementById('username-submit-btn');
    const input = document.getElementById('username-input');
    const errorEl = document.getElementById('username-error');

    const handler = async () => {
      const val = input.value.trim();
      if (val.length < 2) {
        errorEl.classList.remove('hidden');
        return;
      }
      errorEl.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Entering…';

      try {
        await db.collection('users').doc(uid).set({
          username: val,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('username-overlay').classList.add('hidden');
        resolve(val);
      } catch (err) {
        console.error('Username save error:', err);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enter Shape World';
      }
    };

    submitBtn.addEventListener('click', handler, { once: true });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handler(); });
  });
}

function showApp() {
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('toolbar-username').textContent = AppState.username || '';
  if (AppState.isCreator) {
    document.getElementById('creator-badge').classList.remove('hidden');
  }
}

function showAuthOverlay() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-overlay').classList.remove('hidden');
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ===============================================================
// ===== MODULE B: THREE.JS SCENE SETUP =====
// ===============================================================

function initScene() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth;
  const h = container.clientHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080a0e);
  scene.fog = new THREE.FogExp2(0x080a0e, 0.025);

  // Camera
  camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 600);
  camera.position.set(0, 16, 28);

  // WebGL Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // CSS2D Renderer for labels
  css2dRenderer = new CSS2DRenderer();
  css2dRenderer.setSize(w, h);
  css2dRenderer.domElement.classList.add('css2d-overlay');
  container.appendChild(css2dRenderer.domElement);

  // Orbit Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 0, 0);
  controls.minDistance = 4;
  controls.maxDistance = 120;
  controls.maxPolarAngle = Math.PI * 0.48;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff8ee, 1.4);
  sun.position.set(12, 24, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 150;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xaac0ff, 0.3);
  fill.position.set(-10, 8, -10);
  scene.add(fill);

  // Grid
  const gridHelper = new THREE.GridHelper(80, 40, 0x1a1d26, 0x13151e);
  scene.add(gridHelper);

  // Shadow receiver plane (invisible)
  const planeGeo = new THREE.PlaneGeometry(160, 160);
  const planeMat = new THREE.ShadowMaterial({ opacity: 0.25 });
  const shadowPlane = new THREE.Mesh(planeGeo, planeMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -0.01;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  window.addEventListener('resize', onWindowResize);
}

function startRenderLoop() {
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    stepPhysics();
    css2dRenderer.render(scene, camera);
    renderer.render(scene, camera);
  }
  animate();
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  css2dRenderer.setSize(w, h);
}

// ===============================================================
// ===== MODULE C: SHAPE FACTORY + DISTORTION =====
// ===============================================================

const SHAPE_TYPES = ['box', 'rect', 'cone', 'prism'];

// Deterministic hash (djb2 variant)
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(33, h) ^ str.charCodeAt(i);
  }
  return Math.abs(h >>> 0);
}

// Seeded float [0,1) — mulberry32
function seededRandom(seed) {
  const s = hashString(String(seed));
  let t = (s + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Convert hex color to { h [0-360], s [0-100], l [0-100] }
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hueShift(hexColor, degrees) {
  try {
    const { h, s, l } = hexToHsl(hexColor);
    const newH = (h + degrees) % 360;
    return hslToHex(newH, s, l);
  } catch {
    return hexColor;
  }
}

function colorSimilarity(hex1, hex2) {
  const r1 = parseInt(hex1.slice(1,3), 16), g1 = parseInt(hex1.slice(3,5), 16), b1 = parseInt(hex1.slice(5,7), 16);
  const r2 = parseInt(hex2.slice(1,3), 16), g2 = parseInt(hex2.slice(3,5), 16), b2 = parseInt(hex2.slice(5,7), 16);
  return 1 - Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2) / 441.67;
}

function buildGeometry(type) {
  switch (type) {
    case 'box':   return new THREE.BoxGeometry(1.6, 1.6, 1.6);
    case 'rect':  return new THREE.BoxGeometry(2.8, 0.6, 1.6);
    case 'cone':  return new THREE.ConeGeometry(0.9, 2.2, 18);
    case 'prism': return new THREE.CylinderGeometry(0.95, 0.95, 2.0, 3);
    default:      return new THREE.BoxGeometry(1.6, 1.6, 1.6);
  }
}

function createShapeMesh(data, isCreator) {
  let type  = data.type;
  let color = data.color;
  let scale = data.scale || 1;

  if (!isCreator) {
    // Distortion 1: hue-shift color
    const hueDeg = (hashString(data.id) * 137.5) % 360;
    color = hueShift(color, hueDeg);

    // Distortion 2: scale multiplier
    scale = scale * (0.35 + seededRandom(data.id + 'scale') * 1.65);

    // Distortion 3: swap geometry type
    type = SHAPE_TYPES[hashString(data.id) % 4];
  }

  const geometry = buildGeometry(type);
  const material = new THREE.MeshLambertMaterial({
    color: new THREE.Color(color)
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.scale.setScalar(scale);
  mesh.position.set(
    data.position?.x || 0,
    data.position?.y || 0,
    data.position?.z || 0
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.y = seededRandom(data.id + 'rot') * Math.PI * 2;

  mesh.userData = {
    id: data.id,
    userId: data.userId,
    username: data.username,
    type: data.type,        // true type (un-distorted)
    color: data.color,      // true color (un-distorted) — used by physics
    scale: data.scale || 1,
    velocity: new THREE.Vector3(0, 0, 0),
    syncTimeout: null
  };

  if (data.username) {
    attachLabel(mesh, data.username);
  }

  return mesh;
}

// ===============================================================
// ===== MODULE D: PHYSICS ENGINE =====
// ===============================================================

const PHYSICS = {
  k: 0.0018,          // attraction constant
  repelK: 0.0040,     // repulsion constant — equilibrium at repelK / (k * sim)
  maxForce: 0.045,
  damping: 0.88,
  simThreshold: 0.25, // color similarity below this → no interaction
  syncDelay: 2500
};

function stepPhysics() {
  const meshes = Object.values(AppState.shapes);
  if (meshes.length < 2) return;

  // Pass 1: accumulate forces using current positions only (no writes yet)
  // Pair loop (j = i+1) guarantees Newton's 3rd law — equal & opposite by construction
  const forces = meshes.map(() => new THREE.Vector3());

  for (let i = 0; i < meshes.length; i++) {
    for (let j = i + 1; j < meshes.length; j++) {
      const a = meshes[i], b = meshes[j];

      const sim = colorSimilarity(a.userData.color, b.userData.color);
      if (sim < PHYSICS.simThreshold) continue;

      const dir = b.position.clone().sub(a.position);
      const dist = dir.length();
      if (dist < 0.1) continue;

      // Attract at long range, repel at short range
      // Equilibrium distance: d_eq = repelK / (k * sim)
      const netMag = (PHYSICS.k * sim / (dist * dist)) - (PHYSICS.repelK / (dist * dist * dist));

      dir.normalize().multiplyScalar(netMag);
      forces[i].add(dir);  // netMag > 0: toward b; netMag < 0: away from b
      forces[j].sub(dir);  // equal & opposite
    }
  }

  // Pass 2: apply forces and integrate positions simultaneously
  for (let i = 0; i < meshes.length; i++) {
    const a = meshes[i];
    const f = forces[i];

    if (f.length() > PHYSICS.maxForce) f.setLength(PHYSICS.maxForce);

    a.userData.velocity.add(f);
    a.userData.velocity.multiplyScalar(PHYSICS.damping);
    a.position.add(a.userData.velocity);

    if (a.position.y < 0) {
      a.position.y = 0;
      a.userData.velocity.y = 0;
    }

    if (a.userData.userId === AppState.currentUser?.uid) {
      clearTimeout(a.userData.syncTimeout);
      a.userData.syncTimeout = setTimeout(() => {
        updateShapePosition(a.userData.id, a.position);
      }, PHYSICS.syncDelay);
    }
  }
}

// ===============================================================
// ===== MODULE E: DRAG INTERACTION (TOOLBAR → 3D CANVAS) =====
// ===============================================================

let mouseDownPos = { x: 0, y: 0 };
let mouseDownTime = 0;

function screenToWorld(clientX, clientY) {
  const container = document.getElementById('canvas-container');
  const rect = container.getBoundingClientRect();
  ndcMouse.x =  ((clientX - rect.left)  / rect.width)  * 2 - 1;
  ndcMouse.y = -((clientY - rect.top)   / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndcMouse, camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, intersectPoint);
  return hit ? intersectPoint.clone() : null;
}

function createGhostMesh() {
  const geo = buildGeometry(AppState.selectedType);
  const mat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(AppState.selectedColor),
    transparent: true,
    opacity: 0.45
  });
  const ghost = new THREE.Mesh(geo, mat);
  ghost.castShadow = false;
  ghost.position.set(0, 0.8, 0);
  return ghost;
}

function initDragInteraction() {
  // Toolbar shape mousedown → enter placing mode
  document.querySelectorAll('.toolbar-shape').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      AppState.placingMode = true;
      AppState.selectedType = el.dataset.type;
      el.classList.add('dragging');
      document.body.classList.add('placing-mode');

      // Disable orbit while placing
      if (controls) controls.enabled = false;

      // Create ghost
      AppState.placingGhost = createGhostMesh();
      scene.add(AppState.placingGhost);
    });
  });

  // Drag existing shape to reposition
  const canvasEl = document.getElementById('canvas-container');
  canvasEl.addEventListener('mousedown', (e) => {
    if (AppState.placingMode) return;
    const rect = canvasEl.getBoundingClientRect();
    ndcMouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    ndcMouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndcMouse, camera);
    const hits = raycaster.intersectObjects(Object.values(AppState.shapes));
    if (hits.length > 0 && hits[0].object.userData.userId === AppState.currentUser?.uid) {
      AppState.draggingMesh = hits[0].object;
      controls.enabled = false;
    }
  });

  // Second mouseup listener — cleans up shape drag (toolbar placement handled by existing one)
  document.addEventListener('mouseup', () => {
    if (!AppState.draggingMesh) return;
    if (AppState.isDraggingShape) {
      updateShapePosition(AppState.draggingMesh.userData.id, AppState.draggingMesh.position);
    }
    AppState.draggingMesh = null;
    AppState.isDraggingShape = false;
    controls.enabled = true;
  });

  // Track mouse for ghost
  document.addEventListener('mousemove', (e) => {
    // Toolbar ghost placement
    if (AppState.placingMode && AppState.placingGhost) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      if (worldPos) {
        AppState.placingGhost.position.copy(worldPos);
        AppState.placingGhost.position.y = 0.8;
      }
      return;
    }
    // Shape drag reposition
    if (AppState.draggingMesh) {
      const dx = e.clientX - mouseDownPos.x;
      const dy = e.clientY - mouseDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        AppState.isDraggingShape = true;
        const worldPos = screenToWorld(e.clientX, e.clientY);
        if (worldPos) {
          AppState.draggingMesh.position.x = worldPos.x;
          AppState.draggingMesh.position.z = worldPos.z;
          AppState.draggingMesh.userData.velocity.set(0, 0, 0);
        }
      }
    }
  });

  // Mouseup: finalize or cancel
  document.addEventListener('mouseup', (e) => {
    if (!AppState.placingMode) return;

    const toolbar = document.getElementById('toolbar');
    const rect = toolbar.getBoundingClientRect();
    const overToolbar = (
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top  && e.clientY <= rect.bottom
    );

    if (!overToolbar && AppState.placingGhost) {
      const pos = AppState.placingGhost.position.clone();
      finalizeShapePlacement(pos);
    }

    // Cleanup ghost
    if (AppState.placingGhost) {
      scene.remove(AppState.placingGhost);
      AppState.placingGhost.geometry.dispose();
      AppState.placingGhost.material.dispose();
      AppState.placingGhost = null;
    }

    document.querySelectorAll('.toolbar-shape').forEach(el => el.classList.remove('dragging'));
    document.body.classList.remove('placing-mode');
    AppState.placingMode = false;
    if (controls) controls.enabled = true;
  });
}

async function finalizeShapePlacement(position) {
  if (!AppState.currentUser || !AppState.username) return;

  const docRef = db.collection('shapes').doc();
  const shapeData = {
    id: docRef.id,
    userId: AppState.currentUser.uid,
    username: AppState.username,
    type: AppState.selectedType,
    position: { x: position.x, y: position.y, z: position.z },
    color: AppState.selectedColor,
    scale: 1,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  // Optimistic local add (onSnapshot will skip duplicate on 'added')
  if (!AppState.shapes[docRef.id]) {
    const mesh = createShapeMesh(shapeData, AppState.isCreator);
    scene.add(mesh);
    AppState.shapes[docRef.id] = mesh;
  }

  await saveShape(shapeData, docRef);
}

// ===============================================================
// ===== MODULE F: FIRESTORE SYNC =====
// ===============================================================

async function saveShape(data, docRef) {
  try {
    await docRef.set(data);
  } catch (err) {
    console.error('saveShape error:', err);
  }
}

async function updateShapePosition(id, position) {
  if (!id) return;
  try {
    await db.collection('shapes').doc(id).update({
      position: { x: position.x, y: position.y, z: position.z },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('updateShapePosition error:', err);
  }
}

async function deleteShape(id) {
  const mesh = AppState.shapes[id];
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    delete AppState.shapes[id];
  }
  document.getElementById('recolor-popover').classList.add('hidden');
  try {
    await db.collection('shapes').doc(id).delete();
  } catch (err) {
    console.error('deleteShape error:', err);
  }
}

async function updateShapeColor(id, color) {
  if (!id) return;
  try {
    await db.collection('shapes').doc(id).update({
      color: color,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('updateShapeColor error:', err);
  }
}

function subscribeShapes() {
  AppState.unsubscribeShapes = db.collection('shapes')
    .orderBy('createdAt')
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = { id: change.doc.id, ...change.doc.data() };

        if (change.type === 'added') {
          // Skip if already optimistically added
          if (AppState.shapes[data.id]) return;
          const mesh = createShapeMesh(data, AppState.isCreator);
          scene.add(mesh);
          AppState.shapes[data.id] = mesh;
        }

        if (change.type === 'modified') {
          const mesh = AppState.shapes[data.id];
          if (!mesh) return;

          // For remote shapes: snap to Firestore position
          // For own shapes: physics drives position, skip remote overwrite
          if (data.userId !== AppState.currentUser?.uid) {
            mesh.position.set(data.position.x, data.position.y, data.position.z);
          }

          // Update color (re-apply distortion)
          const displayColor = AppState.isCreator
            ? data.color
            : hueShift(data.color, (hashString(data.id) * 137.5) % 360);
          mesh.material.color.set(displayColor);
          mesh.userData.color = data.color; // always true color for physics
        }

        if (change.type === 'removed') {
          const mesh = AppState.shapes[data.id];
          if (mesh) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            delete AppState.shapes[data.id];
          }
        }
      });
    }, (err) => {
      console.error('Firestore snapshot error:', err);
    });
}

// ===============================================================
// ===== MODULE G: CSS2D LABELS =====
// ===============================================================

function attachLabel(mesh, username) {
  if (!username) return;
  const div = document.createElement('div');
  div.className = 'shape-label';
  div.textContent = username;

  const label = new CSS2DObject(div);
  // Position above the shape (offset in local space)
  label.position.set(0, 1.4, 0);
  mesh.add(label);
}

// ===============================================================
// ===== MODULE H: UI =====
// ===============================================================

function initUI() {
  document.getElementById('toolbar-username').textContent = AppState.username || '';

  // Color swatches
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      AppState.selectedColor = swatch.dataset.color;
      document.getElementById('custom-color-input').value = AppState.selectedColor;
      updateGhostColor();
    });
  });

  // Custom color picker
  document.getElementById('custom-color-input').addEventListener('input', (e) => {
    AppState.selectedColor = e.target.value;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    updateGhostColor();
  });

  // Shape selection on canvas click
  const container = document.getElementById('canvas-container');

  container.addEventListener('mousedown', (e) => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
    mouseDownTime = Date.now();
  });

  container.addEventListener('mouseup', (e) => {
    if (AppState.placingMode) return;
    if (AppState.isDraggingShape) return;  // was a drag, not a click
    const dx = e.clientX - mouseDownPos.x;
    const dy = e.clientY - mouseDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = Date.now() - mouseDownTime;
    // Only trigger click if not a drag (< 5px, < 300ms)
    if (dist < 5 && elapsed < 300) {
      handleCanvasClick(e);
    }
  });

  // Recolor popover close
  document.getElementById('recolor-close-btn').addEventListener('click', () => {
    document.getElementById('recolor-popover').classList.add('hidden');
  });

  // Delete shape
  document.getElementById('delete-shape-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteShape(AppState.selectedMeshId);
  });

  // Close popover on outside click
  document.addEventListener('click', (e) => {
    const popover = document.getElementById('recolor-popover');
    if (!popover.classList.contains('hidden') && !popover.contains(e.target)) {
      popover.classList.add('hidden');
    }
  });
}

function updateGhostColor() {
  if (AppState.placingGhost) {
    AppState.placingGhost.material.color.set(new THREE.Color(AppState.selectedColor));
  }
}

function handleCanvasClick(e) {
  const container = document.getElementById('canvas-container');
  const rect = container.getBoundingClientRect();
  ndcMouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  ndcMouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

  raycaster.setFromCamera(ndcMouse, camera);
  const meshes = Object.values(AppState.shapes);
  const hits = raycaster.intersectObjects(meshes);

  if (hits.length > 0) {
    const mesh = hits[0].object;
    // Only allow recoloring your own shapes
    if (mesh.userData.userId === AppState.currentUser?.uid) {
      AppState.selectedMeshId = mesh.userData.id;
      showRecolorPopover(e.clientX, e.clientY);
    }
  }
}

function showRecolorPopover(x, y) {
  const popover = document.getElementById('recolor-popover');

  // Position above cursor
  popover.style.left = Math.min(x - 10, window.innerWidth - 180) + 'px';
  popover.style.top  = Math.max(y - 160, 8) + 'px';
  popover.classList.remove('hidden');

  // Populate swatches
  const container = document.getElementById('recolor-swatches');
  container.innerHTML = '';
  ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'].forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    swatch.dataset.color = color;
    swatch.addEventListener('click', (ev) => {
      ev.stopPropagation();
      applyRecolor(color);
    });
    container.appendChild(swatch);
  });

  // Custom recolor
  const customInput = document.getElementById('recolor-custom-input');
  customInput.onchange = null;
  customInput.addEventListener('change', (e) => {
    applyRecolor(e.target.value);
  }, { once: true });
}

function applyRecolor(color) {
  const id = AppState.selectedMeshId;
  if (!id) return;
  const mesh = AppState.shapes[id];
  if (!mesh) return;

  // Update local mesh immediately (with distortion if non-creator)
  const displayColor = AppState.isCreator
    ? color
    : hueShift(color, (hashString(id) * 137.5) % 360);
  mesh.material.color.set(displayColor);
  mesh.userData.color = color; // store true color for physics

  updateShapeColor(id, color);
  document.getElementById('recolor-popover').classList.add('hidden');
}

// ===============================================================
// ===== INITIALIZATION =====
// ===============================================================

initAuth();
