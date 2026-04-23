// ===== FIREBASE CONFIGURATION =====
const firebaseConfig = {
  apiKey: "AIzaSyA8p9FvV4kxv2PnRlPza_sxQ9hRQSaMBGrLI",
  authDomain: "civil-tube-488204-m3.firebaseapp.com",
  projectId: "civil-tube-488204-m3",
  storageBucket: "civil-tube-488204-m3.firebasestorage.app",
  messagingSenderId: "410822418704",
  appId: "1:410822418704:web:00d54fd99374fb4ae9c595",
  measurementId: "G-8Q49ZKT4CG"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

console.log("✅ Firebase initialized!");

// ===== STATE =====
let state = {
    nodes: [],
    username: '',
    currentCreationId: null
};

// ===== CANVAS SETUP =====
const canvas = document.getElementById('constellation');
const ctx = canvas.getContext('2d');
let W, H;

function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
}

resize();
window.addEventListener('resize', resize);

// ===== FIREBASE SAVE FUNCTION =====
async function saveToFirebase() {
    const username = document.getElementById('username-input').value.trim();
    const userInput = document.getElementById('user-input').value.trim();
    
    if (!username) {
        alert('Please enter your name!');
        return;
    }
    
    if (!userInput) {
        alert('Please enter what you were thinking about!');
        return;
    }
    
    const status = document.getElementById('status');
    status.style.display = 'block';
    status.textContent = 'Saving to Firebase...';
    
    try {
        const creationData = {
            username: username,
            prompt: userInput,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('constellations').add(creationData);
        
        state.currentCreationId = docRef.id;
        state.username = username;
        
        status.textContent = `✅ Saved! ID: ${docRef.id.substring(0, 8)}...`;
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
        
        console.log('Saved to Firebase with ID:', docRef.id);
        
    } catch (error) {
        console.error('Error saving:', error);
        status.textContent = `Error: ${error.message}`;
    }
}

// ===== BUTTON HANDLERS =====
document.getElementById('save-btn').addEventListener('click', saveToFirebase);

document.getElementById('clear-btn').addEventListener('click', () => {
    document.getElementById('username-input').value = '';
    document.getElementById('user-input').value = '';
    console.log('Cleared inputs');
});

console.log("✅ App ready!");