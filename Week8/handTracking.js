/**
 * Hand Tracking Module
 * Uses MediaPipe Hands to detect hand gestures and emit events
 *
 * Gestures detected:
 * - Left hand swipe: rotate camera
 * - Left hand pinch: zoom in/out
 * - Right hand index finger: movement control
 * - Right hand high-five: activate voice input
 */

class HandTracker {
  constructor() {
    this.hands = null;
    this.camera = null;
    this.canvasElement = null;
    this.canvasCtx = null;
    this.video = null;

    // Hand state tracking
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
    this.smoothingFactor = 0.3;
    this.debounceTime = 50;
    this.lastEventTime = 0;

    // Performance monitoring
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsTime = Date.now();
  }

  async initialize() {
    // Get canvas and video elements
    this.canvasElement = document.getElementById('hand-canvas');
    this.video = document.getElementById('hand-video');

    if (!this.canvasElement || !this.video) {
      console.error('Hand tracking canvas or video element not found');
      return false;
    }

    // Initialize MediaPipe Hands
    try {
      const { Hands } = window;

      this.hands = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0, // 0=lite for performance, 1=full
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.hands.onResults(this.onResults.bind(this));

      // Get canvas context
      this.canvasCtx = this.canvasElement.getContext('2d', { willReadFrequently: true });

      // Setup canvas size
      this.canvasElement.width = window.innerWidth;
      this.canvasElement.height = window.innerHeight;
      this.canvasElement.style.display = 'none'; // Hide by default

      // Setup camera - use native getUserMedia instead of MediaPipe Camera utility
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });

        this.video.srcObject = stream;

        // Wait for video to be ready
        await new Promise((resolve) => {
          this.video.onloadedmetadata = () => {
            this.video.play();
            resolve();
          };
        });

        // Start processing frames
        this.processFrames();

        this.updateStatus('initialized');
        return true;
      } catch (error) {
        console.error('Failed to access camera:', error);
        this.updateStatus('camera access denied');
        return false;
      }
    } catch (error) {
      console.error('Failed to initialize hand tracking:', error);
      this.updateStatus('failed to initialize');
      return false;
    }
  }

  processFrames() {
    const processFrame = async () => {
      if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
        await this.hands.send({ image: this.video });
      }
      requestAnimationFrame(processFrame);
    };
    processFrame();
  }

  onResults(results) {
    // Clear canvas
    if (this.canvasCtx) {
      this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    }

    // Process results
    if (results.multiHandLandmarks) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i].label;
        const confidence = results.multiHandedness[i].score;

        if (handedness === 'Left') {
          this.processLeftHand(landmarks, confidence);
        } else if (handedness === 'Right') {
          this.processRightHand(landmarks, confidence);
        }
      }
    }

    // Update FPS
    this.updateFps();
  }

  processLeftHand(landmarks, confidence) {
    this.leftHand.landmarks = landmarks;
    this.leftHand.confidence = confidence;

    // Calculate palm position (average of wrist and middle finger base)
    const wrist = landmarks[0];
    const middleBase = landmarks[9];
    const palmPos = {
      x: (wrist.x + middleBase.x) / 2,
      y: (wrist.y + middleBase.y) / 2,
    };

    // Calculate swipe (palm movement over time)
    if (this.leftHand.prevPalmPos) {
      const swipeX = palmPos.x - this.leftHand.prevPalmPos.x;
      const swipeY = palmPos.y - this.leftHand.prevPalmPos.y;

      // Apply smoothing
      this.leftHand.swipeVector.x = this.leftHand.swipeVector.x * (1 - this.smoothingFactor) + swipeX * this.smoothingFactor;
      this.leftHand.swipeVector.y = this.leftHand.swipeVector.y * (1 - this.smoothingFactor) + swipeY * this.smoothingFactor;

      // Emit swipe events
      if (Math.abs(this.leftHand.swipeVector.x) > 0.02) {
        this.emitEvent('gesture:leftHandRotate', {
          direction: this.leftHand.swipeVector.x > 0 ? 'right' : 'left',
          magnitude: Math.abs(this.leftHand.swipeVector.x),
        });
      }
    }

    // Calculate pinch distance (distance between thumb and index finger)
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const pinchDistance = this.euclideanDistance(thumbTip, indexTip);

    // Emit pinch events
    if (this.leftHand.pinchDistance > 0) {
      const pinchDelta = pinchDistance - this.leftHand.pinchDistance;
      if (Math.abs(pinchDelta) > 0.01) {
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

    // Get index finger position (tip = landmarks[8])
    const indexTip = landmarks[8];
    this.rightHand.indexPos = { x: indexTip.x, y: indexTip.y };

    // Emit index position event (continuous tracking)
    if (this.rightHand.prevIndexPos) {
      const deltaX = indexTip.x - this.rightHand.prevIndexPos.x;
      const deltaY = indexTip.y - this.rightHand.prevIndexPos.y;

      if (Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) {
        this.emitEvent('gesture:rightHandMove', {
          x: indexTip.x,
          y: indexTip.y,
          deltaX: deltaX,
          deltaY: deltaY,
        });
      }
    }

    // Detect high-five (all 5 fingers extended upward)
    const isHighFive = this.detectHighFive(landmarks);
    if (isHighFive && !this.rightHand.isHighFive) {
      this.emitEvent('gesture:rightHandHighFive', { active: true });
    } else if (!isHighFive && this.rightHand.isHighFive) {
      this.emitEvent('gesture:rightHandHighFive', { active: false });
    }
    this.rightHand.isHighFive = isHighFive;

    // Count visible fingers
    this.rightHand.fingerCount = this.countFingers(landmarks);

    this.rightHand.prevIndexPos = { x: indexTip.x, y: indexTip.y };
  }

  detectHighFive(landmarks) {
    // High-five: all 5 finger tips above their PIP joints, palm facing camera
    // Indices: 4=thumb, 8=index, 12=middle, 16=ring, 20=pinky
    // PIP joints: 3=thumb, 7=index, 11=middle, 15=ring, 19=pinky

    const fingerTips = [4, 8, 12, 16, 20];
    const pipJoints = [3, 7, 11, 15, 19];

    let allFingersUp = true;
    for (let i = 0; i < fingerTips.length; i++) {
      const tipY = landmarks[fingerTips[i]].y;
      const pipY = landmarks[pipJoints[i]].y;
      if (tipY >= pipY) {
        allFingersUp = false;
        break;
      }
    }

    // Also check that palm is roughly facing camera (wrist below middle knuckle)
    const wrist = landmarks[0];
    const middleKnuckle = landmarks[5];
    const palmFacingCamera = wrist.z > middleKnuckle.z;

    return allFingersUp && palmFacingCamera;
  }

  countFingers(landmarks) {
    // Count how many fingers are visible/extended
    const fingerTips = [4, 8, 12, 16, 20];
    let count = 0;

    for (const tipIdx of fingerTips) {
      const tip = landmarks[tipIdx];
      if (tip.visibility > 0.5) {
        count++;
      }
    }

    return count;
  }

  euclideanDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    const dz = (point1.z || 0) - (point2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  emitEvent(eventName, data) {
    // Debounce events
    const now = Date.now();
    if (now - this.lastEventTime < this.debounceTime) {
      return;
    }
    this.lastEventTime = now;

    // Emit custom event
    const event = new CustomEvent(eventName, { detail: data });
    window.dispatchEvent(event);
  }

  updateStatus(status) {
    const statusEl = document.getElementById('hand-status');
    if (statusEl) {
      statusEl.textContent = status;
    }
  }

  updateFps() {
    this.frameCount++;
    const now = Date.now();
    if (now - this.lastFpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;

      // Update status with FPS and confidence
      const leftConf = this.leftHand.confidence ? (this.leftHand.confidence * 100).toFixed(0) : '-';
      const rightConf = this.rightHand.confidence ? (this.rightHand.confidence * 100).toFixed(0) : '-';
      this.updateStatus(`${this.fps}fps · L:${leftConf}% R:${rightConf}%`);
    }
  }

  destroy() {
    if (this.camera) {
      this.camera.stop();
    }
    if (this.hands) {
      this.hands.close();
    }
  }
}

// Initialize on page load
const handTracker = new HandTracker();

window.addEventListener('load', async () => {
  console.log('Initializing hand tracking...');
  const success = await handTracker.initialize();
  if (!success) {
    console.warn('Hand tracking unavailable - falling back to keyboard/mouse');
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  handTracker.destroy();
});

// Export for use in other modules
export { handTracker, HandTracker };
