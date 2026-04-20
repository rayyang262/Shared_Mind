# Sonder — Case Study Outline

A skeleton for the portfolio write-up. Fill in each section as you build through weeks 1–4.

---

## 1. Hook (1 sentence + hero image)
A single line that captures *why this matters*, paired with a screenshot or render of the constellation view.

> *Example: "Sonder is a place to keep the songs that mean something — and find the strangers whose memories overlap with yours."*

---

## 2. The Problem
- What did you originally set out to explore? (Shazam / FFT)
- What did you actually discover through user research? (Music sharing carries social risk; people self-censor)
- The Valentine's Day proposal anecdote — use this as the emotional anchor of the whole case study.

---

## 3. Research
- 5 user interviews — who, what you asked, what surfaced
- 1–2 standout quotes pulled directly from interviews
- The synthesis: what pattern repeated across all 5 conversations
- The reframed problem statement

---

## 4. Concept
- The core idea in one paragraph
- Sketches and wireframes (Figma exports)
- The 3 features that survived concept-testing with users; the ones you cut and why
- The decision to default memories to *public* — and what that says about the app's posture

---

## 5. Design Decisions
- **Why a constellation?** Each user's logs are personal but visually connected — a metaphor for memory itself.
- **Why public by default?** The discovery layer is dead without volume; private is the deliberate exception.
- **Why genre embeddings + co-occurrence?** Similarity that reflects shared *moments*, not just shared taste.
- **Why comments instead of DMs?** Lighter, on-brand, lower-stakes way to acknowledge a shared memory.
- **What does "private" actually mean?** Private memories are invisible to everyone but the author *and* excluded from the UMAP computation. Half-private would have been a betrayal of the promise.
- **Safety from day one.** Even a v0 prototype ships with delete-comment, block-user, and report — because emotional content invites emotional misuse.

---

## 6. Build
- Stack diagram: Spotify API → Firebase (Auth + Firestore) → Python UMAP on Cloud Functions → Three.js
- Screenshots of: log-a-memory flow, public/private toggle, constellation discovery view, comment thread
- Short clip / GIF of flying through the constellation

---

## 7. Reflection
- What worked
- What broke (and what you'd rebuild)
- What you'd do with another month
- What this taught you about the gap between *technical curiosity* and *user need* — the lesson of pivoting from FFT to feelings

---

## 8. Credits & Links
- Live site (Firebase Hosting URL)
- GitHub repo
- Notebook + podcast links
- Tools used: Three.js, Firebase, Spotify Web API, UMAP, Figma
