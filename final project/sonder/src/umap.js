// ============================================================================
//  SONDER — UMAP (3D coords for three similarity signals)
// ============================================================================
//  Sections:
//     [VECTORS]   build the input matrix for each signal
//     [RUN]       runUmap — call umap-js, return 3D coords normalized for Three.js
//     [PIPELINE]  computeAllLayouts — embed + UMAP all three signals at once
// ============================================================================
//
//  Three signals, three separate UMAP runs:
//    • audio   — CLAP embedding of each memory's song (512 dims)
//    • social  — user-co-occurrence vector per memory (N_users dims)
//    • context — CLAP embedding of the user's note text (512 dims)
//
//  Output per signal: [[x,y,z], [x,y,z], ...] in same order as input memories,
//  scaled to fit inside Three.js's viewport box (~±6 units).
// ============================================================================

import { UMAP } from 'umap-js';
import { embedMemoryIfNeeded } from './embeddings.js';


// ============================================================================
//  [VECTORS]
// ============================================================================

// Audio: each memory's CLAP audio-or-fallback vector.
function buildAudioVectors(memories) {
  return memories.map((m) => m.embeddingAudio || null);
}

// Context: each memory's CLAP note-text vector.
function buildContextVectors(memories) {
  return memories.map((m) => m.embeddingNote || null);
}

// Social: for each memory, a binary vector over all users indicating which
// users have ALSO logged this exact song (same spotifyId). Memories of the
// same song share a row → they cluster. Memories of songs with overlapping
// listener sets end up nearby.
function buildSocialVectors(memories) {
  const users = [...new Set(memories.map((m) => m.uid).filter(Boolean))];
  const userIdx = new Map(users.map((u, i) => [u, i]));

  const loggersBySong = new Map();
  for (const m of memories) {
    const s = m.song?.spotifyId;
    if (!s) continue;
    if (!loggersBySong.has(s)) loggersBySong.set(s, new Set());
    loggersBySong.get(s).add(m.uid);
  }

  return memories.map((m) => {
    const row = new Array(users.length).fill(0);
    const loggers = loggersBySong.get(m.song?.spotifyId);
    if (loggers) for (const u of loggers) row[userIdx.get(u)] = 1;
    return row;
  });
}


// ============================================================================
//  [RUN]  umap-js wrapper + normalization to Three.js viewport
// ============================================================================
//  Filters out memories whose vector is missing (embedding failed) and returns
//  coords aligned to the *filtered* list — caller gets back { coords, ids }.
// ============================================================================
function runUmap(memories, vectors) {
  // keep only rows that have a vector
  const keep = [];
  const valid = [];
  for (let i = 0; i < memories.length; i++) {
    if (Array.isArray(vectors[i]) && vectors[i].length > 0) {
      keep.push(memories[i].id);
      valid.push(vectors[i]);
    }
  }
  if (valid.length < 2) return { ids: keep, coords: valid.map(() => [0, 0, 0]) };

  // UMAP needs nNeighbors < nSamples. Scale down for tiny datasets.
  const nNeighbors = Math.max(2, Math.min(10, valid.length - 1));
  const umap = new UMAP({
    nComponents: 3,
    nNeighbors,
    minDist: 0.3,
    spread: 1.0
  });
  const raw = umap.fit(valid);
  return { ids: keep, coords: normalize(raw) };
}

// Scale UMAP output (arbitrary range) to roughly ±6 on each axis for Three.js.
function normalize(coords) {
  if (coords.length === 0) return coords;
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];
  for (const c of coords) for (let d = 0; d < 3; d++) {
    if (c[d] < mins[d]) mins[d] = c[d];
    if (c[d] > maxs[d]) maxs[d] = c[d];
  }
  const scale = 12; // total span
  return coords.map((c) => c.map((v, d) => {
    const range = maxs[d] - mins[d] || 1;
    return ((v - mins[d]) / range - 0.5) * scale;
  }));
}


// ============================================================================
//  [PIPELINE]  embed-if-needed then run all three UMAPs
// ============================================================================
export async function computeAllLayouts(memories, onProgress = () => {}) {
  // 1. Ensure every memory has its CLAP vectors cached. Serial, to avoid
  //    hammering the proxy. ~1–3s per uncached memory; instant for cached.
  for (let i = 0; i < memories.length; i++) {
    onProgress({ stage: 'embedding', done: i, total: memories.length });
    await embedMemoryIfNeeded(memories[i]);
  }
  onProgress({ stage: 'embedding', done: memories.length, total: memories.length });

  // 2. Three parallel UMAP runs.
  onProgress({ stage: 'umap' });
  const audio   = runUmap(memories, buildAudioVectors(memories));
  const context = runUmap(memories, buildContextVectors(memories));
  const social  = runUmap(memories, buildSocialVectors(memories));

  // 3. Index by memory id for O(1) lookup in the render loop.
  return {
    audio:   toMap(audio),
    social:  toMap(social),
    context: toMap(context)
  };
}

function toMap({ ids, coords }) {
  const m = new Map();
  ids.forEach((id, i) => m.set(id, coords[i]));
  return m;
}
