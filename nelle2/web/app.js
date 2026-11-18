// Emotion controller: turns each reply into the ball's mood, motion and topic shape, the voice and the chat.
import { attachGestureDebug } from "./gesture-debug.js";
import { CameraError, GestureTracker } from "./gestures.js";
import { HandScroller } from "./handscroll.js";
import { spotlight } from "./spotlight.js";
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
  camera: $("#camera-toggle"),
  reset: $("#reset"),
  provider: $("#provider"),
  status: $("#status-state"),
  mood: $("#mood"),
  starters: $("#starters"),
  toast: $("#toast"),
};

const STATE_TEXT = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  answering: "Answering",
};
const TEXT_WORDS_PER_SECOND = 4.4;
const SETTLE_MS = 1800;
const TYPING_QUIET_MS = 900; // hands on the keyboard shouldn't fire gestures
const MIN_THINKING_MS = 1100; // long enough for the thinking animation to read, even offline

const stage = new Stage($("#fog"), $("#ball"), $("#mind"));
spotlight($(".topbar"));
const player = new VoicePlayer();
const speech = new SpeechInput();
const tracker = new GestureTracker($("#cam"));
const scroller = new HandScroller(els.log);

// Gesture name (from the registry in gestures.js) -> animation. Add a line here for a new gesture.
const GESTURE_ACTIONS = {
  two: () => stage.bloom(),
  five: () => stage.smile(),
  thumbsUp: () => stage.hiBro(),
};
const CAMERA_ERRORS = {
  denied: "Camera access was blocked, so gestures are off. You can allow it in the address bar.",
  "no-camera": "I couldn't find a camera, so gestures are off.",
  unsupported: "This browser can't share a camera here, so gestures are off.",
  model: "The hand-tracking model didn't load. Check your connection and try again.",
};

let state = "idle";
let job = 0; // bumps on every new request or interrupt, so stale async work quietly stops
let abort = null;
let reveal = null;
let speakReplies = readSetting("nelle.speak", false);
let cameraOn = false;

stage.onFrame((dt) => {
  tracker.tick(performance.now());
  scroller.tick(dt);
  if (state === "speaking") stage.setLevel(player.level());
  if (state === "thinking") {
    const label = stage.searching ? "Searching" : "Thinking";
    if (els.status.textContent !== label) els.status.textContent = label;
  }
  tickReveal(dt);
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
  els.status.textContent = STATE_TEXT[next];
  const busy = next === "thinking" || next === "speaking" || next === "answering";
  els.send.classList.toggle("is-stop", busy);
  els.send.setAttribute("aria-label", busy ? "Interrupt Nelle" : "Send message");
  els.mic.classList.toggle("is-live", next === "listening");
}

function setMood({ emotion, intensity, voiceStyle }) {
  stage.setMood(emotion, intensity);
  const label = emotion[0].toUpperCase() + emotion.slice(1);
  if (els.mood.textContent !== label) {
    els.mood.textContent = label;
    els.mood.classList.remove("flip");
    void els.mood.offsetWidth; // restart the CSS animation
    els.mood.classList.add("flip");
  }
  els.mood.title = `Intensity ${Number(intensity).toFixed(2)} · voice ${voiceStyle}`;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 4200);
}

function addMessage(role, text) {
  const item = document.createElement("li");
  item.className = `msg ${role}`;
  const body = document.createElement("p");
  body.className = "body";
  body.textContent = text;
  item.append(body);
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
  document.body.classList.add("started");
  addMessage("user", text);
  stage.receive(); // the ball takes the message in
  els.input.value = "";
  autosize();
  setState("thinking");
  const thinkingSince = performance.now();
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

  const voiceReady =
    wantsVoice && data.source !== "error"
      ? postJson("/api/tts", { text: data.response, emotion: data.emotion, intensity: data.intensity }, abort.signal).catch(() => null)
      : null;
  const remaining = MIN_THINKING_MS - (performance.now() - thinkingSince);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  if (id !== job) return;
  stage.found(data.topic);

  setMood(data);
  if (data.source === "claude" || data.source === "offline") els.provider.textContent = data.source.toUpperCase();
  const message = addMessage("nelle", ""); // filled in word by word below
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
addEventListener("keydown", () => tracker.quiet(TYPING_QUIET_MS));
els.mic.addEventListener("click", listen);
els.starters.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button) send(button.textContent);
});
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

// ---------- camera and hand gestures ----------

tracker.on("gesture", ({ name }) => {
  if (stage.gestureBusy) return; // one gesture animation at a time
  GESTURE_ACTIONS[name]?.();
});
tracker.on("move", (move) => stage.handMove(move));
tracker.on("scroll", (scroll) => {
  scroller.update(scroll);
});

function renderCameraToggle(loading = false) {
  els.camera.setAttribute("aria-pressed", String(cameraOn));
  els.camera.classList.toggle("is-loading", loading);
  els.camera.querySelector("span").textContent = loading ? "Starting…" : cameraOn ? "Camera on" : "Camera off";
}

async function setCamera(on) {
  if (on === cameraOn) return;
  writeSetting("nelle.camera", on);
  if (!on) {
    tracker.stop();
    cameraOn = false;
    return renderCameraToggle();
  }
  renderCameraToggle(true);
  try {
    await tracker.start();
    cameraOn = true;
  } catch (error) {
    cameraOn = false;
    writeSetting("nelle.camera", false);
    toast(CAMERA_ERRORS[error instanceof CameraError ? error.code : "model"]);
    console.warn("Camera unavailable:", error);
  }
  renderCameraToggle();
}

els.camera.addEventListener("click", () => setCamera(!cameraOn));
if (new URLSearchParams(location.search).get("debug") === "gestures") attachGestureDebug(tracker);

els.reset.addEventListener("click", async () => {
  interrupt();
  try {
    await postJson("/api/reset", {});
  } catch {
    return toast("Couldn't reach the server to clear memory.");
  }
  els.log.replaceChildren();
  document.body.classList.remove("started");
  setMood({ emotion: "neutral", intensity: 0.4, voiceStyle: "calm" });
  stage.setTopic("general");
  stage.jolt(1);
});

async function boot() {
  renderSpeakToggle();
  renderCameraToggle();
  if (readSetting("nelle.camera", false)) setCamera(true);
  setMood({ emotion: "neutral", intensity: 0.4, voiceStyle: "calm" });
  setState("idle");
  stage.start();
  try {
    // A fresh page starts a fresh conversation: Nelle shouldn't remember chat you can no longer see.
    await postJson("/api/reset", {});
    const status = await (await fetch("/api/status")).json();
    els.provider.textContent = status.provider.toUpperCase();
  } catch {
    els.provider.textContent = "NO SERVER";
  }
  setTimeout(async () => {
    if (els.log.children.length) return;
    const id = job;
    const greeting = addMessage("nelle", "");
    setState("answering");
    await startReveal(greeting.body, "I'm here. Type to me, or press the mic and just talk.", null);
    setTimeout(() => id === job && state === "answering" && setState("idle"), SETTLE_MS);
  }, 2200);
}

window.nelle = { stage, setState, setMood, interrupt, send, tracker }; // handy for poking at states from devtools
boot();
