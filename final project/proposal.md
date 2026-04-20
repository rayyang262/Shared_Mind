# Final Project Proposal
## Sonder — A Music Memory Archive

---

## What is the project?

**Sonder** is a music memory archive web app that lets people log songs tied to specific moments, places, and people in their lives.

Each entry consists of:
- A song
- A personal note
- A location
- A photo
- A date

Users can keep entries **private** or make them **public**. The app includes a **discovery layer** powered by **UMAP** that surfaces other users whose musical journeys have crossed yours — same song logged at the same time, the same location, or high overall taste similarity.

**Form:** A web app built with vanilla HTML/CSS/JS (`index.html`, `style.css`, `main.js`) and **Three.js** for the discovery visualization. Songs are pulled in via the **Spotify Web API**. User accounts and entries persist via **Firebase** (Auth + Firestore), with login via Google or email/password. UMAP dimensionality reduction runs on a **Python Firebase Cloud Function** and returns 2D/3D coordinates for the Three.js scene.

In the discovery scene, **each song-memory is a point**. All of a single user's memories are **linked together as a constellation**, anchored to that user's account. When constellations from different users overlap — same song, shared time, shared place — users can **comment on each other's logs**, turning a passive similarity match into a real conversation.

By default, a new memory is **public** (with an optional private toggle), so the discovery layer is meaningfully populated from day one. **Private memories are visible only to the user who logged them** — they do not contribute to that user's public UMAP position and do not appear in anyone else's constellation. Privacy is total, not partial.

---

## Who is it for?

**Gen-Z users** — teenagers through their mid-twenties. This demographic grew up as the first generation natively exposed to Spotify, music apps, and AI-driven recommendation systems. They have strong emotional relationships with music and existing habits around digital self-expression.

---

## Why this project?

My starting point was Shazam's FFT sound-matching technology. But during user interviews, I found something more compelling: people don't need better music *recognition* — they need a way to express what music *means* to them.

A recurring theme emerged across interviews: **music sharing carries social risk.** People self-censor out of fear of judgment. One interviewee described how a specific song became inseparable from her boyfriend's Valentine's Day proposal — a deeply personal memory she had nowhere to store except inside her own head.

Sonder gives that memory a home.

---

## Prior Art

| Project | What it does | What it inspires |
|---|---|---|
| **Last.fm** | Tracks your complete listening history | The idea of a longitudinal music record |
| **Spotify Wrapped** | Annual personalized listening recap | Emotional resonance of music data |
| **Pinterest** | Visual self-expression through curation | Public/private taste display, discovery by similarity |

---

## Weekly Schedule

| Week | Benchmarks |
|---|---|
| **Week 1** | Conduct 3 additional user interviews (total of 5, including **1 deliberate outlier** outside the Gen-Z / Spotify-native demographic to stress-test the concept), synthesize findings, finalize problem statement and concept direction |
| **Week 2** | Concept sketching, concept test with 3 users, nail down core flow, build wireframes in Figma |
| **Week 3** | Build prototype: log-a-memory feature (Spotify API search + Firebase persistence), public/private toggle, UMAP discovery view in Three.js (mock data, no audio), comment thread on each public memory, **v0 safety affordances** (delete own comment, block user, report) |
| **Week 4** | Polish prototype, deploy to GitHub, build portfolio case study |

---

## Technical Stack

| Layer | Tool | Purpose |
|---|---|---|
| Front-end | HTML / CSS / JS | Journal UI, entry forms, navigation, comments |
| 3D / Discovery | Three.js | Render constellation of song-memory points per user |
| Music data | Spotify Web API | Song search, metadata, album art, previews |
| Auth | Firebase Auth | Google sign-in + email/password |
| Database | Firebase Firestore | Memory entries, comments, public/private flags |
| Dimensionality reduction | Python UMAP on Firebase Cloud Functions | Genre embeddings + co-occurrence matrix → 2D/3D coords |
| Hosting | Firebase Hosting | Public deployment |

### Taste Vector

Each user's position in the UMAP space is computed from two signals:
- **Genre embeddings** — aggregated across all logged songs (via Spotify's genre tags / audio features)
- **Co-occurrence** — which songs and which other users appear in their logs

This means similarity isn't just "we like the same genres" — it's "our memories live in the same neighborhood."

---

## Supporting Materials

- **Notebook:** https://notebooklm.google.com/notebook/07a4ffce-5883-4536-8d47-0424a2ba63ff
- **Podcast:** https://notebooklm.google.com/notebook/07a4ffce-5883-4536-8d47-0424a2ba63ff?artifactId=6f79cd3c-9661-4959-ab28-6a57b30259ee
