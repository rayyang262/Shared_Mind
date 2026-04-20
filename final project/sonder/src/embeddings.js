// ============================================================================
//  SONDER — EMBEDDINGS (CLAP via ITP Replicate proxy)
// ============================================================================
//  Sections:
//     [CONFIG]    proxy URL, CLAP model version
//     [CORE]      embedClap() — audio OR text → 512-dim vector
//     [BATCH]     embedMemoryIfNeeded() — caches audio + note vectors on the memory doc
// ============================================================================

import { updateMemoryEmbeddings } from './firebase.js';


// ============================================================================
//  [CONFIG]
// ============================================================================
const REPLICATE_PROXY = 'https://itp-ima-replicate-proxy.web.app/api/create_n_get';

// Paste the latest hash from https://replicate.com/lucataco/clap/api (look for "version")
// Updates occasionally — if calls start failing with "invalid version", re-grab it.
const CLAP_VERSION = 'PASTE_CLAP_VERSION_HASH_HERE';


// ============================================================================
//  [CORE]  embedClap — one input (audio URL or text), returns 512-dim vector
// ============================================================================
export async function embedClap({ audioUrl = null, text = null }) {
  if (!audioUrl && !text) throw new Error('embedClap needs audioUrl or text');

  const input = audioUrl ? { audio: audioUrl } : { text };

  const res = await fetch(REPLICATE_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: CLAP_VERSION, input })
  });

  if (!res.ok) throw new Error(`CLAP proxy ${res.status}: ${await res.text()}`);

  const data = await res.json();
  // ITP proxy wraps Replicate's response — the embedding lives under data.output.
  // lucataco/clap typically returns an array of floats, or { embedding: [...] }.
  const out = data.output;
  if (Array.isArray(out))                  return out;
  if (Array.isArray(out?.embedding))       return out.embedding;
  if (Array.isArray(out?.[0]))             return out[0];
  throw new Error(`Unexpected CLAP output shape: ${JSON.stringify(out).slice(0, 200)}`);
}


// ============================================================================
//  [BATCH]  embed + cache on a memory doc (skips if already cached)
// ============================================================================
//  For each memory we compute two vectors:
//    • embeddingAudio — CLAP(preview_url) if available, else CLAP(text fallback)
//    • embeddingNote  — CLAP(note text) if note is non-empty
//  Both are 512-dim arrays of floats, written back to Firestore so we only
//  hit Replicate once per memory, ever.
// ============================================================================
export async function embedMemoryIfNeeded(memory) {
  const updates = {};

  // --- audio vector ---
  if (!Array.isArray(memory.embeddingAudio)) {
    const previewUrl = memory.song?.previewUrl;
    const fallbackText = buildSongText(memory);
    try {
      const vec = previewUrl
        ? await embedClap({ audioUrl: previewUrl })
        : await embedClap({ text: fallbackText });
      updates.embeddingAudio = vec;
    } catch (e) {
      console.warn(`[embed] audio failed for ${memory.id}:`, e.message);
    }
  }

  // --- note vector (skip if note is empty) ---
  const note = (memory.note || '').trim();
  if (note && !Array.isArray(memory.embeddingNote)) {
    try {
      updates.embeddingNote = await embedClap({ text: note });
    } catch (e) {
      console.warn(`[embed] note failed for ${memory.id}:`, e.message);
    }
  }

  if (Object.keys(updates).length) {
    await updateMemoryEmbeddings(memory.id, updates);
    Object.assign(memory, updates); // mutate in place so caller sees new values
  }
  return memory;
}

function buildSongText(m) {
  const artists = (m.song?.artists || []).join(', ');
  const name    = m.song?.name || '';
  return `${artists} — ${name}`.trim() || 'unknown song';
}
