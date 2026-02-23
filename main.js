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

// ===== CONFIGURATION =====
const REPLICATE_PROXY = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
let REPLICATE_AUTH_TOKEN = ""; // User should set this token

// ===== GLOBAL STATE =====
const AppState = {
    notes: [],
    isDragging: false,
    draggedNote: null,
    mouseOffset: { x: 0, y: 0 },
    isGeneratingImage: false,
    isSavingToFirebase: false,
    db: db
};

// ===== DOM REFERENCES =====
const elements = {
    quoteInput: document.getElementById('quote-input'),
    authorInput: document.getElementById('author-input'),
    charCount: document.getElementById('char-count'),
    generateBtn: document.getElementById('generate-btn'),
    loadBtn: document.getElementById('load-btn'),
    clearAllBtn: document.getElementById('clear-all-btn'),
    container: document.getElementById('sticky-notes-container'),
    status: document.getElementById('status'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text')
};

// ===== INITIALIZATION =====
function init() {
    initializeEventListeners();
    loadNotesFromFirebase();
    console.log("✅ App initialized!");
}

// ===== MODULE A: FORM HANDLING & VALIDATION =====

function initializeEventListeners() {
    elements.generateBtn.addEventListener('click', handleGenerateClick);
    elements.loadBtn.addEventListener('click', handleLoadNotes);
    elements.clearAllBtn.addEventListener('click', handleClearAllNotes);
    elements.quoteInput.addEventListener('input', updateCharCount);

    // Drag & drop event delegation
    elements.container.addEventListener('mousedown', handleNoteMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

function updateCharCount() {
    const count = elements.quoteInput.value.length;
    elements.charCount.textContent = `${count} / 1000 characters`;
}

function validateInputs(quote, author) {
    const trimmedQuote = quote.trim();
    const trimmedAuthor = author.trim();

    if (!trimmedQuote) {
        showStatus("Please enter a motivational quote!", 'error');
        return null;
    }

    if (trimmedQuote.length < 10) {
        showStatus("Quote should be at least 10 characters long!", 'error');
        return null;
    }

    if (!trimmedAuthor) {
        showStatus("Please enter your name!", 'error');
        return null;
    }

    if (trimmedAuthor.length < 2) {
        showStatus("Name should be at least 2 characters long!", 'error');
        return null;
    }

    return { quote: trimmedQuote, author: trimmedAuthor };
}

async function handleGenerateClick() {
    const quote = elements.quoteInput.value;
    const author = elements.authorInput.value;

    const validated = validateInputs(quote, author);
    if (!validated) return;

    elements.generateBtn.disabled = true;
    showLoading(true);

    try {
        await createNewNote(validated.quote, validated.author);
        elements.quoteInput.value = '';
        elements.authorInput.value = '';
        updateCharCount();
        showStatus("✅ Note created and saved!", 'success');
    } catch (error) {
        console.error("Error creating note:", error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        elements.generateBtn.disabled = false;
        showLoading(false);
    }
}

function handleLoadNotes() {
    loadNotesFromFirebase();
    showStatus("✅ Notes loaded!", 'success');
}

async function handleClearAllNotes() {
    if (!confirm("Are you sure you want to delete all notes? This cannot be undone.")) {
        return;
    }

    try {
        const snapshot = await db.collection('sticky-notes').get();
        snapshot.forEach(doc => doc.ref.delete());

        elements.container.innerHTML = '';
        AppState.notes = [];
        showStatus("✅ All notes deleted!", 'success');
    } catch (error) {
        console.error("Error clearing notes:", error);
        showStatus(`Error: ${error.message}`, 'error');
    }
}

// ===== MODULE B: IMAGE GENERATION =====

async function generateImageFromQuote(quote, authorName) {
    // Create detailed prompt for nano-banana-pro
    const prompt = `An inspiring visual representation of the quote: "${quote}" by ${authorName}. Beautiful, artistic, motivational, high quality, professional design.`;

    try {
        showLoading(true, `Generating image for "${quote.substring(0, 30)}..."`);

        const response = await fetch(REPLICATE_PROXY, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${REPLICATE_AUTH_TOKEN}`
            },
            body: JSON.stringify({
                model: 'google/nano-banana-pro',
                input: {
                    prompt: prompt
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.status === 'succeeded' && data.output) {
            return data.output;
        } else if (data.error) {
            throw new Error(data.error);
        } else {
            throw new Error("Invalid response from image generation API");
        }
    } catch (error) {
        console.warn("Image generation failed, using placeholder:", error);
        return generatePlaceholderImage(quote, authorName);
    } finally {
        showLoading(false);
    }
}

function generatePlaceholderImage(quote, authorName) {
    // Create a canvas-based placeholder
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');

    // Generate gradient based on quote hash
    const hash = quote.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue = (hash % 360);

    const gradient = ctx.createLinearGradient(0, 0, 280, 280);
    gradient.addColorStop(0, `hsl(${hue}, 70%, 40%)`);
    gradient.addColorStop(1, `hsl(${(hue + 120) % 360}, 70%, 30%)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 280, 280);

    // Draw dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, 280, 280);

    // Draw text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px "DM Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Wrap and draw quote
    const lines = wrapText(ctx, quote, 240);
    const startY = 90;
    lines.forEach((line, i) => {
        ctx.fillText(line, 140, startY + i * 20);
    });

    // Draw author
    ctx.font = '12px "DM Mono", monospace';
    ctx.fillText(`— ${authorName}`, 140, 240);

    return canvas.toDataURL('image/png');
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
        const testLine = currentLine + words[i] + ' ';
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine.trim());
            currentLine = words[i] + ' ';
        } else {
            currentLine = testLine;
        }
    }

    if (currentLine) lines.push(currentLine.trim());
    return lines;
}

// ===== MODULE C: STICKY NOTE CREATION & RENDERING =====

async function createNewNote(quote, authorName) {
    const imageUrl = await generateImageFromQuote(quote, authorName);

    const noteData = {
        id: generateId(),
        quote: quote,
        author: authorName,
        imageUrl: imageUrl,
        position: {
            x: Math.random() * (window.innerWidth - 300),
            y: Math.random() * (window.innerHeight - 300) + 100
        },
        createdAt: new Date(),
        lastModified: new Date(),
        saved: false
    };

    AppState.notes.push(noteData);
    renderNoteToDOM(noteData);
    await saveNoteToFirebase(noteData);
}

function generateId() {
    return `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function renderNoteToDOM(noteData) {
    const noteEl = document.createElement('div');
    noteEl.className = 'sticky-note loading unsaved';
    noteEl.id = noteData.id;
    noteEl.style.left = noteData.position.x + 'px';
    noteEl.style.top = noteData.position.y + 'px';
    noteEl.style.backgroundImage = `url('${noteData.imageUrl}')`;

    const contentEl = document.createElement('div');
    contentEl.className = 'note-content';

    const quoteEl = document.createElement('div');
    quoteEl.className = 'note-quote';
    quoteEl.textContent = noteData.quote;

    const authorEl = document.createElement('div');
    authorEl.className = 'note-author';
    authorEl.textContent = `— ${noteData.author}`;

    contentEl.appendChild(quoteEl);
    contentEl.appendChild(authorEl);
    noteEl.appendChild(contentEl);

    // Store reference to note data
    noteEl.dataset.noteId = noteData.id;

    elements.container.appendChild(noteEl);

    // Remove loading class after image loads
    const img = new Image();
    img.onload = () => {
        noteEl.classList.remove('loading');
    };
    img.onerror = () => {
        noteEl.classList.remove('loading');
    };
    img.src = noteData.imageUrl;
}

// ===== MODULE D: DRAG & DROP =====

function handleNoteMouseDown(event) {
    const noteEl = event.target.closest('.sticky-note');
    if (!noteEl) return;

    AppState.isDragging = true;
    AppState.draggedNote = noteEl;

    const rect = noteEl.getBoundingClientRect();
    AppState.mouseOffset.x = event.clientX - rect.left;
    AppState.mouseOffset.y = event.clientY - rect.top;

    noteEl.classList.add('dragging');
    noteEl.classList.remove('unsaved');
}

function handleMouseMove(event) {
    if (!AppState.isDragging || !AppState.draggedNote) return;

    let newX = event.clientX - AppState.mouseOffset.x;
    let newY = event.clientY - AppState.mouseOffset.y;

    // Constrain to viewport
    const containerRect = elements.container.getBoundingClientRect();
    const maxX = containerRect.width - 280;
    const maxY = containerRect.height - 280;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    AppState.draggedNote.style.left = newX + 'px';
    AppState.draggedNote.style.top = newY + 'px';

    // Update state
    const noteId = AppState.draggedNote.id;
    const note = AppState.notes.find(n => n.id === noteId);
    if (note) {
        note.position.x = newX;
        note.position.y = newY;
    }
}

async function handleMouseUp(event) {
    if (!AppState.isDragging || !AppState.draggedNote) return;

    AppState.isDragging = false;
    const noteEl = AppState.draggedNote;
    noteEl.classList.remove('dragging');
    noteEl.classList.add('unsaved');

    // Save position to Firebase
    const noteId = noteEl.id;
    const note = AppState.notes.find(n => n.id === noteId);

    if (note) {
        try {
            await updateNotePositionInFirebase(noteId, note.position);
            noteEl.classList.remove('unsaved');
        } catch (error) {
            console.error("Error saving position:", error);
        }
    }

    AppState.draggedNote = null;
}

// ===== MODULE E: FIREBASE OPERATIONS =====

async function saveNoteToFirebase(noteData) {
    try {
        const docData = {
            quote: noteData.quote,
            author: noteData.author,
            imageUrl: noteData.imageUrl,
            position: noteData.position,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastModified: firebase.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('sticky-notes').add(docData);

        // Update local state with Firebase ID
        const note = AppState.notes.find(n => n.id === noteData.id);
        if (note) {
            note.firebaseId = docRef.id;
        }

        console.log('Note saved to Firebase:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        throw error;
    }
}

async function updateNotePositionInFirebase(noteId, position) {
    try {
        const note = AppState.notes.find(n => n.id === noteId);
        if (!note || !note.firebaseId) {
            console.warn("Note or Firebase ID not found");
            return;
        }

        await db.collection('sticky-notes').doc(note.firebaseId).update({
            position: position,
            lastModified: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('Position updated in Firebase');
    } catch (error) {
        console.error('Error updating position:', error);
        throw error;
    }
}

async function loadNotesFromFirebase() {
    try {
        showLoading(true, "Loading notes...");
        elements.container.innerHTML = '';
        AppState.notes = [];

        const snapshot = await db.collection('sticky-notes').get();

        snapshot.forEach(doc => {
            const data = doc.data();
            const noteData = {
                id: doc.id,
                firebaseId: doc.id,
                quote: data.quote,
                author: data.author,
                imageUrl: data.imageUrl,
                position: data.position || { x: 100, y: 100 },
                createdAt: data.createdAt?.toDate() || new Date(),
                lastModified: data.lastModified?.toDate() || new Date(),
                saved: true
            };

            AppState.notes.push(noteData);
            renderNoteToDOM(noteData);
        });

        console.log(`Loaded ${AppState.notes.length} notes from Firebase`);
    } catch (error) {
        console.error('Error loading notes:', error);
        showStatus("Error loading notes", 'error');
    } finally {
        showLoading(false);
    }
}

// ===== MODULE F: UI & STATUS MANAGEMENT =====

function showStatus(message, type = 'info', duration = 3000) {
    elements.status.textContent = message;
    elements.status.className = `visible ${type}`;

    if (duration > 0) {
        setTimeout(() => {
            elements.status.classList.remove('visible');
        }, duration);
    }
}

function showLoading(show = true, message = "Generating image...") {
    if (show) {
        elements.loadingText.textContent = message;
        elements.loadingOverlay.classList.remove('hidden');
    } else {
        elements.loadingOverlay.classList.add('hidden');
    }
}

// ===== START APP =====
init();
