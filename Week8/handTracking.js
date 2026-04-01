/**
 * Hand Tracking Module — Simplified Gesture Model
 *
 * RIGHT HAND (user's right):
 *   - Index finger only (others curled) → movement (swipe up/down/left/right)
 *   - All 5 fingers up (high-five) held 3 seconds → activate voice input
 *
 * LEFT HAND (user's left):
 *   - Swipe left/right → rotate camera
 *   - Palm up/down position → zoom in/out
 *
 * NOTE: MediaPipe labels are mirrored. "Left" from camera = user's RIGHT hand.
 */

class HandTracker {
  constructor() {
    this.hands = null;
    this.canvasElement = null;
    this.canvasCtx = null;
    this.video = null;

    // Left hand state (rotation + zoom)
    this.leftHand = {
      landmarks: null,
      swipeVector: { x: 0 },
      prevPalmPos: null,
      confidence: 0,
    };

    // Right hand state (movement + voice)
    this.rightHand = {
      landmarks: null,
      prevIndexPos: null,
      isIndexOnly: false,    // only index finger extended
      isHighFive: false,
      highFiveStart: 0,      // timestamp when high-five first detected
      highFiveActivated: false, // true after 3s hold
      confidence: 0,
    };

    // Tuning
    this.smoothingFactor = 0.25;
    this.lastEventTimes = {};
    this.debounceTime = 300;
    this.HIGH_FIVE_HOLD_MS = 3000; // 3 second hold to activate voice

    // Debug
    this.debugLines = [];
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsTime = Date.now();
  }

  async initialize() {
    this.canvasElement = document.getElementById('hand-canvas');
    this.video = document.getElementById('hand-video');
    if (!this.canvasElement || !this.video) return false;

    try {
      const { Hands } = window;
      this.hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
      this.hands.onResults(this.onResults.bind(this));
      this.canvasCtx = this.canvasElement.getContext('2d');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        this.video.srcObject = stream;
        this.video.setAttribute('playsinline', '');
        await new Promise((r) => { this.video.onloadedmetadata = () => { this.video.play(); r(); }; });
        this.processFrames();
        this.updateStatus('tracking active');
        return true;
      } catch (e) {
        console.error('Failed to access camera:', e);
        this.updateStatus('camera denied');
        return false;
      }
    } catch (e) {
      console.error('Failed to initialize hand tracking:', e);
      this.updateStatus('init failed');
      return false;
    }
  }

  processFrames() {
    let busy = false;
    const tick = async () => {
      if (!busy && this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
        busy = true;
        try { await this.hands.send({ image: this.video }); } catch (_) {}
        busy = false;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  // ── Results callback ────────────────────────────────────────────────────────
  onResults(results) {
    const ctx = this.canvasCtx;
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;
    ctx.clearRect(0, 0, w, h);
    this.debugLines = [];

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.leftHand.confidence = 0;
      this.leftHand.prevPalmPos = null;
      this.rightHand.confidence = 0;
      this.rightHand.prevIndexPos = null;
      this.resetHighFiveTimer();
      this.debugLines.push('no hands detected');
    }

    if (results.multiHandLandmarks) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const rawLabel = results.multiHandedness[i].label;
        const confidence = results.multiHandedness[i].score;

        // Swap: MediaPipe "Left" = user's RIGHT
        const userHand = rawLabel === 'Left' ? 'Right' : 'Left';
        this.drawLandmarks(ctx, landmarks, w, h, userHand);

        if (userHand === 'Left') {
          this.processLeftHand(landmarks, confidence);
        } else {
          this.processRightHand(landmarks, confidence);
        }
      }
    }

    this.drawDebugOverlay(ctx, w, h);
    this.updateFps();
  }

  // ── LEFT HAND: rotation (swipe) + zoom (palm Y) ────────────────────────────
  processLeftHand(landmarks, confidence) {
    this.leftHand.landmarks = landmarks;
    this.leftHand.confidence = confidence;

    const wrist = landmarks[0];
    const middleBase = landmarks[9];
    const palmPos = {
      x: (wrist.x + middleBase.x) / 2,
      y: (wrist.y + middleBase.y) / 2,
    };

    // ── Swipe → rotate ──
    if (this.leftHand.prevPalmPos) {
      const dx = palmPos.x - this.leftHand.prevPalmPos.x;
      this.leftHand.swipeVector.x =
        this.leftHand.swipeVector.x * (1 - this.smoothingFactor) +
        dx * this.smoothingFactor;

      const mag = Math.abs(this.leftHand.swipeVector.x);
      this.debugLines.push(`L swipe: ${mag.toFixed(4)}`);

      if (mag > 0.015) {
        this.emitEvent('gesture:leftHandRotate', {
          direction: this.leftHand.swipeVector.x > 0 ? 'left' : 'right',
          magnitude: mag,
        });
      }
    }

    // ── Palm Y vs camera midline → zoom ──
    // 0.5 = horizontal center of camera frame
    // Above midline (y < 0.5) = zoom in, below (y > 0.5) = zoom out
    const distFromMid = palmPos.y - 0.5;
    const DEAD_ZONE = 0.08; // ignore small deviations near center

    this.debugLines.push(`L zoom: y:${palmPos.y.toFixed(2)} dist:${distFromMid.toFixed(3)}`);

    if (Math.abs(distFromMid) > DEAD_ZONE) {
      this.emitEvent('gesture:leftHandZoom', {
        direction: distFromMid < 0 ? 'in' : 'out',
        magnitude: Math.abs(distFromMid) - DEAD_ZONE,
      });
    }

    this.leftHand.prevPalmPos = palmPos;
  }

  // ── RIGHT HAND: index-only movement OR high-five voice ──────────────────────
  processRightHand(landmarks, confidence) {
    this.rightHand.landmarks = landmarks;
    this.rightHand.confidence = confidence;

    const fingersUp = this.countFingersUp(landmarks);
    const isIndexOnly = this.detectIndexOnly(landmarks);
    const isHighFive = fingersUp >= 5;

    this.rightHand.isIndexOnly = isIndexOnly;
    this.debugLines.push(`R fingers:${fingersUp} idx:${isIndexOnly ? 'Y' : 'n'} hi5:${isHighFive ? 'Y' : 'n'}`);

    // ── HIGH-FIVE: 3-second hold for voice ──
    if (isHighFive) {
      if (!this.rightHand.isHighFive) {
        // Just started high-five
        this.rightHand.highFiveStart = Date.now();
        this.rightHand.isHighFive = true;
      }

      const held = Date.now() - this.rightHand.highFiveStart;
      const remaining = Math.max(0, this.HIGH_FIVE_HOLD_MS - held);
      this.debugLines.push(`hi5 hold: ${(held / 1000).toFixed(1)}s / 3s`);

      if (held >= this.HIGH_FIVE_HOLD_MS && !this.rightHand.highFiveActivated) {
        this.rightHand.highFiveActivated = true;
        this.emitEvent('gesture:rightHandHighFive', { active: true });
        this.debugLines.push('VOICE ACTIVATED');
      }

      // Don't track index movement during high-five
      this.rightHand.prevIndexPos = null;
      return;
    } else {
      // Hand dropped from high-five
      if (this.rightHand.isHighFive) {
        if (this.rightHand.highFiveActivated) {
          this.emitEvent('gesture:rightHandHighFive', { active: false });
        }
        this.resetHighFiveTimer();
      }
    }

    // ── INDEX ONLY: movement tracking ──
    if (isIndexOnly) {
      const indexTip = landmarks[8];

      if (this.rightHand.prevIndexPos) {
        const deltaX = indexTip.x - this.rightHand.prevIndexPos.x;
        const deltaY = indexTip.y - this.rightHand.prevIndexPos.y;

        this.debugLines.push(`R move: dx:${deltaX.toFixed(4)} dy:${deltaY.toFixed(4)}`);

        if (Math.abs(deltaX) > 0.015 || Math.abs(deltaY) > 0.015) {
          this.emitEvent('gesture:rightHandMove', {
            x: indexTip.x,
            y: indexTip.y,
            deltaX,
            deltaY,
          });
        }
      }

      this.rightHand.prevIndexPos = { x: indexTip.x, y: indexTip.y };
    } else {
      // Not index-only — reset tracking
      this.rightHand.prevIndexPos = null;
    }
  }

  resetHighFiveTimer() {
    this.rightHand.isHighFive = false;
    this.rightHand.highFiveStart = 0;
    this.rightHand.highFiveActivated = false;
  }

  // ── Gesture detection helpers ───────────────────────────────────────────────

  /** Returns true if ONLY the index finger is extended (others curled) */
  detectIndexOnly(landmarks) {
    // Index: tip above PIP
    const indexUp = landmarks[8].y < landmarks[6].y;

    // Middle, ring, pinky: tips BELOW their PIP joints (curled)
    const middleCurled = landmarks[12].y > landmarks[10].y;
    const ringCurled   = landmarks[16].y > landmarks[14].y;
    const pinkyCurled  = landmarks[20].y > landmarks[18].y;

    // Thumb can be either way — ignore it
    return indexUp && middleCurled && ringCurled && pinkyCurled;
  }

  /** Count how many fingers are extended upward */
  countFingersUp(landmarks) {
    const tips = [8, 12, 16, 20];
    const mcps = [5, 9, 13, 17];
    let count = 0;
    for (let i = 0; i < tips.length; i++) {
      if (landmarks[tips[i]].y < landmarks[mcps[i]].y) count++;
    }
    // Thumb
    const thumbTip = landmarks[4];
    const thumbBase = landmarks[2];
    const palmCenter = landmarks[9];
    if (Math.abs(thumbTip.x - palmCenter.x) > Math.abs(thumbBase.x - palmCenter.x)) count++;
    return count;
  }

  euclideanDistance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ── Event emission with per-type debounce ───────────────────────────────────
  emitEvent(name, data) {
    const now = Date.now();
    // High-five events bypass debounce (need precise timing)
    if (name !== 'gesture:rightHandHighFive') {
      const last = this.lastEventTimes[name] || 0;
      if (now - last < this.debounceTime) return;
    }
    this.lastEventTimes[name] = now;
    window.dispatchEvent(new CustomEvent(name, { detail: data }));
  }

  // ── Drawing ─────────────────────────────────────────────────────────────────
  drawLandmarks(ctx, landmarks, w, h, handLabel) {
    const color = handLabel === 'Left' ? '#4dc8ff' : '#ffaa2d';
    const connections = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],
      [0,17],
    ];
    ctx.strokeStyle = color + '88';
    ctx.lineWidth = 1.5;
    for (const [a, b] of connections) {
      ctx.beginPath();
      ctx.moveTo((1 - landmarks[a].x) * w, landmarks[a].y * h);
      ctx.lineTo((1 - landmarks[b].x) * w, landmarks[b].y * h);
      ctx.stroke();
    }
    for (let j = 0; j < landmarks.length; j++) {
      const lm = landmarks[j];
      const x = (1 - lm.x) * w;
      const y = lm.y * h;
      const isTip = [4, 8, 12, 16, 20].includes(j);
      ctx.beginPath();
      ctx.arc(x, y, isTip ? 4 : 2, 0, 2 * Math.PI);
      ctx.fillStyle = isTip ? '#fff' : color;
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.font = '10px monospace';
    ctx.fillText(handLabel, (1 - landmarks[0].x) * w - 10, landmarks[0].y * h + 15);
  }

  drawDebugOverlay(ctx, w, h) {
    const lines = this.debugLines;
    if (!lines.length) return;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, h - 14 * (lines.length + 1), w, 14 * (lines.length + 1));
    ctx.fillStyle = '#0f0';
    ctx.font = '10px monospace';
    lines.forEach((line, i) => {
      ctx.fillText(line, 4, h - 6 - (lines.length - 1 - i) * 14);
    });
  }

  updateStatus(status) {
    const el = document.getElementById('hand-status');
    if (el) el.textContent = status;
  }

  updateFps() {
    this.frameCount++;
    const now = Date.now();
    if (now - this.lastFpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
      const lc = this.leftHand.confidence ? (this.leftHand.confidence * 100).toFixed(0) : '-';
      const rc = this.rightHand.confidence ? (this.rightHand.confidence * 100).toFixed(0) : '-';
      this.updateStatus(`${this.fps}fps · L:${lc}% R:${rc}%`);
    }
  }

  destroy() {
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop());
    }
    if (this.hands) this.hands.close();
  }
}

// Initialize
const handTracker = new HandTracker();
window.addEventListener('load', async () => {
  console.log('Initializing hand tracking...');
  const ok = await handTracker.initialize();
  if (!ok) console.warn('Hand tracking unavailable — falling back to keyboard/mouse');
});
window.addEventListener('beforeunload', () => handTracker.destroy());

export { handTracker, HandTracker };
