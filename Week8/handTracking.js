/**
 * Hand Tracking Module
 * Uses MediaPipe Hands to detect hand gestures and emit events
 *
 * Gestures detected:
 * - Left hand swipe: rotate camera
 * - Left hand pinch: zoom in/out
 * - Right hand index finger: movement control
 * - Right hand high-five: activate voice input
 *
 * NOTE: MediaPipe labels "Left"/"Right" from the camera's perspective.
 *       Since the webcam is mirrored, the user's RIGHT hand is labeled "Left"
 *       and the user's LEFT hand is labeled "Right". We swap internally.
 */

class HandTracker {
  constructor() {
    this.hands = null;
    this.canvasElement = null;
    this.canvasCtx = null;
    this.video = null;

    // Hand state tracking (from USER's perspective, not camera)
    this.leftHand = {
      landmarks: null,
      pinchDistance: 0,
      swipeVector: { x: 0, y: 0 },
      prevPalmPos: null,
      confidence: 0,
    };

    this.rightHand = {
      landmarks: null,
      indexPos: { x: 0, y: 0 },
      fingerCount: 0,
      isHighFive: false,
      prevIndexPos: null,
      confidence: 0,
    };

    // Gesture smoothing
    this.smoothingFactor = 0.35;

    // Per-event debounce timers
    this.lastEventTimes = {};
    this.debounceTime = 30; // ms per event type

    // Debug overlay
    this.debugLines = [];

    // Performance monitoring
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsTime = Date.now();
  }

  async initialize() {
    this.canvasElement = document.getElementById('hand-canvas');
    this.video = document.getElementById('hand-video');

    if (!this.canvasElement || !this.video) {
      console.error('Hand tracking canvas or video element not found');
      return false;
    }

    try {
      const { Hands } = window;

      this.hands = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });

      this.hands.onResults(this.onResults.bind(this));

      // Setup canvas
      this.canvasCtx = this.canvasElement.getContext('2d');

      // Get camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });

        this.video.srcObject = stream;
        this.video.setAttribute('playsinline', '');

        await new Promise((resolve) => {
          this.video.onloadedmetadata = () => {
            this.video.play();
            resolve();
          };
        });

        this.processFrames();
        this.updateStatus('tracking active');
        return true;
      } catch (error) {
        console.error('Failed to access camera:', error);
        this.updateStatus('camera denied');
        return false;
      }
    } catch (error) {
      console.error('Failed to initialize hand tracking:', error);
      this.updateStatus('init failed');
      return false;
    }
  }

  processFrames() {
    let processing = false;
    const processFrame = async () => {
      if (!processing && this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
        processing = true;
        try {
          await this.hands.send({ image: this.video });
        } catch (e) {
          // skip frame
        }
        processing = false;
      }
      requestAnimationFrame(processFrame);
    };
    processFrame();
  }

  onResults(results) {
    const ctx = this.canvasCtx;
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;

    // Clear canvas (video feed shown by <video> element underneath)
    ctx.clearRect(0, 0, w, h);

    // Reset debug lines
    this.debugLines = [];

    // Reset confidence if no hands detected
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.leftHand.confidence = 0;
      this.leftHand.prevPalmPos = null;
      this.rightHand.confidence = 0;
      this.rightHand.prevIndexPos = null;
      this.debugLines.push('no hands detected');
    }

    // Process detected hands
    if (results.multiHandLandmarks) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const rawLabel = results.multiHandedness[i].label;
        const confidence = results.multiHandedness[i].score;

        // SWAP labels: MediaPipe "Left" = user's RIGHT hand (mirrored camera)
        const userHand = rawLabel === 'Left' ? 'Right' : 'Left';

        // Draw landmarks on canvas (mirrored)
        this.drawLandmarks(ctx, landmarks, w, h, userHand);

        if (userHand === 'Left') {
          this.processLeftHand(landmarks, confidence);
        } else if (userHand === 'Right') {
          this.processRightHand(landmarks, confidence);
        }
      }
    }

    // Draw debug overlay
    this.drawDebugOverlay(ctx, w, h);

    this.updateFps();
  }

  drawLandmarks(ctx, landmarks, w, h, handLabel) {
    const color = handLabel === 'Left' ? '#4dc8ff' : '#ffaa2d';

    // Draw connections
    const connections = [
      [0,1],[1,2],[2,3],[3,4],       // thumb
      [0,5],[5,6],[6,7],[7,8],       // index
      [5,9],[9,10],[10,11],[11,12],  // middle
      [9,13],[13,14],[14,15],[15,16],// ring
      [13,17],[17,18],[18,19],[19,20],// pinky
      [0,17]                          // palm base
    ];

    ctx.strokeStyle = color + '88';
    ctx.lineWidth = 1.5;
    for (const [a, b] of connections) {
      ctx.beginPath();
      ctx.moveTo((1 - landmarks[a].x) * w, landmarks[a].y * h);
      ctx.lineTo((1 - landmarks[b].x) * w, landmarks[b].y * h);
      ctx.stroke();
    }

    // Draw points
    for (let j = 0; j < landmarks.length; j++) {
      const lm = landmarks[j];
      const x = (1 - lm.x) * w; // mirror X
      const y = lm.y * h;
      const r = [4, 8, 12, 16, 20].includes(j) ? 4 : 2; // bigger dots for fingertips

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = [4, 8, 12, 16, 20].includes(j) ? '#fff' : color;
      ctx.fill();
    }

    // Label
    ctx.fillStyle = color;
    ctx.font = '10px monospace';
    ctx.fillText(handLabel, (1 - landmarks[0].x) * w - 10, landmarks[0].y * h + 15);
  }

  drawDebugOverlay(ctx, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, h - 14 * (this.debugLines.length + 1), w, 14 * (this.debugLines.length + 1));

    ctx.fillStyle = '#0f0';
    ctx.font = '10px monospace';
    this.debugLines.forEach((line, i) => {
      ctx.fillText(line, 4, h - 6 - (this.debugLines.length - 1 - i) * 14);
    });
  }

  processLeftHand(landmarks, confidence) {
    this.leftHand.landmarks = landmarks;
    this.leftHand.confidence = confidence;

    // Palm position
    const wrist = landmarks[0];
    const middleBase = landmarks[9];
    const palmPos = {
      x: (wrist.x + middleBase.x) / 2,
      y: (wrist.y + middleBase.y) / 2,
    };

    // Swipe detection
    if (this.leftHand.prevPalmPos) {
      const swipeX = palmPos.x - this.leftHand.prevPalmPos.x;

      // Smoothed swipe
      this.leftHand.swipeVector.x =
        this.leftHand.swipeVector.x * (1 - this.smoothingFactor) +
        swipeX * this.smoothingFactor;

      const mag = Math.abs(this.leftHand.swipeVector.x);
      this.debugLines.push(`L swipe: ${this.leftHand.swipeVector.x.toFixed(4)} mag:${mag.toFixed(4)}`);

      if (mag > 0.005) {
        // Note: camera is mirrored, so we invert direction
        this.emitEvent('gesture:leftHandRotate', {
          direction: this.leftHand.swipeVector.x > 0 ? 'left' : 'right',
          magnitude: mag,
        });
      }
    }

    // Pinch distance
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const pinchDistance = this.euclideanDistance(thumbTip, indexTip);

    if (this.leftHand.pinchDistance > 0) {
      const pinchDelta = pinchDistance - this.leftHand.pinchDistance;
      this.debugLines.push(`L pinch: ${pinchDistance.toFixed(3)} d:${pinchDelta.toFixed(4)}`);

      if (Math.abs(pinchDelta) > 0.008) {
        this.emitEvent('gesture:leftHandZoom', {
          direction: pinchDelta > 0 ? 'out' : 'in',
          magnitude: Math.abs(pinchDelta),
          distance: pinchDistance,
        });
      }
    }

    this.leftHand.pinchDistance = pinchDistance;
    this.leftHand.prevPalmPos = palmPos;
  }

  processRightHand(landmarks, confidence) {
    this.rightHand.landmarks = landmarks;
    this.rightHand.confidence = confidence;

    const indexTip = landmarks[8];
    this.rightHand.indexPos = { x: indexTip.x, y: indexTip.y };

    // Index finger movement
    if (this.rightHand.prevIndexPos) {
      const deltaX = indexTip.x - this.rightHand.prevIndexPos.x;
      const deltaY = indexTip.y - this.rightHand.prevIndexPos.y;

      this.debugLines.push(`R idx: dx:${deltaX.toFixed(4)} dy:${deltaY.toFixed(4)}`);

      if (Math.abs(deltaX) > 0.008 || Math.abs(deltaY) > 0.008) {
        this.emitEvent('gesture:rightHandMove', {
          x: indexTip.x,
          y: indexTip.y,
          deltaX: deltaX,
          deltaY: deltaY,
        });
      }
    }

    // High-five detection
    const isHighFive = this.detectHighFive(landmarks);
    this.debugLines.push(`R hi5: ${isHighFive ? 'YES' : 'no'}`);

    if (isHighFive && !this.rightHand.isHighFive) {
      this.emitEvent('gesture:rightHandHighFive', { active: true });
    } else if (!isHighFive && this.rightHand.isHighFive) {
      this.emitEvent('gesture:rightHandHighFive', { active: false });
    }
    this.rightHand.isHighFive = isHighFive;
    this.rightHand.fingerCount = this.countFingers(landmarks);
    this.rightHand.prevIndexPos = { x: indexTip.x, y: indexTip.y };
  }

  detectHighFive(landmarks) {
    // All 5 fingertips above their MCP joints (more reliable than PIP)
    const tips = [8, 12, 16, 20]; // skip thumb, check 4 fingers
    const mcps = [5, 9, 13, 17];

    let fingersUp = 0;
    for (let i = 0; i < tips.length; i++) {
      if (landmarks[tips[i]].y < landmarks[mcps[i]].y) {
        fingersUp++;
      }
    }

    // Thumb: tip.x further from palm center than thumb base
    const thumbTip = landmarks[4];
    const thumbBase = landmarks[2];
    const palmCenter = landmarks[9];
    const thumbOut = Math.abs(thumbTip.x - palmCenter.x) > Math.abs(thumbBase.x - palmCenter.x);

    return fingersUp >= 4 && thumbOut;
  }

  countFingers(landmarks) {
    const tips = [8, 12, 16, 20];
    const mcps = [5, 9, 13, 17];
    let count = 0;
    for (let i = 0; i < tips.length; i++) {
      if (landmarks[tips[i]].y < landmarks[mcps[i]].y) count++;
    }
    // thumb
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

  emitEvent(eventName, data) {
    // Per-event-type debounce
    const now = Date.now();
    const lastTime = this.lastEventTimes[eventName] || 0;
    if (now - lastTime < this.debounceTime) return;
    this.lastEventTimes[eventName] = now;

    window.dispatchEvent(new CustomEvent(eventName, { detail: data }));
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

// Initialize on page load
const handTracker = new HandTracker();

window.addEventListener('load', async () => {
  console.log('Initializing hand tracking...');
  const success = await handTracker.initialize();
  if (!success) {
    console.warn('Hand tracking unavailable — falling back to keyboard/mouse');
  }
});

window.addEventListener('beforeunload', () => {
  handTracker.destroy();
});

export { handTracker, HandTracker };
