/**
 * Voice Input Module
 * Uses Web Speech API for speech-to-text conversion
 * Activated by right-hand high-five gesture
 */

class VoiceInput {
  constructor() {
    // Speech recognition setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    this.isListening = false;
    this.transcript = '';
    this.interimTranscript = '';
    this.finalTranscript = '';

    // Configure recognition
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    // Setup event handlers
    this.setupEventHandlers();

    // UI elements
    this.voiceIndicator = document.getElementById('voice-indicator');
    this.voiceStatus = this.voiceIndicator?.querySelector('.voice-status');
    this.voiceTranscript = document.getElementById('voice-transcript');
    this.postInput = document.getElementById('post-input');
    this.postBtn = document.getElementById('post-btn');

    // Gesture tracking
    this.highFiveActive = false;
  }

  setupEventHandlers() {
    // Start recognition
    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateUI('listening');
      console.log('Speech recognition started');
    };

    // Interim results (real-time transcript)
    this.recognition.onresult = (event) => {
      this.interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          this.finalTranscript += transcript + ' ';
        } else {
          this.interimTranscript += transcript;
        }
      }

      // Display transcript
      const displayText = this.finalTranscript + this.interimTranscript;
      this.updateTranscript(displayText);
    };

    // End recognition
    this.recognition.onend = () => {
      this.isListening = false;
      this.updateUI('ready');
      this.submitVoiceTranscript();
      console.log('Speech recognition ended');
    };

    // Error handling
    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.updateUI(`error: ${event.error}`);
    };
  }

  initialize() {
    console.log('Voice input module initialized');

    // Listen for high-five gesture from hand tracker
    window.addEventListener('gesture:rightHandHighFive', (e) => {
      if (e.detail.active) {
        this.startListening();
      } else {
        this.stopListening();
      }
    });
  }

  startListening() {
    if (this.isListening) return;

    this.highFiveActive = true;
    this.finalTranscript = '';
    this.interimTranscript = '';
    this.updateTranscript('');

    try {
      this.recognition.start();
    } catch (error) {
      // Recognition already started
      console.warn('Speech recognition already started:', error);
    }
  }

  stopListening() {
    if (!this.isListening) return;

    this.highFiveActive = false;

    try {
      this.recognition.stop();
    } catch (error) {
      console.warn('Error stopping speech recognition:', error);
    }
  }

  updateTranscript(text) {
    this.transcript = text;
    if (this.voiceTranscript) {
      this.voiceTranscript.textContent = text || '';
    }
  }

  submitVoiceTranscript() {
    const fullTranscript = (this.finalTranscript + this.interimTranscript).trim();

    if (fullTranscript) {
      console.log('Submitting voice transcript:', fullTranscript);

      // Set input field
      if (this.postInput) {
        this.postInput.value = fullTranscript;

        // Trigger input event to notify listeners
        this.postInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Simulate click on post button to submit
      if (this.postBtn) {
        setTimeout(() => {
          this.postBtn.click();
        }, 100);
      }

      // Clear transcript display
      setTimeout(() => {
        this.updateTranscript('');
      }, 500);
    }

    // Reset
    this.finalTranscript = '';
    this.interimTranscript = '';
  }

  updateUI(status) {
    if (this.voiceIndicator) {
      if (status === 'listening') {
        this.voiceIndicator.classList.remove('voice-off');
        this.voiceIndicator.classList.add('voice-on');
      } else {
        this.voiceIndicator.classList.remove('voice-on');
        this.voiceIndicator.classList.add('voice-off');
      }
    }

    if (this.voiceStatus) {
      this.voiceStatus.textContent = status;
    }
  }

  requestMicrophonePermission() {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' })
        .then((result) => {
          if (result.state === 'granted') {
            console.log('Microphone permission granted');
          } else if (result.state === 'prompt') {
            console.log('Microphone permission will be requested on first use');
          } else {
            console.warn('Microphone permission denied');
          }
        })
        .catch((error) => {
          console.warn('Could not query microphone permission:', error);
        });
    }
  }
}

// Initialize on page load
const voiceInput = new VoiceInput();

window.addEventListener('load', () => {
  console.log('Initializing voice input...');
  voiceInput.initialize();
  voiceInput.requestMicrophonePermission();
});

// Export for use in other modules
export { voiceInput, VoiceInput };
