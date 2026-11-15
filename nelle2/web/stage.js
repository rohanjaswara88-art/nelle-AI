// The stage: fog, the shadow figure, its motion and the glitch, all in one requestAnimationFrame loop.
import { FIGURE, anchorPoints, drawFigure } from "./figure.js";

const RENDER_SCALE = 0.55; // canvas pixels per CSS pixel: the scene is soft, so this stays light
const CORE_DETAIL = 0.22; // the figure is rendered small then scaled up, which blurs it for free
const HALO_DETAIL = 0.07;

// Background glow and deep colours per emotion. Intensity blends them in from neutral.
const PALETTE = {
  neutral: ["#1d5fe0", "#020a26"],
  happy: ["#2a76ff", "#031035"],
  excited: ["#3388ff", "#04123c"],
  sad: ["#0f3596", "#01061a"],
  frustrated: ["#3b34b8", "#07061f"],
  confused: ["#1f55cf", "#030a24"],
  curious: ["#1b6be8", "#020c2c"],
  surprised: ["#2f80ff", "#031038"],
  disappointed: ["#12347f", "#010518"],
  nervous: ["#1c4cc0", "#020820"],
  casual: ["#1a62dc", "#020a26"],
  playful: ["#3a66ff", "#060b33"],
  thinking: ["#143fae", "#010720"],
  concerned: ["#163c9e", "#01071d"],
};

// Posture per emotion: pitch (deg down), lean (px, - is forward), slump (px down), breath rate (Hz),
// sway amount, glitch frequency, gesture energy, sway speed.
const POSTURE = {
  neutral: [0, 0, 0, 0.2, 1, 1, 0.6, 1],
  happy: [-2, -2, -3, 0.24, 1.1, 0.8, 0.9, 1.1],
  excited: [-3, -4, -5, 0.3, 1.4, 1.1, 1.2, 1.4],
  sad: [7, 2, 7, 0.16, 0.6, 0.9, 0.35, 0.7],
  frustrated: [3, -3, 0, 0.27, 0.9, 1.6, 0.9, 1.2],
  confused: [2, 0, 0, 0.21, 1.2, 1.7, 0.6, 0.9],
  curious: [-1, -7, -2, 0.22, 1, 0.9, 0.8, 1],
  surprised: [-4, 4, -6, 0.28, 0.8, 1.8, 0.8, 1.2],
  disappointed: [6, 1, 6, 0.17, 0.6, 1, 0.4, 0.7],
  nervous: [2, 2, 1, 0.32, 1.3, 2.1, 0.7, 1.7],
  casual: [0, 0, 0, 0.2, 1.1, 0.9, 0.8, 1],
  playful: [-2, -2, -2, 0.25, 1.4, 1.2, 1.1, 1.3],
  thinking: [4, -2, 2, 0.18, 0.7, 1.2, 0.3, 0.8],
  concerned: [4, -3, 2, 0.19, 0.8, 1, 0.5, 0.9],
};

// Arm poses: [upper, fore, wrist] degrees.
const POSES = {
  rest: [0, 0, 0],
  low: [10, 62, -12],
  mid: [18, 100, -16],
  open: [24, 116, -26],
  lift: [28, 126, -6],
};
const SPEAKING_POSES = ["low", "mid", "open", "mid", "lift", "low"];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const ease = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const wave = (t, seed) => Math.sin(t * 0.31 + seed) * 0.6 + Math.sin(t * 0.73 + seed * 1.7) * 0.3 + Math.sin(t * 1.37 + seed * 2.3) * 0.1;

/** A critically damped spring: smooth starts and stops, no overshoot unless kicked. */
class Spring {
  constructor(value = 0, stiffness = 30) {
    this.value = value;
    this.velocity = 0;
    this.target = value;
    this.stiffness = stiffness;
  }
  step(dt) {
    const k = this.stiffness;
    const c = 2 * Math.sqrt(k);
    this.velocity += (k * (this.target - this.value) - c * this.velocity) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

/** An underdamped spring for nods: kick it and it dips, then settles back to zero. */
class Nod {
  constructor() {
    this.value = 0;
    this.velocity = 0;
  }
  kick(amount) {
    this.velocity += amount;
  }
  step(dt) {
    this.velocity += (-70 * this.value - 10 * this.velocity) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.core = document.createElement("canvas");
    this.halo = document.createElement("canvas");
    this.tint = document.createElement("canvas");
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.frameHooks = [];

    this.state = "idle";
    this.emotion = "neutral";
    this.intensity = 0.4;
    this.level = 0;
    this.jawLevel = 0;
    this.time = rand(0, 100);
    this.reveal = 0; // the figure emerges from the fog on load

    const neutral = PALETTE.neutral.map(hexToRgb);
    this.glow = neutral[0];
    this.deep = neutral[1];
    this.posture = [...POSTURE.neutral];

    this.arm = [0, 1, 2].map(() => new Spring(0, 14));
    this.gaze = { pitch: new Spring(0, 3), x: new Spring(0, 3), sway: new Spring(0, 2) };
    this.nod = new Nod();
    this.breathPhase = 0;
    this.nextGaze = 2;
    this.nextGesture = 0;
    this.nextCycle = 0;
    this.glitchAt = rand(2, 5);
    this.glitchUntil = 0;
    this.glitchStrength = 0;
    this.pulses = [];
    this.fog = Array.from({ length: 10 }, (_, i) => ({
      seed: rand(0, 50),
      x: rand(0, 1),
      y: rand(0.2, 1),
      r: rand(0.22, 0.5),
      a: rand(0.04, 0.1),
      front: i >= 6,
      speed: rand(0.006, 0.016) * (Math.random() < 0.5 ? -1 : 1),
    }));

    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", () => (document.hidden ? this.stop() : this.start()));
    this.resize();
  }

  onFrame(hook) {
    this.frameHooks.push(hook);
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setMood(emotion, intensity) {
    if (!PALETTE[emotion]) emotion = "neutral";
    const changed = emotion !== this.emotion;
    this.emotion = emotion;
    this.intensity = Math.min(1, Math.max(0, intensity));
    if (changed && emotion === "surprised") this.nod.kick(-26);
    if (changed) this.glitch(0.5);
  }

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    this.nextGesture = this.time + rand(0.2, 0.6);
    this.nextCycle = this.time + 0.4;
    if (state === "listening") this.pulses.push(this.time);
    if (state === "idle" || state === "thinking" || state === "listening") this.setPose("rest");
  }

  /** Audio loudness 0..1 while speaking; drives the jaw and a little head motion. */
  setLevel(level) {
    this.level = level;
  }

  /** A spoken word started: emphasis words get a small nod and may start a gesture. */
  onWord(word) {
    if (this.state !== "speaking") return;
    const emphasis = word.length >= 6 || /[!?]$/.test(word);
    if (emphasis || Math.random() < 0.3) this.nod.kick(emphasis ? 20 : 11);
    if (emphasis && this.time > this.nextGesture) this.gestureNow();
  }

  glitch(strength = 1) {
    if (this.reducedMotion) return;
    this.glitchUntil = this.time + rand(0.09, 0.22) * (0.6 + strength);
    this.glitchStrength = strength;
  }

  setPose(name) {
    POSES[name].forEach((angle, i) => (this.arm[i].target = angle));
  }

  gestureNow() {
    const energy = this.posture[6];
    this.setPose(Math.random() < 0.18 ? "rest" : pick(SPEAKING_POSES));
    this.nextGesture = this.time + rand(0.8, 1.9) / Math.max(0.4, energy);
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.canvas.width = Math.round(w * RENDER_SCALE);
    this.canvas.height = Math.round(h * RENDER_SCALE);
    this.viewW = w;
    this.viewH = h;
    const narrow = w <= 860;
    // On phones the conversation is a bottom sheet, so the figure fits the space above it.
    this.scale = narrow ? Math.min((h * 0.54 * 1.5) / FIGURE.height, (w * 1.15) / FIGURE.width) : (h * 1.08) / FIGURE.height;
    const panelSpace = narrow ? 0 : Math.min(440, w * 0.32);
    this.figureX = (w - panelSpace) * (narrow ? 0.54 : 0.5);
    this.figureTop = h * (narrow ? 0.085 : 0.08) - 110 * this.scale;
    const fw = FIGURE.width * this.scale * RENDER_SCALE;
    const fh = FIGURE.height * this.scale * RENDER_SCALE;
    for (const [c, detail] of [[this.core, CORE_DETAIL], [this.halo, HALO_DETAIL], [this.tint, CORE_DETAIL]]) {
      c.width = Math.max(32, Math.round(fw * detail));
      c.height = Math.max(44, Math.round(fh * detail));
    }
  }

  /** Design-space point to CSS pixels. */
  toScreen([x, y]) {
    return [this.figureX + (x - FIGURE.centerX) * this.scale, this.figureTop + y * this.scale];
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += this.reducedMotion ? dt * 0.4 : dt;
    const pose = this.animate(dt);
    this.render(pose, dt);
    const anchors = {};
    for (const [name, point] of Object.entries(anchorPoints(pose))) anchors[name] = this.toScreen(point);
    for (const hook of this.frameHooks) hook(dt, { anchors, state: this.state });
    this.raf = requestAnimationFrame(this.loop);
  }

  animate(dt) {
    const t = this.time;
    const k = 0.35 + 0.65 * this.intensity;
    const target = POSTURE[this.emotion].map((v, i) => POSTURE.neutral[i] + (v - POSTURE.neutral[i]) * k);
    this.posture = this.posture.map((v, i) => ease(v, target[i], 1.4, dt));
    const [pitch, lean, slump, breathRate, sway, , energy, swaySpeed] = this.posture;

    let statePitch = 0;
    let stateLean = 0;
    if (this.state === "listening") [statePitch, stateLean] = [-2.5, -6];
    if (this.state === "thinking") [statePitch, stateLean] = [4, -1];
    this.statePitch = ease(this.statePitch ?? 0, statePitch, 2.2, dt);
    this.stateLean = ease(this.stateLean ?? 0, stateLean, 2.2, dt);

    if (t > this.nextGaze) {
      const calm = this.state === "speaking" ? 0.6 : 1;
      this.gaze.pitch.target = rand(-2.5, 2.5) * calm;
      this.gaze.x.target = rand(-4, 4) * calm;
      this.nextGaze = t + rand(3.5, 8);
    }

    if (this.state === "speaking" && t > this.nextGesture && energy > 0.25) this.gestureNow();
    if (this.state === "answering" && t > this.nextCycle) this.backgroundCycle();
    if (this.state !== "speaking" && this.state !== "answering" && this.arm[1].target !== 0) this.setPose("rest");

    if (t > this.glitchAt) {
      if (this.state !== "idle" || Math.random() < 0.7) this.glitch(rand(0.35, 1));
      const thinkingBoost = this.state === "thinking" ? 2.5 : 1;
      this.glitchAt = t + rand(4, 10) / (this.posture[5] * thinkingBoost);
    }

    this.breathPhase += dt * breathRate * Math.PI * 2;
    const breath = Math.sin(this.breathPhase) + 0.2 * Math.sin(this.breathPhase * 2);

    // The jaw follows speech loudness with a quick attack and a slower release, then rests closed.
    const speechTarget = this.state === "speaking" ? Math.min(1, this.level * 3.2) : 0;
    this.jawLevel = ease(this.jawLevel, speechTarget, speechTarget > this.jawLevel ? 28 : 12, dt);

    const nod = this.nod.step(dt);
    const confusedTilt = this.emotion === "confused" ? Math.sin(t * 0.6) * 1.6 * k : 0;
    const speechBob = this.state === "speaking" ? this.jawLevel * 1.4 : 0;
    const s = sway * (this.reducedMotion ? 0.3 : 1);

    this.reveal = Math.min(1, this.reveal + dt / 2.6);
    return {
      bodyX: lean * 0.4 + this.gaze.sway.step(dt) + wave(t * swaySpeed, 3) * 2.2 * s,
      slump,
      breath,
      headX: lean + this.stateLean + this.gaze.x.step(dt) + wave(t * swaySpeed, 7) * 2.5 * s,
      headY: slump * 0.4,
      pitch: pitch + this.statePitch + this.gaze.pitch.step(dt) + nod + confusedTilt + speechBob + wave(t * swaySpeed, 11) * 1.1 * s,
      jaw: this.jawLevel * 6,
      upper: this.arm[0].step(dt),
      fore: this.arm[1].step(dt),
      wrist: this.arm[2].step(dt) + wave(t * 1.3, 5) * 4 * Math.min(1, this.arm[1].value / 60),
    };
  }

  /** Text answers: a slow, looping set of small movements in the background. */
  backgroundCycle() {
    const action = pick(["turn", "turn", "gesture", "nod", "shift", "rest"]);
    if (action === "turn") {
      this.gaze.pitch.target = rand(-3, 3);
      this.gaze.x.target = rand(-7, 7);
    } else if (action === "gesture") {
      this.setPose(pick(["low", "mid", "low"]));
    } else if (action === "nod") {
      this.nod.kick(10);
      setTimeout(() => this.nod.kick(7), 420);
    } else if (action === "shift") {
      this.gaze.sway.target = rand(-6, 6);
    } else {
      this.setPose("rest");
    }
    this.nextCycle = this.time + rand(1.8, 3.4);
  }

  render(pose, dt) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const R = RENDER_SCALE;

    const k = 0.35 + 0.65 * this.intensity;
    const [glowHex, deepHex] = PALETTE[this.emotion];
    const neutral = PALETTE.neutral.map(hexToRgb);
    this.glow = mix(this.glow, mix(neutral[0], hexToRgb(glowHex), k), 1 - Math.exp(-1.2 * dt));
    this.deep = mix(this.deep, mix(neutral[1], hexToRgb(deepHex), k), 1 - Math.exp(-1.2 * dt));
    const speaking = this.state === "speaking" ? this.jawLevel * 0.08 : 0;
    const fogColor = mix(this.glow, [190, 220, 255], 0.35);

    // 1. background: a single soft glow behind the head, falling off into gloom
    const fx = this.figureX * R;
    const bg = ctx.createRadialGradient(fx, H * 0.36, 0, fx, H * 0.4, Math.max(W, H) * 0.85);
    bg.addColorStop(0, rgba(mix(this.glow, [255, 255, 255], 0.08 + speaking), 1));
    bg.addColorStop(0.45, rgba(mix(this.glow, this.deep, 0.45), 1));
    bg.addColorStop(1, rgba(this.deep, 1));
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    this.drawFog(false, fogColor, W, H);

    // 2. the shadow: a wide soft halo, then the core profile, both upscaled from small buffers
    const fw = FIGURE.width * this.scale * R;
    const fh = FIGURE.height * this.scale * R;
    const x = fx - FIGURE.centerX * this.scale * R;
    const y = this.figureTop * R;
    this.paintFigure(this.halo, pose, "rgb(1,6,30)");
    this.paintFigure(this.core, pose, "rgb(0,4,20)");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = 0.5 * this.reveal;
    ctx.drawImage(this.halo, x - fw * 0.02, y - fh * 0.012, fw * 1.04, fh * 1.024);
    ctx.globalAlpha = 0.94 * this.reveal;
    ctx.drawImage(this.core, x, y, fw, fh);
    ctx.globalAlpha = 1;

    this.drawPulses(pose, R);
    if (this.state === "thinking") this.drawScan(x, y, fw, fh);
    if (this.time < this.glitchUntil) this.drawGlitch(pose, x, y, fw, fh);

    // 3. fog in front, thickest at the bottom so the figure fades into it
    this.drawFog(true, fogColor, W, H);
    const floor = ctx.createLinearGradient(0, H * 0.55, 0, H);
    floor.addColorStop(0, rgba(fogColor, 0));
    floor.addColorStop(1, rgba(mix(fogColor, this.glow, 0.5), 0.42));
    ctx.fillStyle = floor;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
  }

  paintFigure(buffer, pose, color) {
    const c = buffer.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, buffer.width, buffer.height);
    c.setTransform(buffer.width / FIGURE.width, 0, 0, buffer.height / FIGURE.height, 0, 0);
    c.fillStyle = color;
    drawFigure(c, pose);
  }

  drawFog(front, color, W, H) {
    const { ctx } = this;
    const t = this.time;
    for (const blob of this.fog) {
      if (blob.front !== front) continue;
      const bx = ((blob.x + t * blob.speed + 2) % 1.4 - 0.2) * W;
      const by = (blob.y + Math.sin(t * 0.05 + blob.seed) * 0.05) * H;
      const r = blob.r * Math.max(W, H) * (1 + Math.sin(t * 0.07 + blob.seed) * 0.12);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      const alpha = blob.a * (front ? 0.7 : 1);
      g.addColorStop(0, rgba(color, alpha));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(bx - r, by - r, r * 2, r * 2);
    }
  }

  drawPulses(pose, R) {
    const { ctx } = this;
    if (this.state === "listening" && this.time - (this.pulses.at(-1) ?? 0) > 1.6) this.pulses.push(this.time);
    this.pulses = this.pulses.filter((start) => this.time - start < 2.4);
    if (!this.pulses.length) return;
    const [cx, cy] = this.toScreen(anchorPoints(pose).temple);
    ctx.lineWidth = 1;
    for (const start of this.pulses) {
      const p = (this.time - start) / 2.4;
      ctx.strokeStyle = `rgba(170,215,255,${0.22 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(cx * R, cy * R, (40 + p * 220) * this.scale * R, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawScan(x, y, fw, fh) {
    const { ctx } = this;
    const p = (this.time * 0.35) % 1;
    const sy = y + fh * (0.1 + p * 0.6);
    const g = ctx.createLinearGradient(0, sy - 18, 0, sy + 2);
    g.addColorStop(0, "rgba(150,205,255,0)");
    g.addColorStop(1, "rgba(150,205,255,0.16)");
    ctx.fillStyle = g;
    ctx.fillRect(x, sy - 18, fw, 20);
    ctx.fillStyle = "rgba(190,225,255,0.35)";
    ctx.fillRect(x + fw * 0.1, sy, fw * 0.8, 1);
  }

  drawGlitch(pose, x, y, fw, fh) {
    const { ctx, canvas } = this;
    const s = this.glitchStrength;
    // a cyan ghost of the figure, shifted sideways
    const tc = this.tint.getContext("2d");
    tc.globalCompositeOperation = "source-over";
    tc.clearRect(0, 0, this.tint.width, this.tint.height);
    tc.drawImage(this.core, 0, 0);
    tc.globalCompositeOperation = "source-in";
    tc.fillStyle = "rgb(120,200,255)";
    tc.fillRect(0, 0, this.tint.width, this.tint.height);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.09 * s;
    ctx.drawImage(this.tint, x + rand(-10, 10) * s, y, fw, fh);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // horizontal slices of the scene, displaced
    const strips = 2 + Math.floor(s * 4);
    for (let i = 0; i < strips; i++) {
      const sy = y + fh * rand(0.08, 0.7);
      const sh = rand(1.5, 7) * (0.5 + s);
      const dx = rand(-28, 28) * s;
      ctx.drawImage(canvas, x - 20, sy, fw + 40, sh, x - 20 + dx, sy, fw + 40, sh);
    }
    // a few bright pixel blocks near the silhouette's edge
    ctx.fillStyle = "rgba(185,225,255,0.55)";
    for (let i = 0; i < 3 + s * 6; i++) {
      ctx.fillRect(x + fw * rand(0.15, 0.85), y + fh * rand(0.1, 0.65), rand(2, 9), rand(1, 3));
    }
  }
}
