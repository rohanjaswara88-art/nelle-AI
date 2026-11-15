// HUD: bracketed labels that float around the ball, and the emotion lexicon below it.

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>[]#";
const EMOTIONS = [
  "happy", "excited", "sad", "frustrated", "confused", "curious", "surprised",
  "disappointed", "nervous", "casual", "playful", "thinking", "concerned", "neutral",
];

// label key -> [index, anchor, offset x, offset y] (offsets push the label away from the rim)
const LABELS = {
  emotion: ["01", "ne", 34, -46],
  intensity: ["02", "nw", -190, -40],
  state: ["03", "w", -170, -10],
  voice: ["04", "e", 40, -10],
  memory: ["05", "sw", -190, 20],
};
const MARKERS = ["rimTop", "rimLeft", "rimRight"];

export class Hud {
  constructor(root, lexiconRoot) {
    this.root = root;
    this.labels = {};
    this.scrambles = [];
    for (const [key, [index]] of Object.entries(LABELS)) {
      const el = document.createElement("div");
      el.className = "tag";
      el.innerHTML = `<i>[${index}]</i><span></span>`;
      root.append(el);
      this.labels[key] = { el, text: el.querySelector("span"), value: "", pos: null };
    }
    this.markers = MARKERS.map((anchor) => {
      const el = document.createElement("b");
      el.className = "marker";
      root.append(el);
      return { el, anchor, pos: null };
    });

    this.words = EMOTIONS.map((emotion) => {
      const el = document.createElement("span");
      el.textContent = `[${emotion.toUpperCase()}]`;
      lexiconRoot.append(el);
      return { emotion, el };
    });
    this.flickerAt = 0;
  }

  set(key, value) {
    const label = this.labels[key];
    if (!label || label.value === value) return;
    label.value = value;
    this.scrambles.push({ label, target: value, age: 0 });
  }

  setEmotion(emotion) {
    for (const word of this.words) word.el.classList.toggle("on", word.emotion === emotion);
  }

  glitch() {
    this.root.classList.remove("glitching");
    void this.root.offsetWidth; // restart the CSS animation
    this.root.classList.add("glitching");
  }

  /** Keep a label on screen and out from under the conversation panel. */
  clamp(el, [x, y], narrow) {
    const panel = narrow ? 0 : Math.min(440, innerWidth * 0.32) + 20;
    const maxX = innerWidth - panel - el.offsetWidth - 16;
    const maxY = (narrow ? innerHeight * 0.5 : innerHeight - 60) - el.offsetHeight;
    return [Math.max(16, Math.min(maxX, x)), Math.max(76, Math.min(maxY, y))];
  }

  /** Called once per frame from the stage loop. */
  tick(dt, { anchors, state }) {
    const narrow = innerWidth < 860;
    for (const [key, [, anchor, ox, oy]] of Object.entries(LABELS)) {
      const label = this.labels[key];
      const [ax, ay] = anchors[anchor];
      const target = this.clamp(label.el, [ax + ox * (narrow ? 0.5 : 1), ay + oy * (narrow ? 0.6 : 1)], narrow);
      label.pos = follow(label.pos, target, dt, 2.5);
      label.el.style.transform = `translate(${label.pos[0].toFixed(1)}px, ${label.pos[1].toFixed(1)}px)`;
    }
    for (const marker of this.markers) {
      marker.pos = follow(marker.pos, anchors[marker.anchor], dt, 6);
      marker.el.style.transform = `translate(${marker.pos[0].toFixed(1)}px, ${marker.pos[1].toFixed(1)}px)`;
    }

    this.scrambles = this.scrambles.filter((s) => {
      s.age += dt;
      const settled = Math.floor((s.age / 0.45) * s.target.length);
      let out = s.target.slice(0, settled);
      for (let i = settled; i < s.target.length; i++) {
        out += s.target[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      s.label.text.textContent = out;
      return settled < s.target.length;
    });

    // while thinking, the lexicon flickers as if searching for the right feeling
    if (state === "thinking" && performance.now() > this.flickerAt) {
      this.flickerAt = performance.now() + 140;
      for (const word of this.words) word.el.classList.toggle("flicker", Math.random() < 0.18);
    } else if (state !== "thinking" && this.flickerAt) {
      this.flickerAt = 0;
      for (const word of this.words) word.el.classList.remove("flicker");
    }
  }
}

function follow(current, target, dt, rate) {
  if (!current) return [...target];
  const t = 1 - Math.exp(-rate * dt);
  return [current[0] + (target[0] - current[0]) * t, current[1] + (target[1] - current[1]) * t];
}
