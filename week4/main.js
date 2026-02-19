// ===== STATE =====
let state = {
    nodes: [],           // {id, embedding, description, type, name, x, y, image}
    userNode: null,      // Current user position
    camera: {x: 0, y: 0, zoom: 1},
    hovered: null,
    selected: null
};

// ===== CANVAS SETUP =====
const canvas = document.getElementById('constellation');
const ctx = canvas.getContext('2d');
let W, H;

function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
}

// ===== API CONFIGURATION (ITP Replicate Proxy) =====
const REPLICATE_PROXY = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
// Get your auth token from: https://itp-ima-replicate-proxy.web.app/
const AUTH_TOKEN = ""; // Replace with your token

// ===== GENERATE 5 PEOPLE WITH RESPONSES =====
async function generatePerspectives(userInput) {
    const status = document.getElementById('status');
    status.style.display = 'block';
    status.textContent = 'Asking GPT-5 to create 5 perspectives...';

    try {
        // Step 1: Use GPT-5 to generate 5 people with responses
        const llmPrompt = `The user is thinking about: "${userInput}"

Generate 5 diverse people who would each have a unique perspective on this thought. For each person, provide:
1. A unique first name
2. A one-sentence response to the user's thought (expressing their perspective in first person)
3. A brief personality type (e.g., "philosopher", "artist", "scientist", "optimist", "skeptic")

Format as JSON array:
[
  {"name": "...", "response": "...", "type": "..."},
  {"name": "...", "response": "...", "type": "..."},
  {"name": "...", "response": "...", "type": "..."},
  {"name": "...", "response": "...", "type": "..."},
  {"name": "...", "response": "...", "type": "..."}
]

Make the responses feel human, warm, and diverse in viewpoint.`;

        const data = {
            model: "openai/gpt-5-structured",
            input: {
                prompt: llmPrompt
            }
        };

        const options = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${AUTH_TOKEN}`
            },
            body: JSON.stringify(data)
        };

        console.log("Calling GPT-5 with:", data);
        const response = await fetch(REPLICATE_PROXY, options);
        
        if (!response.ok) {
            throw new Error(`GPT-5 API error: ${response.status}`);
        }

        const response_json = await response.json();
        console.log("GPT-5 response:", response_json);
        
        // Parse the JSON output
        let people = response_json.output.json_output;
        
        // Sometimes it returns as object, convert to array
        if (!Array.isArray(people)) {
            people = Object.values(people);
        }

        if (!people || people.length === 0) {
            throw new Error('No people generated from GPT-5');
        }

        status.textContent = `Got ${people.length} perspectives! Generating portraits...`;

        // Step 2: Generate portraits for each person using Nano Banana Pro
        const peopleWithImages = await Promise.all(people.map(async (person, index) => {
            status.textContent = `Generating portrait ${index + 1}/${people.length} for ${person.name}...`;
            
            // Create portrait prompt based on their response
            const imagePrompt = `Portrait photograph of ${person.name}, a ${person.type}. Based on their perspective: "${person.response}". Photorealistic, detailed face, expressive eyes, professional headshot, neutral background, cinematic lighting, 4k quality.`;
            
            console.log(`Portrait prompt for ${person.name}:`, imagePrompt);
            
            try {
                const image = await generatePortrait(imagePrompt);
                const embedding = generateMockEmbedding(person.name + ' ' + person.response);
                
                return {
                    name: person.name,
                    response: person.response,
                    type: person.type,
                    image,
                    embedding,
                    synthetic: true
                };
            } catch (err) {
                console.error(`Failed to generate image for ${person.name}:`, err);
                return {
                    name: person.name,
                    response: person.response,
                    type: person.type,
                    image: generatePlaceholderImage(person.name),
                    embedding: generateMockEmbedding(person.name + ' ' + person.response),
                    synthetic: true
                };
            }
        }));

        status.textContent = 'All portraits generated! Arranging constellation...';
        return { people: peopleWithImages };

    } catch (error) {
        console.error('Error generating perspectives:', error);
        status.textContent = `Error: ${error.message}`;
        throw error;
    }
}

// ===== GENERATE PORTRAIT WITH NANO BANANA PRO =====
async function generatePortrait(prompt) {
    try {
        const data = {
            model: "google/nano-banana-pro",
            input: {
                prompt: prompt
            }
        };

        const options = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${AUTH_TOKEN}`
            },
            body: JSON.stringify(data)
        };

        console.log("Calling Nano Banana Pro with:", data);
        const response = await fetch(REPLICATE_PROXY, options);

        if (!response.ok) {
            throw new Error(`Nano Banana Pro API error: ${response.status}`);
        }

        const response_json = await response.json();
        console.log("Nano Banana Pro response:", response_json);
        
        let imageURL = response_json.output;
        
        // Sometimes output is an array
        if (Array.isArray(imageURL)) {
            imageURL = imageURL[0];
        }
        
        if (!imageURL) {
            throw new Error('No image URL returned from API');
        }
        
        return imageURL; // Return the URL directly
        
    } catch (error) {
        console.error('Portrait generation failed:', error);
        throw error;
    }
}

// ===== FALLBACK: PLACEHOLDER IMAGE =====
function generatePlaceholderImage(name) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const cx = c.getContext('2d');
    
    // Colorful gradient background based on name
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue = hash % 360;
    
    const gradient = cx.createLinearGradient(0, 0, c.width, c.height);
    gradient.addColorStop(0, `hsl(${hue}, 60%, 30%)`);
    gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 60%, 20%)`);
    cx.fillStyle = gradient;
    cx.fillRect(0, 0, c.width, c.height);
    
    // Add geometric pattern
    cx.strokeStyle = `rgba(255, 255, 255, 0.1)`;
    cx.lineWidth = 2;
    for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const radius = 100 + i * 10;
        cx.beginPath();
        cx.arc(c.width / 2, c.height / 2, radius, angle, angle + Math.PI);
        cx.stroke();
    }
    
    // Name initial
    cx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    cx.font = 'bold 120px sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(name[0].toUpperCase(), c.width / 2, c.height / 2);
    
    return c.toDataURL('image/png');
}

// ===== MOCK EMBEDDING (temporary) =====
function generateMockEmbedding(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    const embedding = [];
    let seededRandom = hash;
    for (let i = 0; i < 128; i++) {
        seededRandom = (seededRandom * 9301 + 49297) % 233280;
        embedding.push((seededRandom / 233280) * 2 - 1);
    }
    return embedding;
}

// ===== PROJECTION TO 2D =====
function projectToConstellation(allEmbeddings) {
    const positions = allEmbeddings.map((emb, i) => {
        const angle = (i / allEmbeddings.length) * Math.PI * 2;
        const radius = 200 + (Math.random() - 0.5) * 100;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        return [x, y];
    });
    return positions;
}

// ===== RENDERING =====
function drawStars() {
    ctx.clearRect(0, 0, W, H);
    
    drawBackgroundStars();
    drawConnections();
    
    state.nodes.forEach(node => {
        drawNode(node);
    });
    
    if (state.userNode) {
        drawUserNode(state.userNode);
    }
    
    requestAnimationFrame(drawStars);
}

function drawBackgroundStars() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for (let i = 0; i < 150; i++) {
        const x = ((i * 73 + state.camera.x * 0.3) % W + W) % W;
        const y = ((i * 97 + state.camera.y * 0.3) % H + H) % H;
        const size = (i % 3) * 0.3 + 0.3;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawConnections() {
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.15)';
    ctx.lineWidth = 1;
    
    for (let i = 0; i < state.nodes.length; i++) {
        for (let j = i + 1; j < state.nodes.length; j++) {
            const node1 = state.nodes[i];
            const node2 = state.nodes[j];
            const dx = node2.x - node1.x;
            const dy = node2.y - node1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 250) {
                const screenX1 = (node1.x - state.camera.x) * state.camera.zoom + W/2;
                const screenY1 = (node1.y - state.camera.y) * state.camera.zoom + H/2;
                const screenX2 = (node2.x - state.camera.x) * state.camera.zoom + W/2;
                const screenY2 = (node2.y - state.camera.y) * state.camera.zoom + H/2;
                
                ctx.globalAlpha = 0.3 * (1 - dist / 250);
                ctx.beginPath();
                ctx.moveTo(screenX1, screenY1);
                ctx.lineTo(screenX2, screenY2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }
    }
}

function drawNode(node) {
    const screenX = (node.x - state.camera.x) * state.camera.zoom + W/2;
    const screenY = (node.y - state.camera.y) * state.camera.zoom + H/2;
    
    if (screenX < -100 || screenX > W + 100 || screenY < -100 || screenY > H + 100) return;
    
    const isHovered = node === state.hovered;
    const isSelected = node === state.selected;
    const avatarSize = isHovered ? 64 : 48;
    
    // Load image if needed
    if (node.image && !node._img) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = node.image;
        node._img = img;
    }
    
    // Glow for hover/select
    if (isHovered || isSelected) {
        const glowGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, avatarSize);
        glowGradient.addColorStop(0, 'rgba(201, 162, 39, 0.4)');
        glowGradient.addColorStop(1, 'rgba(201, 162, 39, 0)');
        ctx.fillStyle = glowGradient;
        ctx.fillRect(screenX - avatarSize, screenY - avatarSize, avatarSize * 2, avatarSize * 2);
    }
    
    // Draw avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(screenX, screenY, avatarSize/2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    if (node._img && node._img.complete && node._img.naturalWidth > 0) {
        ctx.drawImage(node._img, screenX - avatarSize/2, screenY - avatarSize/2, avatarSize, avatarSize);
    } else {
        ctx.fillStyle = '#444';
        ctx.fillRect(screenX - avatarSize/2, screenY - avatarSize/2, avatarSize, avatarSize);
    }
    
    ctx.restore();
    
    // Border
    ctx.strokeStyle = isSelected ? '#c9a227' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY, avatarSize/2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Name label
    if (isHovered || isSelected) {
        ctx.font = '14px "DM Mono", monospace';
        ctx.fillStyle = '#c9a227';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, screenX, screenY + avatarSize/2 + 20);
    }
}

function drawUserNode(node) {
    const screenX = (node.x - state.camera.x) * state.camera.zoom + W/2;
    const screenY = (node.y - state.camera.y) * state.camera.zoom + H/2;
    
    const time = Date.now() / 1000;
    const pulse = 1 + Math.sin(time * 2) * 0.2;
    
    const glow = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 40 * pulse);
    glow.addColorStop(0, 'rgba(201, 162, 39, 0.6)');
    glow.addColorStop(1, 'rgba(201, 162, 39, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(screenX - 40 * pulse, screenY - 40 * pulse, 80 * pulse, 80 * pulse);
    
    ctx.beginPath();
    ctx.arc(screenX, screenY, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#c9a227';
    ctx.fill();
    
    ctx.font = 'bold 12px "DM Mono", monospace';
    ctx.fillStyle = '#c9a227';
    ctx.textAlign = 'center';
    ctx.fillText('YOU', screenX, screenY + 25);
}

function findNodeAtPosition(clientX, clientY) {
    for (let node of state.nodes) {
        const screenX = (node.x - state.camera.x) * state.camera.zoom + W/2;
        const screenY = (node.y - state.camera.y) * state.camera.zoom + H/2;
        const dist = Math.sqrt(Math.pow(clientX - screenX, 2) + Math.pow(clientY - screenY, 2));
        
        if (dist < 30) return node;
    }
    return null;
}

function showProfile(node) {
    state.selected = node;
    const modal = document.getElementById('profile-modal');
    const username = modal.querySelector('.username');
    const bio = modal.querySelector('.bio');
    const img = modal.querySelector('#profile-image');
    const badge = modal.querySelector('.synthetic-badge');
    
    username.textContent = node.name || 'Unknown';
    bio.textContent = node.response || node.description || '';
    
    if (node.image) {
        img.src = node.image;
        img.style.display = 'block';
    } else {
        img.style.display = 'none';
    }
    
    if (node.synthetic) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
    
    modal.classList.remove('hidden');
}

function updateNearbyPreview() {
    const preview = document.getElementById('nearby-preview');
    if (!state.hovered) {
        preview.innerHTML = '';
        return;
    }
    preview.innerHTML = `<small><strong>${state.hovered.name}:</strong> "${state.hovered.response || state.hovered.description}"</small>`;
}

// ===== INTERACTION =====
let isDragging = false;
let dragStart = {x: 0, y: 0};

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStart = {x: e.clientX, y: e.clientY};
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        
        state.camera.x -= dx / state.camera.zoom;
        state.camera.y -= dy / state.camera.zoom;
        dragStart = {x: e.clientX, y: e.clientY};
    } else {
        // Only update hover when not dragging
        state.hovered = findNodeAtPosition(e.clientX, e.clientY);
        updateNearbyPreview();
    }
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
});

canvas.addEventListener('mouseleave', () => {
    isDragging = false;
});

canvas.addEventListener('click', (e) => {
    const clicked = findNodeAtPosition(e.clientX, e.clientY);
    if (clicked) {
        showProfile(clicked);
    }
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    state.camera.zoom *= zoomFactor;
    state.camera.zoom = Math.max(0.3, Math.min(3, state.camera.zoom));
});

// ===== BUTTON HANDLERS =====
document.getElementById('generate-btn').addEventListener('click', async () => {
    const input = document.getElementById('user-input');
    const userInput = input.value.trim();
    
    if (!userInput || userInput.length < 3) {
        alert('Please enter something you\'re thinking about (at least 3 characters)');
        return;
    }
    
    const btn = document.getElementById('generate-btn');
    btn.disabled = true;
    btn.textContent = 'Generating...';
    
    try {
        const result = await generatePerspectives(userInput);
        const people = result.people || [];
        
        const newNodes = people.map((p, i) => ({
            id: `${p.name}-${Date.now()}-${i}`,
            name: p.name,
            response: p.response,
            type: p.type,
            image: p.image,
            embedding: p.embedding,
            synthetic: p.synthetic,
            x: 0,
            y: 0
        }));
        
        const allEmbeddings = newNodes.map(n => n.embedding);
        const positions = projectToConstellation(allEmbeddings);
        
        newNodes.forEach((node, i) => {
            node.x = positions[i][0];
            node.y = positions[i][1];
        });
        
        state.nodes = [...state.nodes, ...newNodes];
        
        const stateToSave = {
            ...state,
            nodes: state.nodes.map(n => ({ ...n, _img: undefined }))
        };
        localStorage.setItem('constellation-state', JSON.stringify(stateToSave));
        
        document.getElementById('status').textContent = `Added ${people.length} new perspectives!`;
        setTimeout(() => {
            document.getElementById('status').style.display = 'none';
        }, 2000);
        
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('status').textContent = `Error: ${error.message}`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Perspectives';
    }
});

document.getElementById('clear-btn').addEventListener('click', () => {
    if (confirm('Clear all perspectives?')) {
        state.nodes = [];
        state.userNode = null;
        state.selected = null;
        document.getElementById('profile-modal').classList.add('hidden');
        localStorage.removeItem('constellation-state');
    }
});

document.getElementById('profile-modal').addEventListener('click', (e) => {
    if (e.target.id === 'profile-modal') {
        e.target.classList.add('hidden');
        state.selected = null;
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.getElementById('profile-modal').classList.add('hidden');
        state.selected = null;
    }
});

// ===== INITIALIZATION =====
resize();
drawStars();
window.addEventListener('resize', resize);

const saved = localStorage.getItem('constellation-state');
if (saved) {
    try {
        const loaded = JSON.parse(saved);
        state.nodes = loaded.nodes || [];
        state.camera = loaded.camera || {x: 0, y: 0, zoom: 1};
    } catch (e) {
        console.log('Could not load saved state');
    }
}
