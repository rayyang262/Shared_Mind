/* ================= CONFIG ================= */

const PROXY_URL = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
const AUTH_TOKEN = ""; // leave empty unless class gave you one

const agents = [
  { id:"A", name:"ChatGPT", model:"openai/gpt-5", stack:"stackA", board:"boardA", sound:"sounds/chatgpt.mp3" },
  { id:"B", name:"Gemini",  model:"google/gemini-3-pro", stack:"stackB", board:"boardB", sound:"sounds/gemini.mp3" },
  { id:"C", name:"Claude",  model:"anthropic/claude-4.5-sonnet", stack:"stackC", board:"boardC", sound:"sounds/claude.mp3" },
  { id:"D", name:"Grok",    model:"xai/grok-4", stack:"stackD", board:"boardD", sound:"sounds/grok.mp3" }
];

const ROUNDS = 2;

/* ================= DOM ================= */

const questionEl = document.getElementById("question");
const runBtn = document.getElementById("run");
const clearBtn = document.getElementById("clear");

const boards = {};
const stacks = {};
const sounds = {};

agents.forEach(a=>{
  boards[a.id] = document.getElementById(a.board);
  stacks[a.id] = document.getElementById(a.stack);
  sounds[a.id] = new Audio(a.sound);
});

/* ================= PROMPT ================= */

function systemPrompt(agent){
  return `
You are ${agent.name}.
Rules:
- Answer in 2–3 short sentences max.
- Be precise and concrete.
- No metaphors, no roleplay, no speculation.
- End with: "Key point: <one short sentence>"
`;
}

/* ================= UI HELPERS ================= */

function setActiveBoard(id){
  agents.forEach(a => boards[a.id].classList.remove("active"));
  boards[id].classList.add("active");
}

function playSound(id){
  const s = sounds[id];
  s.currentTime = 0;
  s.play().catch(()=>{});
}

function clearAll(){
  agents.forEach(a => stacks[a.id].innerHTML = "");
}

function randRotation(){
  const r = (Math.random()*4 - 2); // -2deg..2deg
  return r.toFixed(2) + "deg";
}

function appendNote(agentId, tag, text){
  const note = document.createElement("div");
  note.className = `note note${agentId}`;
  note.style.setProperty("--rot", randRotation());

  const t = document.createElement("div");
  t.className = "tag";
  t.textContent = tag;

  const b = document.createElement("div");
  b.className = "txt";
  b.textContent = text;

  note.appendChild(t);
  note.appendChild(b);

  stacks[agentId].appendChild(note);
  stacks[agentId].scrollTop = stacks[agentId].scrollHeight;
}

/* ================= PROXY CALL ================= */

async function callModel(agent, prompt){
  const payload = {
    model: agent.model,
    input: {
      prompt: `SYSTEM:\n${systemPrompt(agent)}\n\nUSER:\n${prompt}`
    }
  };

  const res = await fetch(PROXY_URL,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Accept:"application/json",
      Authorization:`Bearer ${AUTH_TOKEN}`
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if(!res.ok || json.error) {
    throw new Error(json?.error ? JSON.stringify(json.error) : "Model error");
  }

  return Array.isArray(json.output)
    ? json.output.join("")
    : String(json.output);
}

/* ================= DEBATE LOGIC ================= */

async function runDebate(question){
  runBtn.disabled = true;

  const turns = [];

  try{
    for(let r=1; r<=ROUNDS; r++){
      for(const agent of agents){
        setActiveBoard(agent.id);
        appendNote(agent.id, `Round ${r}`, "Thinking…");

        const transcript = turns
          .slice(-6)
          .map(t => `${t.name}: ${t.text}`)
          .join("\n\n");

        const hasPriorTurns = turns.length > 0;

        const task =
          (r < ROUNDS)
            ? (
                !hasPriorTurns
                  ? `Task: Propose.
Rules:
- State your position clearly.
- Add exactly one core point.
- 2–3 short sentences total.
- End with: "Key point: <one sentence>"`
                  : `Task: Debate.
Rules:
- Start with "Agree:" or "Disagree:"
- Quote one prior claim (6–12 words).
- Add exactly one new point.
- 2–3 short sentences total.
- End with: "Key point: <one sentence>"`
              )
            : `Task: Converge.
Rules:
- 3 bullets max.
- Resolve disagreements.
- Actionable conclusions only.
- End with: "Key point: <one sentence>"`;

        const prompt = `Question: ${question}

Transcript so far:
${transcript || "(none yet)"}

${task}
`;

        const response = await callModel(agent, prompt);

        // Replace the last "Thinking…" note instead of adding another
        const stack = stacks[agent.id];
        const lastNote = stack.lastElementChild;
        if (lastNote && lastNote.querySelector(".txt").textContent === "Thinking…") {
          lastNote.querySelector(".tag").textContent = `Round ${r} — ${agent.name}`;
          lastNote.querySelector(".txt").textContent = response;
        } else {
          appendNote(agent.id, `Round ${r} — ${agent.name}`, response);
        }

        playSound(agent.id);

        turns.push({ name: agent.name, text: response });
      }
    }
  } catch (err) {
    appendNote("A", "Error", "Error: " + (err?.message || String(err)));
  }

  agents.forEach(a => boards[a.id].classList.remove("active"));
  runBtn.disabled = false;
}

/* ================= EVENTS ================= */

runBtn.onclick = () => {
  const q = questionEl.value.trim();
  if(q) runDebate(q);
};

questionEl.onkeydown = e => {
  if(e.key === "Enter"){
    const q = questionEl.value.trim();
    if(q) runDebate(q);
  }
};

clearBtn.onclick = () => clearAll();

/* ================= BACKGROUND ================= */

const canvas = document.getElementById("bg");
const ctx = canvas.getContext("2d");

function resize(){
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

function drawBG(){
  const g = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
  g.addColorStop(0, "#070b14");
  g.addColorStop(1, "#0b1430");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // subtle stars
  for(let i=0;i<60;i++){
    const x = (i*97) % canvas.width;
    const y = (i*193) % canvas.height;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x,y,2,2);
  }

  requestAnimationFrame(drawBG);
}
drawBG();