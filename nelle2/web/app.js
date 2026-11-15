// Emotion controller: turns each reply into the ball's mood and motion, the HUD, the voice and the chat.
import { CalcFx, looksLikeMath } from "./calculation.js";
import { Hud } from "./hud.js";
import { Stage } from "./stage.js";
import { SpeechInput, VoicePlayer } from "./voice.js";

const $ = (selector) => document.querySelector(selector);
const els = {
  log: $("#log"),
  form: $("#composer"),
  input: $("#input"),
  mic: $("#mic"),
  send: $("#send"),
  speak: $("#speak-toggle"),
  reset: $("#reset"),
  provider: $("#provider"),
  status: $("#status-state"),
  memory: $("#memory"),
  toast: $("#toast"),
};

const STATE_TEXT = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  answering: "Answering",
};
const MEMORY_SIZE = 12;
const TEXT_WORDS_PER_SECOND = 4.4;
const SETTLE_MS = 1800;

const stage = new Stage($("#fog"), $("#ball"));
const hud = new Hud($("#hud"), $("#lexicon"));
const calcFx = new CalcFx($("#calc"), stage);
const player = new VoicePlayer();
const speech = new SpeechInput();

let state = "idle";
let job = 0; // bumps on every new request or interrupt, so stale async work quietly stops
let abort = null;
let reveal = null;
let speakReplies = readSetting("nelle.speak", false);

stage.onFrame((dt, info) => {
  if (state === "speaking") stage.setLevel(player.level());
  tickReveal(dt);
  calcFx.tick(dt, info);
  hud.tick(dt, info);
});

function readSetting(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function writeSetting(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private mode: the toggle still works for this visit */
  }
}

function setState(next) {
  state = next;
  stage.setState(next);
  document.body.dataset.state = next;
  hud.set("state", STATE_TEXT[next].toUpperCase());
  els.status.textContent = STATE_TEXT[next];
  const busy = next === "thinking" || next === "speaking" || next === "answering";
  els.send.classList.toggle("is-stop", busy);
  els.send.setAttribute("aria-label", busy ? "Interrupt Nelle" : "Send message");
  els.mic.classList.toggle("is-live", next === "listening");
}

function setMood({ emotion, intensity, voiceStyle }) {
  stage.setMood(emotion, intensity);
  hud.set("emotion", emotion.toUpperCase());
  hud.set("intensity", `INTENSITY ${Number(intensity).toFixed(2)}`);
  hud.set("voice", `VOICE ${voiceStyle.toUpperCase()}`);
  hud.setEmotion(emotion);
  hud.glitch();
}

function setMemory(count) {
  const text = `${String(count).padStart(2, "0")}/${MEMORY_SIZE}`;
  els.memory.textContent = `MEM ${text}`;
  hud.set("memory", `MEMORY ${text}`);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 4200);
}

function addMessage(role, text, meta = {}) {
  const item = document.createElement("li");
  item.className = `msg ${role}`;
  const label = document.createElement("p");
  label.className = "meta";
  label.textContent = role === "user" ? "[YOU]" : `[NELLE] ${meta.emotion ? `· ${meta.emotion.toUpperCase()} ${Number(meta.intensity).toFixed(2)}` : ""}`;
  const body = document.createElement("p");
  body.className = "body";
  body.textContent = text;
  item.append(label, body);
  els.log.append(item);
  els.log.scrollTo({ top: els.log.scrollHeight, behavior: "smooth" });
  return { item, body };
}

function addLink(item, url) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "chip";
  link.textContent = `Open ${new URL(url).hostname.replace(/^www\./, "")} ↗`;
  item.append(link);
}

/** Show a reply word by word: timed to the voice when there is one, at reading pace otherwise. */
function startReveal(body, text, timings) {
  body.textContent = "";
  const spans = text.split(/(\s+)/).map((part) => {
    const span = document.createElement("span");
    span.textContent = part;
    if (part.trim()) span.className = "w";
    body.append(span);
    return span;
  }).filter((span) => span.className === "w");
  return new Promise((resolve) => {
    reveal = { spans, timings, shown: 0, elapsed: 0, resolve };
  });
}

function tickReveal(dt) {
  if (!reveal) return;
  reveal.elapsed += dt;
  let target;
  if (reveal.timings?.length) {
    const ms = player.elapsedMs();
    const spoken = reveal.timings.filter((w) => w.offset <= ms).length;
    target = Math.round((spoken / reveal.timings.length) * reveal.spans.length);
  } else {
    target = Math.floor(reveal.elapsed * TEXT_WORDS_PER_SECOND);
  }
  const before = reveal.shown;
  const nearBottom = els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 80;
  while (reveal.shown < Math.min(target, reveal.spans.length)) {
    const span = reveal.spans[reveal.shown++];
    span.classList.add("in");
    stage.onWord(span.textContent);
  }
  if (reveal.shown > before && nearBottom) els.log.scrollTop = els.log.scrollHeight;
  if (reveal.shown >= reveal.spans.length && !reveal.timings?.length) finishReveal();
}

function finishReveal(interrupted = false) {
  if (!reveal) return;
  const { spans, shown, resolve } = reveal;
  spans.forEach((span, i) => span.classList.add(interrupted && i >= shown ? "cut" : "in"));
  reveal = null;
  resolve();
}

function interrupt() {
  const wasBusy = state !== "idle";
  job++;
  abort?.abort();
  player.stop();
  speech.cancel();
  calcFx.cancel();
  finishReveal(true);
  stage.setLevel(0);
  setState("idle");
  if (wasBusy) stage.jolt(0.8);
}

async function postJson(url, body, signal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

async function send(text, viaVoice = false) {
  text = text.trim();
  if (!text) return;
  interrupt();
  const id = ++job;
  const wantsVoice = viaVoice || speakReplies;
  if (wantsVoice) player.unlock(); // still inside the click/keypress, so audio is allowed
  addMessage("user", text);
  stage.receive(); // the ball takes the message in
  els.input.value = "";
  autosize();
  setState("thinking");
  if (looksLikeMath(text)) calcFx.start(); // start the maths orbit before the answer arrives
  abort = new AbortController();

  let data;
  try {
    data = await postJson("/api/chat", { message: text }, abort.signal);
  } catch (error) {
    if (id !== job) return;
    data = {
      emotion: "concerned",
      intensity: 0.4,
      voiceStyle: "soft",
      response: "I lost the thread for a second. The server didn't answer. Is it still running?",
      source: "error",
    };
  }
  if (id !== job) return;

  // fetch the voice while the calculation plays, so the answer is ready when the number lands
  const voiceReady =
    wantsVoice && data.source !== "error"
      ? postJson("/api/tts", { text: data.response, emotion: data.emotion, intensity: data.intensity }, abort.signal).catch(() => null)
      : null;
  if (data.calc) {
    await calcFx.resolve(data.calc);
    if (id !== job) return;
  } else {
    calcFx.cancel();
  }

  setMood(data);
  if (data.memory !== undefined) setMemory(data.memory);
  if (data.source === "claude" || data.source === "offline") els.provider.textContent = data.source.toUpperCase();
  const message = addMessage("nelle", "", data); // filled in word by word below
  if (data.url) {
    addLink(message.item, data.url);
    window.open(data.url, "_blank", "noopener");
  }

  if (voiceReady) {
    const voice = await voiceReady;
    if (id !== job) return;
    if (!voice) toast("Voice is unavailable right now, so Nelle is answering in text.");
    if (voice) {
      setState("speaking");
      const shown = startReveal(message.body, data.response, voice.words);
      const finished = await player.play(voice.audio).catch(() => false);
      if (id !== job) return;
      finishReveal(!finished);
      await shown;
      setState("idle");
      return;
    }
  }

  setState("answering");
  await startReveal(message.body, data.response, null);
  if (id !== job) return;
  setTimeout(() => id === job && setState("idle"), SETTLE_MS);
}

async function listen() {
  if (state === "listening") return interrupt();
  if (!speech.supported) return toast("Voice input needs Chrome or Edge. You can still type to Nelle.");
  interrupt();
  player.unlock();
  const id = job;
  setState("listening");
  try {
    const text = await speech.listen((interim) => {
      els.input.value = interim;
      autosize();
    });
    if (id !== job || state !== "listening") return;
    if (text) send(text, true);
    else setState("idle");
  } catch (error) {
    if (id !== job) return;
    setState("idle");
    toast(error.message === "not-allowed" ? "Microphone access was blocked. Allow it in the address bar to talk." : "I couldn't hear that. Try again?");
  }
}

function autosize() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(140, els.input.scrollHeight)}px`;
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (els.send.classList.contains("is-stop") && !els.input.value.trim()) return interrupt();
  send(els.input.value);
});
els.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.form.requestSubmit();
  }
});
els.input.addEventListener("input", autosize);
els.mic.addEventListener("click", listen);
addEventListener("keydown", (event) => {
  if (event.key === "Escape") interrupt();
});

function renderSpeakToggle() {
  els.speak.setAttribute("aria-pressed", String(speakReplies));
  els.speak.querySelector("span").textContent = speakReplies ? "Voice on" : "Voice off";
}
els.speak.addEventListener("click", () => {
  speakReplies = !speakReplies;
  writeSetting("nelle.speak", speakReplies);
  if (speakReplies) player.unlock();
  renderSpeakToggle();
});

els.reset.addEventListener("click", async () => {
  interrupt();
  try {
    await postJson("/api/reset", {});
  } catch {
    return toast("Couldn't reach the server to clear memory.");
  }
  els.log.replaceChildren();
  setMood({ emotion: "neutral", intensity: 0.4, voiceStyle: "calm" });
  setMemory(0);
  stage.jolt(1);
});

async function boot() {
  renderSpeakToggle();
  setMood({ emotion: "neutral", intensity: 0.4, voiceStyle: "calm" });
  setState("idle");
  setMemory(0);
  stage.start();
  try {
    // A fresh page starts a fresh conversation: Nelle shouldn't remember chat you can no longer see.
    await postJson("/api/reset", {});
    const status = await (await fetch("/api/status")).json();
    els.provider.textContent = status.provider.toUpperCase();
    setMemory(status.memory);
  } catch {
    els.provider.textContent = "NO SERVER";
  }
  setTimeout(async () => {
    if (els.log.children.length) return;
    const id = job;
    const greeting = addMessage("nelle", "", { emotion: "neutral", intensity: 0.4 });
    setState("answering");
    await startReveal(greeting.body, "I'm here. Type to me, or press the mic and just talk.", null);
    setTimeout(() => id === job && state === "answering" && setState("idle"), SETTLE_MS);
  }, 2200);
}

window.nelle = { stage, setState, setMood, interrupt, send }; // handy for poking at states from devtools
boot();
