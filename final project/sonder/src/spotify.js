// ============================================================================
//  SONDER — SPOTIFY (token + search)
// ============================================================================
//  Sections:
//     [TOKEN]   localStorage helpers (set / get / clear)
//     [SEARCH]  search Spotify catalog for tracks
// ============================================================================
//
//  PROTOTYPE NOTE — token handling:
//     Real auth is Authorization Code + PKCE (wire up later).
//     For now: get a token via curl in terminal, paste it in the Log screen.
//
//     curl -X POST "https://accounts.spotify.com/api/token" \
//       -H "Content-Type: application/x-www-form-urlencoded" \
//       -d "grant_type=client_credentials&client_id=YOUR_ID&client_secret=YOUR_SECRET"
//
//     Tokens expire after ~1 hour. Re-paste when search starts failing.
// ============================================================================


// ============================================================================
//  [TOKEN]  localStorage helpers
// ============================================================================
export function setToken(token)  { localStorage.setItem('spotify_token', token); }
export function getToken()       { return localStorage.getItem('spotify_token'); }
export function clearToken()     { localStorage.removeItem('spotify_token'); }


// ============================================================================
//  [SEARCH]  search Spotify catalog for tracks
// ============================================================================
export async function searchTracks(query, limit = 8) {
  const token = getToken();
  if (!token) throw new Error('No Spotify token. Paste one in the Log screen.');

  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (res.status === 401) {
    clearToken();
    throw new Error('Spotify token expired. Paste a fresh one.');
  }
  if (!res.ok) throw new Error(`Spotify error: ${res.status}`);

  const data = await res.json();
  // Normalize all fields — Firestore rejects `undefined`, so coerce to null/''/[].
  return data.tracks.items.map((t) => ({
    spotifyId:  t.id ?? null,
    name:       t.name ?? '',
    artists:    t.artists?.map((a) => a.name) ?? [],
    albumArt:   t.album?.images?.[0]?.url ?? null,
    previewUrl: t.preview_url ?? null
  }));
}
