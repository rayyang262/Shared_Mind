# Shared Mind

**ITP/NYU — Spring 2026**

A semester-long exploration of *vibe coding* — building creative, interactive web experiences through conversation with AI. Each week pushed the boundaries of what's possible when human intuition meets machine intelligence, from simple canvas experiments to full 3D multiplayer worlds with hand tracking and voice control.

---

## Projects

| Week | Project | Live Demo |
|------|---------|-----------|
| 1 | [Marble Canvas](#week-1--marble-canvas) | [View](https://rayyang262.github.io/Shared_Mind/Week1/) |
| 2 | [Sticky Note Agents](#week-2--sticky-note-agents) | [View](https://rayyang262.github.io/Shared_Mind/Week2/) |
| 3 | [Experiments](#week-3--experiments) | [View](https://rayyang262.github.io/Shared_Mind/week3/) |
| 4 | [Constellation — Navigate by Creation](#week-4--constellation) | [View](https://rayyang262.github.io/Shared_Mind/week4/) |
| 5 | [Sticky Notes — Motivated Squad](#week-5--motivated-squad) | [View](https://rayyang262.github.io/Shared_Mind/week5/) |
| 6 | [Shape World](#week-6--shape-world) | [View](https://rayyang262.github.io/Shared_Mind/Week6/) |
| 8 | [The Elevator](#week-8--the-elevator) | [View](https://rayyang262.github.io/Shared_Mind/Week8/) |

---

## Week 1 — Marble Canvas

An interactive particle system where physics-based marbles roll, collide, and react on an HTML canvas. A first experiment in using AI to rapidly prototype visual, playful interactions.

## Week 2 — Sticky Note Agents

A multi-agent AI visualization built with sticky notes. Autonomous agents move, interact, and display emergent behaviors on screen — exploring how simple rules create complex group dynamics.

## Week 3 — Experiments

An early-stage experimental sketch. A sandbox week for trying ideas that didn't become full projects but informed later work.

## Week 4 — Constellation

*Navigate by Creation.* A constellation-based navigation experience where user actions shape the star map. Movement through the space is an act of creation itself.

## Week 5 — Motivated Squad

A return to the sticky note format with a twist — agents now have motivations, goals, and personalities. They form squads, collaborate, and sometimes disagree.

## Week 6 — Shape World

A Three.js 3D environment with Google authentication. Users enter a shared shape world where geometry responds to presence and interaction. The first step toward multiplayer spatial experiences.

## Week 8 — The Elevator

The culmination of the semester. A full-featured 3D social media platform built around the metaphor of an elevator moving through a conceptual embedding space:

- **X axis** — Intimacy (public to private)
- **Y axis** — Resonance (friction to harmony)
- **Z axis** — Energy (ambient to urgent)

Users navigate this space, transmit thoughts, and generate AI images that morph based on their position. Features include:

- **Hand tracking** via MediaPipe — right hand index finger controls movement, left hand controls camera rotation and zoom
- **Voice input** via Web Speech API — hold a high-five gesture for 3 seconds to activate speech-to-text, which auto-fills and submits
- **Real-time AI image generation** via Replicate (Imagen 4) — images shift based on your position in the space
- **Multiplayer presence** via Firebase — see other users as colored orbs, share generated images across the network
- **Fog of war** — the 3D grid reveals itself as you explore
- **Keyboard, mouse, and gesture fallbacks** — all input methods coexist

## Final Project — Sonder

A proposal and case study exploring the concept of *sonder* — the realization that every passerby has a life as vivid and complex as your own. This project synthesizes the themes of shared presence, AI collaboration, and spatial interaction developed throughout the semester.

---

## Tech Stack

| Technology | Used In |
|------------|---------|
| Three.js | Week 6, Week 8 |
| Firebase (Auth + Realtime DB) | Week 6, Week 8 |
| MediaPipe Hands | Week 8 |
| Web Speech API | Week 8 |
| Replicate API (Imagen 4) | Week 8 |
| HTML Canvas | Week 1, Week 2, Week 5 |
| Vanilla JS (ES Modules) | All weeks |
| GitHub Pages | All weeks (deployment) |

---

*Ray Yang — IMA, NYU — 2026*
