// main.js
"use strict";

/*
Class-style structure:
- one canvas
- visualObjects[] with display(), isOver(), setLocation()
- dblclick spawns input box; Enter generates and creates a new VisualObject
Added:
- mask painting layer (hold Space)
- mask paint/erase + clear mask
- generate uses nano-banana-pro inpainting with composite+mask so it blends with existing images
- fallback to imagen-4-fast if inpaint fails
*/

let visualObjects = [];
let canvas, ctx;

let inputBox;
let currentObject = -1;
let mouseDown = false;

let isSpaceDown = false;      // hold Space to paint mask
let maskMode = "paint";       // paint | erase

// UI
const btnMaskPaint = document.getElementById("btnMaskPaint");
const btnMaskErase = document.getElementById("btnMaskErase");
const btnClearMask = document.getElementById("btnClearMask");
const btnGenerate = document.getElementById("btnGenerate");
const btnDelete = document.getElementById("btnDelete");
const btnReset = document.getElementById("btnReset");
const brushEl = document.getElementById("brush");
const brushVal = document.getElementById("brushVal");
const featherEl = document.getElementById("feather");
const featherVal = document.getElementById("featherVal");
const statusEl = document.getElementById("status");

function setStatus(t){ statusEl.textContent = t; }

// Proxy + models
// IMPORTANT: if you are using server.js proxy, change this to: const url = "/proxy";
// If not using server.js, you MUST use a CORS-enabled endpoint (many are NOT).
const url = "https://replicate-api-proxy.glitch.me/create_n_get/"; // <-- recommended (server.js)
const MODEL_INPAINT = "google/nano-banana-pro";
const MODEL_FALLBACK = "google/imagen-4-fast";

// generation size to reduce load
const GEN_W = 512;
const GEN_H = 512;

let brush = Number(brushEl.value);
let feather = Number(featherEl.value);
brushVal.textContent = String(brush);
featherVal.textContent = String(feather);

// mask layer (offscreen)
let maskCanvas, mctx;

// prompt placement state
let pendingPromptLocation = { x: window.innerWidth/2, y: window.innerHeight/2 };
let pendingPromptText = "";

// mask drawing state
let maskDrawing = false;
let lastMask = {x:0,y:0};

init();

function init() {
  initInterface();
  animate();
}

function initInterface() {
  // Canvas
  canvas = document.createElement("canvas");
  canvas.id = "myCanvas";
  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Mask canvas (same size)
  maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  mctx = maskCanvas.getContext("2d", { willReadFrequently: true });

  // Input box
  inputBox = document.getElementById("inputBox");

  inputBox.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      pendingPromptText = inputBox.value.trim();
      inputBox.style.display = "none";
      inputBox.value = "";

      if (!pendingPromptText) return;

      const hasMask = maskHasInk();
      if (hasMask) {
        await generateWithMask(pendingPromptText);
      } else {
        await askPicturesTextOnly(pendingPromptText, pendingPromptLocation);
      }
    }
    if (event.key === "Escape") {
      inputBox.style.display = "none";
      inputBox.value = "";
    }
  });

  // Mouse/Pointer for dragging objects OR painting mask
  document.addEventListener("mousedown", (event) => {
    mouseDown = true;

    // If Space held: start mask draw instead of dragging
    if (isSpaceDown) {
      maskDrawing = true;
      lastMask = { x: event.clientX, y: event.clientY };
      paintMaskDot(lastMask.x, lastMask.y);
      return;
    }

    currentObject = -1;
    for (let i = visualObjects.length - 1; i >= 0; i--) {
      if (visualObjects[i].isOver(event.clientX, event.clientY)) {
        currentObject = i;
        break;
      }
    }
  });

  document.addEventListener("mousemove", (event) => {
    // Mask painting
    if (mouseDown && isSpaceDown && maskDrawing) {
      paintMaskStroke(lastMask.x, lastMask.y, event.clientX, event.clientY);
      lastMask = { x: event.clientX, y: event.clientY };
      return;
    }

    // Drag image
    if (mouseDown && currentObject > -1) {
      visualObjects[currentObject].setLocation({ x: event.clientX, y: event.clientY });
    }
  });

  document.addEventListener("mouseup", () => {
    mouseDown = false;
    maskDrawing = false;
  });

  // Double click: place input box at cursor
  document.addEventListener("dblclick", (event) => {
    pendingPromptLocation = { x: event.clientX, y: event.clientY };
    inputBox.style.display = "block";
    inputBox.style.left = `${event.clientX}px`;
    inputBox.style.top = `${event.clientY}px`;
    inputBox.style.transform = "translate(0, 0)";
    inputBox.focus();
  });

  // Key handling: Space enables masking
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      isSpaceDown = true;
      e.preventDefault();
    }
    if (e.key === "Backspace" && currentObject > -1 && inputBox.style.display === "none") {
      visualObjects.splice(currentObject, 1);
      currentObject = -1;
    }
  }, { passive: false });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") isSpaceDown = false;
  });

  // UI buttons
  btnMaskPaint.onclick = () => {
    maskMode = "paint";
    btnMaskPaint.classList.add("active");
    btnMaskErase.classList.remove("active");
    setStatus("Mask: paint (hold Space to draw)");
  };

  btnMaskErase.onclick = () => {
    maskMode = "erase";
    btnMaskErase.classList.add("active");
    btnMaskPaint.classList.remove("active");
    setStatus("Mask: erase (hold Space to erase)");
  };

  btnClearMask.onclick = () => {
    clearMask();
    setStatus("Mask cleared");
  };

  btnDelete.onclick = () => {
    if (currentObject > -1) {
      visualObjects.splice(currentObject, 1);
      currentObject = -1;
      setStatus("Deleted selected");
    }
  };

  btnReset.onclick = () => {
    visualObjects = [];
    currentObject = -1;
    clearMask();
    setStatus("Reset");
  };

  btnGenerate.onclick = async () => {
    if (inputBox.style.display !== "none") return;

    pendingPromptLocation = { x: window.innerWidth/2, y: window.innerHeight/2 };
    inputBox.style.display = "block";
    inputBox.style.left = `${pendingPromptLocation.x}px`;
    inputBox.style.top = `${pendingPromptLocation.y}px`;
    inputBox.style.transform = "translate(-50%, -50%)";
    inputBox.focus();
  };

  brushEl.oninput = () => {
    brush = Number(brushEl.value);
    brushVal.textContent = String(brush);
  };

  featherEl.oninput = () => {
    feather = Number(featherEl.value);
    featherVal.textContent = String(feather);
  };

  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    setStatus("Resized (mask cleared)");
  });

  setStatus("Idle");
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < visualObjects.length; i++) {
    visualObjects[i].display(ctx);
  }

  drawMaskOverlay(ctx);

  requestAnimationFrame(animate);
}

/* -------------------------
   VisualObject
-------------------------- */
class VisualObject {
  constructor(prompt, img, x, y, w, h) {
    this.prompt = prompt;
    this.x = x;
    this.y = y;
    this.img = img;
    this.width = w;
    this.height = h;
  }
  setLocation(location) {
    this.x = location.x;
    this.y = location.y;
  }
  isOver(x, y) {
    return (x > this.x && x < this.x + this.width && y > this.y && y < this.y + this.height);
  }
  display(ctx) {
    ctx.drawImage(this.img, this.x, this.y, this.width, this.height);

    // label
    ctx.font = "16px Arial";
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(this.x, this.y + this.height + 6, this.width, 22);
    ctx.fillStyle = "white";
    ctx.fillText(this.prompt.slice(0, 40), this.x + 8, this.y + this.height + 22);

    // selection outline
    if (currentObject !== -1 && visualObjects[currentObject] === this) {
      ctx.strokeStyle = "rgba(122,162,255,0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
    }
  }
}

/* -------------------------
   Mask tools
-------------------------- */
function clearMask() {
  mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
}

function paintMaskDot(x, y) {
  mctx.save();
  if (maskMode === "paint") {
    mctx.globalCompositeOperation = "source-over";
    mctx.fillStyle = "white";
  } else {
    mctx.globalCompositeOperation = "destination-out";
    mctx.fillStyle = "rgba(0,0,0,1)";
  }
  mctx.beginPath();
  mctx.arc(x, y, brush / 2, 0, Math.PI * 2);
  mctx.fill();
  mctx.restore();
}

function paintMaskStroke(x1, y1, x2, y2) {
  mctx.save();
  mctx.lineCap = "round";
  mctx.lineJoin = "round";
  mctx.lineWidth = brush;

  if (maskMode === "paint") {
    mctx.globalCompositeOperation = "source-over";
    mctx.strokeStyle = "white";
  } else {
    mctx.globalCompositeOperation = "destination-out";
    mctx.strokeStyle = "rgba(0,0,0,1)";
  }

  mctx.beginPath();
  mctx.moveTo(x1, y1);
  mctx.lineTo(x2, y2);
  mctx.stroke();
  mctx.restore();
}

function drawMaskOverlay(ctx) {
  const w = maskCanvas.width, h = maskCanvas.height;
  const id = mctx.getImageData(0, 0, w, h).data;
  const overlay = ctx.createImageData(w, h);
  for (let i = 0; i < id.length; i += 4) {
    const v = id[i];
    if (v > 10) {
      overlay.data[i] = 255;
      overlay.data[i + 1] = 70;
      overlay.data[i + 2] = 70;
      overlay.data[i + 3] = 120;
    }
  }
  ctx.putImageData(overlay, 0, 0);
}

function maskHasInk() {
  const d = mctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
  for (let i = 0; i < d.length; i += 32) {
    if (d[i] > 15) return true;
  }
  return false;
}

function maskBoundingBox() {
  const w = maskCanvas.width, h = maskCanvas.height;
  const d = mctx.getImageData(0, 0, w, h).data;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  let found = false;

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (d[i] > 15) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return null;

  const pad = 12;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const bw = Math.max(64, maxX - minX);
  const bh = Math.max(64, maxY - minY);

  return { x: minX, y: minY, w: bw, h: bh };
}

/* -------------------------
   Composite export
-------------------------- */
function renderCompositeToCanvas(outW, outH) {
  const c = document.createElement("canvas");
  c.width = outW;
  c.height = outH;
  const cctx = c.getContext("2d");

  cctx.fillStyle = "#0f0f14";
  cctx.fillRect(0, 0, outW, outH);

  const sx = outW / canvas.width;
  const sy = outH / canvas.height;

  for (let i = 0; i < visualObjects.length; i++) {
    const o = visualObjects[i];
    cctx.drawImage(o.img, o.x * sx, o.y * sy, o.width * sx, o.height * sy);
  }

  return c;
}

function renderMaskToCanvas(outW, outH, blurPx) {
  const small = document.createElement("canvas");
  small.width = outW;
  small.height = outH;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(maskCanvas, 0, 0, outW, outH);

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d", { willReadFrequently: true });

  octx.clearRect(0, 0, outW, outH);
  if (blurPx > 0) {
    octx.filter = `blur(${blurPx}px)`;
    octx.drawImage(small, 0, 0);
    octx.filter = "none";
  } else {
    octx.drawImage(small, 0, 0);
  }

  const id = octx.getImageData(0, 0, outW, outH);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = id.data[i];
    const nv = v > 8 ? 255 : 0;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = nv;
    id.data[i + 3] = 255;
  }
  octx.putImageData(id, 0, 0);
  return out;
}

function toBase64Png(c) {
  return c.toDataURL("image/png").split(",")[1];
}

function urlToImage(u) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = u;
  });
}

/* -------------------------
   Network calls
-------------------------- */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callProxyWithRetry(data, { retries = 6, baseDelayMs = 800 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = json?.details || json?.error || (await res.text().catch(()=>"")) || "Request failed";
        throw new Error(msg);
      }

      const out = json?.output;
      if (!out) throw new Error("No output returned");
      return out;
    } catch (e) {
      const msg = String(e?.message || e);
      const busy =
        msg.includes("high demand") ||
        msg.includes("E003") ||
        msg.includes("Service is currently unavailable");

      if (!busy || attempt === retries) throw e;

      const delay = Math.round(baseDelayMs * Math.pow(2, attempt));
      setStatus(`Busy (E003). Retrying in ${Math.round(delay / 1000)}s…`);
      await sleep(delay);
    }
  }
  throw new Error("Retry exhausted");
}

/* -------------------------
   Generation flows
-------------------------- */
async function askPicturesTextOnly(promptWord, location) {
  setStatus("Generating (text→image)…");
  btnGenerate.disabled = true;

  try {
    const data = {
      model: MODEL_FALLBACK,
      input: { prompt: promptWord },
    };

    const out = await callProxyWithRetry(data);
    const outUrl = Array.isArray(out) ? out[0] : out;

    const img = await urlToImage(outUrl);

    const w = 256, h = 256;
    const newObj = new VisualObject(promptWord, img, location.x, location.y, w, h);
    visualObjects.push(newObj);
    currentObject = visualObjects.length - 1;

    setStatus("Done");
  } catch (e) {
    console.error(e);
    setStatus("Failed (see console)");
  } finally {
    btnGenerate.disabled = false;
  }
}

async function generateWithMask(promptWord) {
  if (!maskHasInk()) return;

  setStatus("Generating (inpaint)…");
  btnGenerate.disabled = true;

  const bbox = maskBoundingBox();
  try {
    const comp = renderCompositeToCanvas(GEN_W, GEN_H);
    const m = renderMaskToCanvas(GEN_W, GEN_H, feather);

    // TOKEN-REDUCED PROMPT
    const instruction = `Edit ONLY white mask. Outside unchanged. ${promptWord}. Seamless blend.`;

    const data = {
      model: MODEL_INPAINT,
      input: {
        prompt: instruction,
        image: `data:image/png;base64,${toBase64Png(comp)}`,
        mask:  `data:image/png;base64,${toBase64Png(m)}`,
      },
    };

    const out = await callProxyWithRetry(data);
    const outUrl = Array.isArray(out) ? out[0] : out;

    const img = await urlToImage(outUrl);

    // Bake result as a full-canvas layer (best blending)
    const placed = new VisualObject(promptWord, img, 0, 0, canvas.width, canvas.height);
    visualObjects.push(placed);
    currentObject = visualObjects.length - 1;

    clearMask();
    setStatus("Done");
    return;
  } catch (e) {
    console.error("Inpaint failed, fallback to text2img:", e);
    setStatus("Inpaint failed → fallback text2img…");
  } finally {
    btnGenerate.disabled = false;
  }

  // Fallback: text2img placed in masked bounding box
  try {
    btnGenerate.disabled = true;

    const data = {
      model: MODEL_FALLBACK,
      input: { prompt: promptWord },
    };

    const out = await callProxyWithRetry(data);
    const outUrl = Array.isArray(out) ? out[0] : out;

    const img = await urlToImage(outUrl);

    const box = bbox || { x: pendingPromptLocation.x, y: pendingPromptLocation.y, w: 256, h: 256 };
    const w = Math.max(128, Math.min(512, box.w));
    const h = Math.max(128, Math.min(512, box.h));

    const placed = new VisualObject(promptWord, img, box.x, box.y, w, h);
    visualObjects.push(placed);
    currentObject = visualObjects.length - 1;

    clearMask();
    setStatus("Done (fallback)");
  } catch (e2) {
    console.error(e2);
    setStatus("Failed (see console)");
  } finally {
    btnGenerate.disabled = false;
  }
}