// Spotify search.
//
// PROTOTYPE NOTE:
// Real auth is Authorization Code + PKCE — wire that up later.
// For now we use a token pasted into localStorage under "spotify_token".
// Tokens expire ~1 hour, so re-paste when search starts failing.
//
// To get a token quickly for testing:
// 1. Go to developer.spotify.com/console/get-search-item/
// 2. Click "Get Token", check no scopes needed for search
// 3. Copy the token
// 4. In the browser console: localStorage.setItem('spotify_token', 'BQC...')

export function setToken(token) {
  localStorage.setItem('spotify_token', token);
}

export function getToken() {
  return localStorage.getItem('spotify_token');
}

export function clearToken() {
  localStorage.removeItem('spotify_token');
}

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
  // Normalize all fields to never be `undefined` — Firestore rejects undefined.
  return data.tracks.items.map((t) => ({
    spotifyId: t.id ?? null,
    name: t.name ?? '',
    artists: t.artists?.map((a) => a.name) ?? [],
    albumArt: t.album?.images?.[0]?.url ?? null,
    previewUrl: t.preview_url ?? null
  }));
}
