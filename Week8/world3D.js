// world3D.js — Three.js scene: elevator, fog-of-war, multi-user presence
import * as THREE from 'https://esm.sh/three@0.165.0';

// ── Scene globals ────────────────────────────────────────────────────────────
let scene, camera, renderer, clock;
let elevatorGroup, torchLight, figureGroup;

export function getScene()         { return scene; }
export function getCamera()        { return camera; }
export function getElevatorGroup() { return elevatorGroup; }
let targetElevatorPos = new THREE.Vector3(0, 0, 0);

// Camera orbit state — drag to rotate, wheel to zoom
let camRadius = 32, camTheta = Math.PI / 4, camPhi = 1.15;
let isDragging = false, lastMx = 0, lastMy = 0;

// Fog-of-war: 10×10×10 grid of dark cube instances
// Each cell maps to a 20×20×20 Three.js unit region
const WORLD_UNITS    = 200;   // total Three.js world size per axis
const HALF           = WORLD_UNITS / 2;
const GRID_DIM       = 10;    // cells per axis
const CELL_UNITS     = WORLD_UNITS / GRID_DIM;  // 20 units per cell

let fogInstancedMesh = null;
const exploredCells  = new Set();
const zeroMatrix     = new THREE.Matrix4().makeScale(0, 0, 0); // hides an instance

// Other users: userId → { group, torchLight }
const remoteUsers = {};

// Content nodes: contentId → { orb }
const contentNodes = {};

// Screen-space labels for content (managed in main.js via callbacks)
let onContentVisibleCb = null;

// ── Convert embedding coords [0-100] → Three.js world coords ─────────────────
export function embedToWorld(ex, ey, ez) {
  return new THREE.Vector3(
    (ex / 100) * WORLD_UNITS - HALF,
    (ey / 100) * WORLD_UNITS - HALF,
    (ez / 100) * WORLD_UNITS - HALF
  );
}

// ── Convert world pos → fog grid cell indices ─────────────────────────────────
function worldToCell(wx, wy, wz) {
  return {
    cx: Math.floor((wx + HALF) / CELL_UNITS),
    cy: Math.floor((wy + HALF) / CELL_UNITS),
    cz: Math.floor((wz + HALF) / CELL_UNITS),
  };
}
function cellKey(cx, cy, cz) { return `${cx},${cy},${cz}`; }
function cellIndex(cx, cy, cz) { return cx * GRID_DIM * GRID_DIM + cy * GRID_DIM + cz; }

// ── Init ──────────────────────────────────────────────────────────────────────
export function initWorld() {
  scene    = new THREE.Scene();
  scene.background = new THREE.Color(0x000810);
  // Minimal ambient so torch is the main light source
  scene.add(new THREE.AmbientLight(0x112244, 0.55));

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 800);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  clock = new THREE.Clock();

  buildStructure();
  buildPipes();
  buildFogGrid();
  buildElevator();
  addStarfield();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Mouse drag to orbit, scroll wheel to zoom
  renderer.domElement.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    isDragging = true; lastMx = e.clientX; lastMy = e.clientY;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    camTheta -= (e.clientX - lastMx) * 0.006;
    camPhi    = Math.max(0.15, Math.min(Math.PI * 0.85, camPhi + (e.clientY - lastMy) * 0.006));
    lastMx = e.clientX; lastMy = e.clientY;
  });
  renderer.domElement.addEventListener('wheel', e => {
    camRadius = Math.max(10, Math.min(220, camRadius + e.deltaY * 0.08));
    e.preventDefault();
  }, { passive: false });
}

// ── Distant star field ────────────────────────────────────────────────────────
function addStarfield() {
  const geo = new THREE.BufferGeometry();
  const verts = [];
  for (let i = 0; i < 1800; i++) {
    verts.push(
      (Math.random() - 0.5) * 1400,
      (Math.random() - 0.5) * 1400,
      (Math.random() - 0.5) * 1400
    );
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.6, transparent: true, opacity: 0.35
  })));
}

// ── Building skeleton (wireframe grid suggesting a vast structure) ─────────────
function buildStructure() {
  const floorMat = new THREE.LineBasicMaterial({ color: 0x1e3d58, transparent: true, opacity: 0.55 });
  const subMat   = new THREE.LineBasicMaterial({ color: 0x0e2233, transparent: true, opacity: 0.3 });
  const colMat   = new THREE.LineBasicMaterial({ color: 0x234a6a, transparent: true, opacity: 0.65 });
  const braceMat = new THREE.LineBasicMaterial({ color: 0x112233, transparent: true, opacity: 0.35 });

  // Horizontal floor planes — perimeter + interior grid
  for (let y = -HALF; y <= HALF; y += CELL_UNITS) {
    const pts = [
      new THREE.Vector3(-HALF, y, -HALF), new THREE.Vector3( HALF, y, -HALF),
      new THREE.Vector3( HALF, y,  HALF), new THREE.Vector3(-HALF, y,  HALF),
      new THREE.Vector3(-HALF, y, -HALF),
    ];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), floorMat));
    // Interior grid X
    for (let x = -HALF + CELL_UNITS; x < HALF; x += CELL_UNITS) {
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, -HALF), new THREE.Vector3(x, y, HALF),
      ]), subMat));
    }
    // Interior grid Z
    for (let z = -HALF + CELL_UNITS; z < HALF; z += CELL_UNITS) {
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-HALF, y, z), new THREE.Vector3(HALF, y, z),
      ]), subMat));
    }
  }

  // Vertical columns — every 2 cells
  for (let x = -HALF; x <= HALF; x += CELL_UNITS * 2) {
    for (let z = -HALF; z <= HALF; z += CELL_UNITS * 2) {
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, -HALF, z), new THREE.Vector3(x, HALF, z),
      ]), colMat));
    }
  }

  // X cross-braces on front/back walls
  for (const wall of [-HALF, HALF]) {
    for (let y = -HALF; y < HALF; y += CELL_UNITS * 2) {
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(wall, y, -HALF), new THREE.Vector3(wall, y + CELL_UNITS * 2, HALF),
      ]), braceMat));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(wall, y, HALF),  new THREE.Vector3(wall, y + CELL_UNITS * 2, -HALF),
      ]), braceMat));
    }
  }
}

// ── Industrial pipe infrastructure ─────────────────────────────────────────────
function buildPipes() {
  const pipeMat  = new THREE.MeshBasicMaterial({ color: 0x182018 });
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0x2a1600, roughness: 0.4, metalness: 0.7,
    emissive: 0xff7700, emissiveIntensity: 0.5,
  });
  const L = WORLD_UNITS * 1.05;

  function hPipeX(y, z, r = 1.2) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), pipeMat);
    m.rotation.z = Math.PI / 2;
    m.position.set(0, y, z);
    scene.add(m);
    for (let x = -80; x <= 80; x += 80) {
      const j = new THREE.Mesh(new THREE.SphereGeometry(r * 1.7, 8, 5), jointMat);
      j.position.set(x, y, z);
      scene.add(j);
      const l = new THREE.PointLight(0xff8833, 0.45, 40);
      l.position.set(x, y, z);
      scene.add(l);
    }
  }

  function hPipeZ(y, x, r = 1.0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), pipeMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, 0);
    scene.add(m);
  }

  function vPipe(x, z, r = 1.2) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), pipeMat);
    m.position.set(x, 0, z);
    scene.add(m);
  }

  // Horizontal X-runs at various heights / depths
  hPipeX(-70, -80, 1.4);
  hPipeX(-70,  80, 1.4);
  hPipeX(  0, -90, 1.0);
  hPipeX(  0,  90, 1.0);
  hPipeX( 70, -80, 1.4);
  hPipeX( 70,  80, 1.4);
  hPipeX(-35,  50, 0.7);
  hPipeX( 35, -50, 0.7);

  // Horizontal Z-runs
  hPipeZ(-60, -80, 1.1);
  hPipeZ(-60,  80, 1.1);
  hPipeZ( 60, -80, 1.1);
  hPipeZ( 60,  80, 1.1);

  // Vertical risers
  vPipe(-90, -90, 1.6);
  vPipe( 90, -90, 1.6);
  vPipe(-90,  90, 1.6);
  vPipe( 90,  90, 1.6);
  vPipe(-90,   0, 1.0);
  vPipe( 90,   0, 1.0);
  vPipe(  0, -90, 1.0);
  vPipe(  0,  90, 1.0);

  // Dim bluish building area lights (like fluorescent ceiling fixtures)
  [
    [-60, -90, -60], [ 60, -90, -60], [-60, -90,  60], [ 60, -90,  60],
    [-60,   0, -60], [ 60,   0, -60], [-60,   0,  60], [ 60,   0,  60],
    [-60,  90, -60], [ 60,  90, -60], [-60,  90,  60], [ 60,  90,  60],
  ].forEach(([x, y, z]) => {
    const l = new THREE.PointLight(0x2244aa, 0.4, 75);
    l.position.set(x, y, z);
    scene.add(l);
  });
}

// ── Fog-of-war: instanced mesh of dark cubes ───────────────────────────────────
function buildFogGrid() {
  const total = GRID_DIM ** 3;
  const geo   = new THREE.BoxGeometry(CELL_UNITS - 0.3, CELL_UNITS - 0.3, CELL_UNITS - 0.3);
  const mat   = new THREE.MeshStandardMaterial({
    color: 0x000010,
    roughness: 1,
    transparent: true,
    opacity: 0.97,
    depthWrite: true,
  });

  fogInstancedMesh = new THREE.InstancedMesh(geo, mat, total);
  fogInstancedMesh.receiveShadow = false;

  const dummy = new THREE.Object3D();
  for (let cx = 0; cx < GRID_DIM; cx++) {
    for (let cy = 0; cy < GRID_DIM; cy++) {
      for (let cz = 0; cz < GRID_DIM; cz++) {
        dummy.position.set(
          cx * CELL_UNITS - HALF + CELL_UNITS / 2,
          cy * CELL_UNITS - HALF + CELL_UNITS / 2,
          cz * CELL_UNITS - HALF + CELL_UNITS / 2
        );
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        fogInstancedMesh.setMatrixAt(cellIndex(cx, cy, cz), dummy.matrix);
      }
    }
  }
  fogInstancedMesh.instanceMatrix.needsUpdate = true;
  scene.add(fogInstancedMesh);
}

// Reveal fog cells within radius of a world-space position
function revealCellsAround(wx, wy, wz, radius = 2) {
  const { cx: ocx, cy: ocy, cz: ocz } = worldToCell(wx, wy, wz);
  let changed = false;

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = ocx + dx, cy = ocy + dy, cz = ocz + dz;
        if (cx < 0 || cy < 0 || cz < 0 || cx >= GRID_DIM || cy >= GRID_DIM || cz >= GRID_DIM) continue;
        const k = cellKey(cx, cy, cz);
        if (exploredCells.has(k)) continue;
        exploredCells.add(k);
        fogInstancedMesh.setMatrixAt(cellIndex(cx, cy, cz), zeroMatrix);
        changed = true;
      }
    }
  }
  if (changed) fogInstancedMesh.instanceMatrix.needsUpdate = true;
}

// Called from firebase to reveal cells another user has explored
export function revealRemoteCells(cells) {
  let changed = false;
  cells.forEach(k => {
    const [cx, cy, cz] = k.split(',').map(Number);
    if (exploredCells.has(k)) return;
    exploredCells.add(k);
    fogInstancedMesh.setMatrixAt(cellIndex(cx, cy, cz), zeroMatrix);
    changed = true;
  });
  if (changed) fogInstancedMesh.instanceMatrix.needsUpdate = true;
}

export function getExploredCells() { return [...exploredCells]; }

// ── Elevator cab + player figure ──────────────────────────────────────────────
function buildElevator() {
  elevatorGroup = new THREE.Group();

  // Glass cab
  const cabGeo = new THREE.BoxGeometry(9, 11, 9);
  const cabMat = new THREE.MeshPhysicalMaterial({
    color: 0x7799bb,
    transparent: true, opacity: 0.12,
    roughness: 0.05, metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  elevatorGroup.add(new THREE.Mesh(cabGeo, cabMat));

  // Edge glow
  const edges    = new THREE.EdgesGeometry(cabGeo);
  const edgeMat  = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4 });
  elevatorGroup.add(new THREE.LineSegments(edges, edgeMat));

  // Shaft indicator lines (vertical — suggest the shaft extending up/down)
  const shaftMat = new THREE.LineBasicMaterial({ color: 0x223355, transparent: true, opacity: 0.5 });
  for (const x of [-4.5, 4.5]) {
    for (const z of [-4.5, 4.5]) {
      const pts = [new THREE.Vector3(x, -HALF * 2, z), new THREE.Vector3(x, HALF * 2, z)];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), shaftMat);
      elevatorGroup.add(line);
    }
  }

  // Player figure
  figureGroup = buildFigure(0xffcc88);
  figureGroup.position.y = -2.8;
  elevatorGroup.add(figureGroup);

  // Torch (key light — main illumination)
  torchLight = new THREE.PointLight(0xffaa44, 5, 80);
  torchLight.position.set(1.5, 1, 0);
  torchLight.castShadow = true;
  torchLight.shadow.mapSize.set(512, 512);
  elevatorGroup.add(torchLight);

  // Cool fill light inside cab
  const fillLight = new THREE.PointLight(0x3355aa, 0.6, 18);
  elevatorGroup.add(fillLight);

  scene.add(elevatorGroup);
}

function buildFigure(skinColor = 0xffcc88, scale = 1) {
  const group = new THREE.Group();
  const skin  = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
  const dark  = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 });

  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx; m.rotation.z = rz;
    group.add(m);
    return m;
  };

  add(new THREE.SphereGeometry(0.65 * scale, 8, 6),  skin, 0, 2.8 * scale, 0);           // head
  add(new THREE.BoxGeometry(1 * scale, 1.7 * scale, 0.5 * scale), dark, 0, 1.4 * scale, 0); // body
  add(new THREE.BoxGeometry(0.38 * scale, 1.3 * scale, 0.38 * scale), skin, -0.85 * scale, 1.4 * scale, 0, 0, 0.25); // left arm
  add(new THREE.BoxGeometry(0.38 * scale, 1.3 * scale, 0.38 * scale), skin,  0.85 * scale, 1.4 * scale, 0, 0, -0.25); // right arm
  add(new THREE.BoxGeometry(0.4 * scale, 1.5 * scale, 0.4 * scale), dark, -0.33 * scale, 0.1 * scale, 0); // left leg
  add(new THREE.BoxGeometry(0.4 * scale, 1.5 * scale, 0.4 * scale), dark,  0.33 * scale, 0.1 * scale, 0); // right leg

  // Torch (cylinder + glow)
  const torchMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 1 });
  add(new THREE.CylinderGeometry(0.1 * scale, 0.13 * scale, 0.8 * scale, 6), torchMat, 1.15 * scale, 0.85 * scale, 0);
  const flame = add(new THREE.SphereGeometry(0.18 * scale, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xff6600 }), 1.15 * scale, 1.35 * scale, 0);
  flame.userData.isFlame = true;

  return group;
}

// ── Move player elevator ───────────────────────────────────────────────────────
export function moveElevator(ex, ey, ez) {
  const wp = embedToWorld(ex, ey, ez);
  targetElevatorPos.copy(wp);
}

// ── Remote users ──────────────────────────────────────────────────────────────
export function addRemoteUser(userId, position, colorHex, displayName) {
  if (remoteUsers[userId]) return;

  const group  = new THREE.Group();
  const fig    = buildFigure(colorHex, 0.85);
  fig.position.y = -2;
  group.add(fig);

  // Coloured torch light for remote user
  const uLight = new THREE.PointLight(colorHex, 2.5, 50);
  uLight.position.set(0, 4, 0);
  group.add(uLight);

  const wp = embedToWorld(position.x, position.y, position.z);
  group.position.copy(wp);
  scene.add(group);

  remoteUsers[userId] = { group, fig, light: uLight, position: { ...position } };
  updateUsersPanel();
}

export function removeRemoteUser(userId) {
  if (!remoteUsers[userId]) return;
  scene.remove(remoteUsers[userId].group);
  delete remoteUsers[userId];
  updateUsersPanel();
}

export function updateRemoteUser(userId, position, colorHex, displayName) {
  if (!remoteUsers[userId]) {
    addRemoteUser(userId, position, colorHex, displayName);
    return;
  }
  const wp = embedToWorld(position.x, position.y, position.z);
  remoteUsers[userId].group.position.lerp(wp, 0.12); // smooth
  remoteUsers[userId].position = { ...position };
}

// ── Content nodes (thought orbs) ──────────────────────────────────────────────
export function addContentNode(contentId, data) {
  if (contentNodes[contentId]) return;

  const wp  = embedToWorld(data.position.x, data.position.y, data.position.z);
  const geo = new THREE.SphereGeometry(1.4, 10, 7);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x55ffcc, emissive: 0x113322, emissiveIntensity: 0.6,
    roughness: 0.4, transparent: true, opacity: 0.85,
  });
  const orb = new THREE.Mesh(geo, mat);
  orb.position.copy(wp);

  const glow = new THREE.PointLight(0x55ffcc, 0.7, 22);
  orb.add(glow);
  scene.add(orb);

  contentNodes[contentId] = { orb, data };
}

// ── Neighbourhood preview (for hover hints) ───────────────────────────────────
export function getNeighbourPreview(dir, myPos, step = 5) {
  const next = { ...myPos };
  switch (dir) {
    case 'up':       next.y = Math.min(100, next.y + step); break;
    case 'down':     next.y = Math.max(0,   next.y - step); break;
    case 'right':    next.x = Math.min(100, next.x + step); break;
    case 'left':     next.x = Math.max(0,   next.x - step); break;
    case 'forward':  next.z = Math.min(100, next.z + step); break;
    case 'backward': next.z = Math.max(0,   next.z - step); break;
  }

  const RADIUS = 18;
  const dist = (a, b) => Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);

  const nearUsers    = Object.values(remoteUsers).filter(u => dist(u.position, next) < RADIUS);
  const nearContent  = Object.values(contentNodes).filter(c => dist(c.data.position, next) < RADIUS);

  const parts = [];
  if (nearUsers.length)   parts.push(`${nearUsers.length} presence${nearUsers.length > 1 ? 's' : ''}`);
  if (nearContent.length) parts.push(`${nearContent.length} thought${nearContent.length > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

// ── Users panel DOM update ─────────────────────────────────────────────────────
function updateUsersPanel() {
  const panel = document.getElementById('users-panel');
  panel.innerHTML = '';
  Object.entries(remoteUsers).forEach(([uid, u]) => {
    const hex = '#' + (u.light.color.getHex()).toString(16).padStart(6, '0');
    const row = document.createElement('div');
    row.className = 'user-entry';
    row.innerHTML = `<span class="user-dot" style="background:${hex}"></span><span style="color:rgba(255,255,255,0.4)">${uid.slice(0,6)}</span>`;
    panel.appendChild(row);
  });
}

// ── Animation loop ─────────────────────────────────────────────────────────────
export function animate() {
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();

  // Smooth elevator lerp
  if (elevatorGroup) {
    elevatorGroup.position.lerp(targetElevatorPos, 0.055);

    // Torch flicker
    if (torchLight) {
      torchLight.intensity = 4.5
        + Math.sin(t * 9.1) * 0.5
        + Math.sin(t * 17.3) * 0.25;
    }

    // Flame scale flicker
    if (figureGroup) {
      figureGroup.traverse(c => {
        if (c.userData.isFlame) {
          const s = 1 + Math.sin(t * 12) * 0.15;
          c.scale.set(s, s, s);
        }
      });
      // Gentle idle bob
      figureGroup.position.y = -2.8 + Math.sin(t * 1.4) * 0.07;
    }

    // Reveal fog around current elevator position
    const ep = elevatorGroup.position;
    revealCellsAround(ep.x, ep.y, ep.z, 2);

    // Camera: spherical orbit — drag to rotate, wheel to zoom
    const camTarget = elevatorGroup.position.clone();
    const desired   = new THREE.Vector3(
      camTarget.x + camRadius * Math.sin(camPhi) * Math.sin(camTheta),
      camTarget.y + camRadius * Math.cos(camPhi),
      camTarget.z + camRadius * Math.sin(camPhi) * Math.cos(camTheta)
    );
    camera.position.lerp(desired, 0.06);
    camera.lookAt(camTarget);
  }

  // Remote users: flame flicker + idle bob
  Object.values(remoteUsers).forEach(({ fig, light }, i) => {
    if (fig) {
      fig.traverse(c => {
        if (c.userData.isFlame) {
          const s = 1 + Math.sin(t * 11 + i) * 0.13;
          c.scale.set(s, s, s);
        }
      });
    }
  });

  // Content orb animation
  Object.values(contentNodes).forEach(({ orb }, i) => {
    orb.position.y += Math.sin(t * 0.9 + i * 2.1) * 0.004;
    orb.rotation.y += 0.008;
  });

  renderer.render(scene, camera);
}
