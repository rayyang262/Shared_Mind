// Discovery screen — Three.js constellation.
// Week 3 deliverable: real UMAP coords from Cloud Function.
// For now: random scatter to validate the rendering pipeline.

import * as THREE from 'three';
import { getPublicMemories } from '../firebase.js';

let animationId = null;

export async function renderDiscovery(root) {
  // Tear down any previous loop before re-rendering this screen.
  if (animationId) cancelAnimationFrame(animationId);

  root.innerHTML = `
    <h1>Discovery</h1>
    <p style="color: var(--text-dim);">Each point is a memory. Constellations belong to one user.</p>
    <div id="canvas" style="width: 100%; height: 500px; border-radius: var(--radius); overflow: hidden; background: #02030a;"></div>
  `;

  let memories = [];
  try { memories = await getPublicMemories(); } catch (e) { /* anon empty */ }

  const container = root.querySelector('#canvas');
  const w = container.clientWidth;
  const h = 500;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
  camera.position.z = 8;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Group memories by user → one constellation per user.
  const byUser = new Map();
  for (const m of memories) {
    if (!byUser.has(m.uid)) byUser.set(m.uid, []);
    byUser.get(m.uid).push(m);
  }

  // If no real data yet, fake 5 users × 4 memories so the scene isn't empty.
  if (byUser.size === 0) {
    for (let u = 0; u < 5; u++) {
      const fakes = [];
      for (let i = 0; i < 4; i++) fakes.push({ id: `fake-${u}-${i}` });
      byUser.set(`user-${u}`, fakes);
    }
  }

  const colors = [0xb794ff, 0xff7ab8, 0x7adfff, 0xffd66e, 0x9bff7a];
  let userIdx = 0;

  for (const [uid, mems] of byUser) {
    const color = colors[userIdx % colors.length];
    userIdx++;

    // Random anchor for this user's constellation.
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

    // Points
    const geom = new THREE.BufferGeometry().setFromPoints(positions);
    const mat = new THREE.PointsMaterial({ color, size: 0.18, sizeAttenuation: true });
    scene.add(new THREE.Points(geom, mat));

    // Lines linking each user's points (the constellation).
    if (positions.length > 1) {
      const lineGeom = new THREE.BufferGeometry().setFromPoints(positions);
      const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
      scene.add(new THREE.Line(lineGeom, lineMat));
    }
  }

  // Background stars.
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

  const animate = () => {
    animationId = requestAnimationFrame(animate);
    scene.rotation.y += 0.0015;
    scene.rotation.x += 0.0005;
    renderer.render(scene, camera);
  };
  animate();
}
