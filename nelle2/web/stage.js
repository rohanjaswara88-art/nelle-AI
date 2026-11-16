// The stage: Nelle's plasma ball, the fog around it, and how both react to her mood and voice.
// One requestAnimationFrame loop drives everything and pauses while the tab is hidden.
import { Constellation } from "./constellation.js";
import { createCrystalBall, parseColor } from "./crystal.js";

const FOG_SCALE = 0.4; // the fog is soft, so its canvas renders at low resolution

// Ball look per emotion. Numbers are the React Bits settings; intensity blends from neutral.
// [color, crackle, flares, sparks, glow, dustSpeed, sway, fill, haze]
// Lime on black: warm feelings lean yellow-lime, calm or low ones lean mint and teal.
const MOODS = {
  neutral: ["#A6FF00", 0.6, 0.55, 0.45, 0.9, 0.9, 0.5, 0.5, 0.7],
  happy: ["#C8FF2E", 0.75, 0.7, 0.65, 1.0, 1.15, 0.55, 0.55, 0.7],
  excited: ["#E0FF1A", 1.0, 0.95, 0.95, 1.15, 1.6, 0.7, 0.62, 0.75],
  sad: ["#2FB88A", 0.3, 0.3, 0.15, 0.7, 0.55, 0.3, 0.35, 0.9],
  frustrated: ["#FFD21F", 1.1, 0.8, 0.9, 1.0, 1.3, 0.55, 0.5, 0.8],
  confused: ["#6CFFB0", 0.7, 0.5, 0.5, 0.9, 0.9, 0.8, 0.5, 0.75],
  curious: ["#8DFF3A", 0.7, 0.6, 0.6, 0.95, 1.0, 0.65, 0.52, 0.7],
  surprised: ["#EEFF6A", 0.95, 1.0, 0.9, 1.2, 1.4, 0.6, 0.58, 0.7],
  disappointed: ["#2A9C76", 0.3, 0.25, 0.15, 0.65, 0.5, 0.3, 0.3, 0.9],
  nervous: ["#B8FF4A", 1.0, 0.5, 0.8, 0.95, 1.5, 0.9, 0.48, 0.8],
  casual: ["#A6FF00", 0.55, 0.5, 0.45, 0.9, 0.9, 0.55, 0.5, 0.7],
  playful: ["#D2FF3A", 0.8, 0.75, 0.8, 1.05, 1.3, 0.8, 0.55, 0.7],
  thinking: ["#4DFFC4", 0.5, 0.4, 0.35, 0.85, 0.7, 0.35, 0.5, 0.8],
  concerned: ["#45D69E", 0.45, 0.4, 0.3, 0.8, 0.7, 0.4, 0.45, 0.85],
};
const KEYS = ["crackle", "flares", "sparks", "glow", "dustSpeed", "sway", "fill", "haze"];
const NEUTRAL = MOODS.neutral;
const TOP = Math.PI / 2;
const SEARCH_AFTER = 1.4; // seconds of thinking before the ball starts "searching"
const PING_EVERY = 1.1;
const GESTURE_HOLD = 2.5; // seconds a gesture shape stays up
const HAND_REACH = 1.0; // the camera frame's edges map to the ball's rim
const KICK_SPEED = 0.35; // finger speed (ball radii per second) before a move also jolts the dust
const KICK_EVERY = 0.12;
const ARC_SPEED = 1.5; // faster than this, the rim sparks where the finger is heading
const ARC_EVERY = 0.16;

const rand = (a, b) => a + Math.random() * (b - a);
const ease = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgba = (c, a) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
const COLORS = Object.fromEntries(Object.entries(MOODS).map(([name, [hex]]) => [name, parseColor(hex, [0.65, 1, 0])]));

export class Stage {
  constructor(fogCanvas, ballContainer, mindCanvas) {
    this.fog = fogCanvas;
    this.mind = new Constellation(mindCanvas);
    this.ctx = fogCanvas.getContext("2d");
    this.ballContainer = ballContainer;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.frameHooks = [];

    this.state = "idle";
    this.emotion = "neutral";
    this.intensity = 0.4;
    this.override = null; // { emotion, intensity, until }: a brief mood from a gesture
    this.timeline = []; // [{ at, run }]: small timed steps for gesture animations
    this.lastKick = 0;
    this.lastArc = 0;
    this.level = 0;
    this.voice = 0;
    this.time = 0;
    this.nextBeat = 0;
    this.thinkAngle = TOP;
    this.spin = 0; // turns the dust cloud: a vortex while thinking
    this.spinSpeed = 0;
    this.seek = 0; // 0..1, how strongly the thinking/searching visuals show
    this.thinkStart = 0;
    this.searching = false;
    this.pings = [];
    this.ripples = [];
    this.pulses = [];
    this.color = [...COLORS.neutral];
    this.values = Object.fromEntries(KEYS.map((key, i) => [key, NEUTRAL[i + 1]]));
    this.blobs = Array.from({ length: 9 }, (_, i) => ({
      seed: rand(0, 50),
      x: rand(0, 1),
      y: rand(0.15, 1),
      r: rand(0.25, 0.55),
      a: rand(0.035, 0.08),
      front: i >= 6,
      speed: rand(0.005, 0.014) * (Math.random() < 0.5 ? -1 : 1),
    }));

    try {
      this.ball = createCrystalBall(ballContainer, { size: 0.7, interactive: true, hoverStrength: 0.7 });
    } catch (error) {
      console.warn("Crystal ball unavailable:", error);
      this.ball = null;
    }
    if (!this.ball) document.body.classList.add("no-webgl");

    this.loop = this.loop.bind(this);
    this.resize = this.resize.bind(this);
    addEventListener("resize", this.resize);
    // the sphere's slot shrinks a little once the chat starts, so follow the box itself too
    new ResizeObserver(this.resize).observe(this.ballContainer);
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

  resize() {
    this.fog.width = Math.round(innerWidth * FOG_SCALE);
    this.fog.height = Math.round(innerHeight * FOG_SCALE);
    // as big as fits its slot at the top of the chat box, keeping a margin so the glow isn't clipped
    const { width, height } = this.ballContainer.getBoundingClientRect();
    const room = Math.min(width * 0.8, height * 0.8);
    this.baseSize = Math.max(0.42, Math.min(0.8, room / Math.max(1, Math.min(width, height))));
  }

  setMood(emotion, intensity) {
    if (!MOODS[emotion]) emotion = "neutral";
    const changed = emotion !== this.emotion;
    this.emotion = emotion;
    this.intensity = Math.min(1, Math.max(0, intensity));
    if (changed && this.ball) {
      // a change of heart crackles around the rim
      this.ball.surge(0.6);
      this.ball.arc(rand(0, Math.PI * 2), 1.1);
      if (emotion === "surprised" || emotion === "excited") this.ball.kick(0, 0, 0.8);
    }
  }

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    this.nextBeat = this.time + 0.3;
    if (state === "listening") this.pulses.push(this.time);
    if (state === "thinking") {
      this.thinkStart = this.time;
      this.searching = false;
    }
    this.mind.setThinking(state === "thinking");
  }

  /** Audio loudness 0..1 while speaking. */
  setLevel(level) {
    this.level = level;
  }

  /** The user just sent something: the ball takes it in with a swirl from below. */
  receive() {
    if (!this.ball) return;
    this.ball.kick(rand(-0.2, 0.2), -0.85, 0.9);
    this.ball.surge(0.5);
    this.ball.arc(-TOP + rand(-0.4, 0.4), 1.2);
  }

  /** A spoken word started: emphasis sparks along the rim and nudges the dust. */
  onWord(word) {
    if (!this.ball || this.state !== "speaking") return;
    const emphasis = word.length >= 6 || /[!?]$/.test(word);
    if (emphasis) {
      this.ball.arc(TOP + rand(-1.2, 1.2), 1.1);
      this.ball.kick(rand(-0.5, 0.5), rand(-0.3, 0.5), 0.35);
    } else if (Math.random() < 0.25) {
      this.ball.arc(rand(0, Math.PI * 2), 0.7);
    }
  }

  /** The answer was found: a ripple bursts out and the constellation forms the topic's shape. */
  found(topic) {
    this.ripples.push(this.time);
    this.mind.setTopic(topic);
    if (!this.ball) return;
    this.ball.surge(0.9);
    this.ball.kick(0, 0.1, 0.6);
    this.ball.arc(TOP + rand(-0.5, 0.5), 1.3);
    this.ball.arc(-TOP + rand(-0.5, 0.5), 1.1);
  }

  // ---------- hand gestures ----------

  /** True while a gesture animation is playing; new gestures are ignored until it ends. */
  get gestureBusy() {
    return this.mind.busy;
  }

  /** Run `fn` after `delay` seconds of animation time. */
  later(delay, run) {
    this.timeline.push({ at: this.time + delay, run });
  }

  runTimeline() {
    if (!this.timeline.length) return;
    const due = this.timeline.filter((step) => step.at <= this.time);
    this.timeline = this.timeline.filter((step) => step.at > this.time);
    for (const step of due) step.run();
  }

  /** Two fingers: the points bloom into a flower, petal after petal, while arcs circle the rim. */
  bloom() {
    if (!this.mind.play("flower", { from: "centre", drawTime: 1.2, hold: GESTURE_HOLD, glow: 1.25 })) return false;
    if (!this.ball) return true;
    this.ball.surge(0.7);
    const arcs = this.reducedMotion ? 2 : 7;
    for (let i = 0; i < arcs; i++) {
      this.later(i * (1.2 / arcs), () => this.ball.arc(TOP - (i / arcs) * Math.PI * 2, 0.7));
    }
    return true;
  }

  /** Five fingers: a smiling face, a brief happy mood and one playful kick to the dust. */
  smile() {
    if (!this.mind.play("smile", { drawTime: 0.9, hold: GESTURE_HOLD, glow: 1.2 })) return false;
    const hold = this.reducedMotion ? 2 : 0.9 + GESTURE_HOLD;
    this.override = { emotion: "happy", intensity: 0.85, until: this.time + hold };
    if (!this.ball) return true;
    this.ball.kick(rand(-0.3, 0.3), -0.4, this.reducedMotion ? 0.35 : 0.85);
    this.ball.surge(0.6);
    this.ball.arc(TOP + rand(-0.4, 0.4), 1);
    return true;
  }

  /** Thumbs up: "HI BRO" spelled out with particles streaming up from the dust, then scattering back. */
  hiBro() {
    const options = { from: "dust", drawTime: 1.3, hold: GESTURE_HOLD, glow: 1.45, scatter: true };
    if (!this.mind.play("text:HI BRO", options)) return false;
    if (!this.ball) return true;
    this.ball.kick(0, -0.6, this.reducedMotion ? 0.3 : 0.7); // the dust stirs as the letters rise out of it
    this.ball.surge(0.8);
    this.later(1.3, () => {
      this.ball.arc(TOP + 0.5, 1.1);
      this.ball.arc(TOP - 0.5, 1.1);
    });
    if (!this.reducedMotion) this.later(1.3 + GESTURE_HOLD, () => this.ball.kick(0, 0.2, 0.8)); // scatter
    return true;
  }

  /**
   * Pointing finger, every detection frame: `move` is { x, y, vx, vy, wave } in 0..1 screen space
   * (already mirrored) or null when not pointing. The dust is dragged hard the way the finger moves
   * and leans toward it, quick moves jolt it and spark the rim, and a wave sends ripples across.
   */
  handMove(move) {
    this.mind.setHand(move ? [(move.x - 0.5) * 2, (0.5 - move.y) * 2] : null);
    if (!this.ball || !move) return;
    const x = (move.x - 0.5) * 2 * HAND_REACH;
    const y = (0.5 - move.y) * 2 * HAND_REACH;
    const vx = move.vx * 2 * HAND_REACH;
    const vy = -move.vy * 2 * HAND_REACH;
    const speed = Math.hypot(vx, vy);
    const calm = this.reducedMotion ? 0.4 : 1;
    // only movement stirs (a still finger just leans); fast moves drag the dust well past the finger
    this.ball.push(x, y, vx * 1.5 * calm, vy * 1.5 * calm, Math.min(2.4, speed * 1.3) * calm);
    this.ball.lean(x * 1.4, y * 1.1, calm);
    if (speed > KICK_SPEED && this.time - this.lastKick > KICK_EVERY) {
      this.lastKick = this.time;
      const lead = 0.3; // jolt a little ahead of the finger, so the dust is thrown the way it moves
      this.ball.kick(x + (vx / speed) * lead, y + (vy / speed) * lead, Math.min(1.5, 0.3 + speed * 0.45) * calm);
    }
    if (!this.reducedMotion && speed > ARC_SPEED && this.time - this.lastArc > ARC_EVERY) {
      this.lastArc = this.time;
      this.ball.arc(Math.atan2(vy, vx), 0.8 + Math.min(0.8, speed * 0.2));
      this.ball.surge(Math.min(0.8, speed * 0.25));
    }
    if (move.wave) this.wave(Math.sign(vx) || 1);
  }

  /** Three-finger scrolling: the dust drifts with the scroll, so the ball feels it too. */
  handScroll(scroll) {
    if (!this.ball || !scroll) return;
    const lift = Math.max(-1, Math.min(1, -scroll.vy * 1.2));
    this.ball.lean(0, lift, this.reducedMotion ? 0.3 : 0.8);
  }

  /** A wave of the hand: ripples roll across the dust and out through the fog. */
  wave(direction = 1) {
    if (!this.ball) return;
    this.ripples.push(this.time);
    this.ball.surge(0.5);
    const steps = this.reducedMotion ? 1 : 3;
    for (let i = 0; i < steps; i++) {
      this.later(i * 0.12, () => this.ball.kick(direction * (-0.6 + i * 0.6), 0, 0.55));
    }
  }

  /** A sharp flicker, used when Nelle is interrupted or her memory is cleared. */
  jolt(strength = 1) {
    if (!this.ball) return;
    this.ball.surge(strength);
    this.ball.kick(0, 0, strength);
    this.ball.arc(rand(0, Math.PI * 2), 1.3);
    this.ball.arc(rand(0, Math.PI * 2), 1.1);
  }

  /** Show a topic's shape without the found burst (used on reset). */
  setTopic(topic) {
    this.mind.setTopic(topic);
  }

  /** The ball's centre and radius in page pixels. */
  anchors() {
    const rect = this.ballContainer.getBoundingClientRect();
    const g = this.ball?.geometry() ?? { cx: rect.width / 2, cy: rect.height / 2, radius: Math.min(rect.width, rect.height) * 0.35 };
    return { center: [rect.left + g.cx, rect.top + g.cy], radius: g.radius };
  }

  loop(now) {
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); // rAF time can trail performance.now()
    this.last = now;
    this.time += dt;
    this.animate(dt);
    this.ball?.render(Math.max(1 / 240, dt));
    const anchors = this.anchors();
    this.drawFog(anchors);
    const [x, y] = anchors.center;
    this.mind.setSearching(this.searching);
    this.mind.render(dt, { x, y, radius: anchors.radius }, this.color, this.voice);
    for (const hook of this.frameHooks) hook(dt, { anchors, state: this.state });
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Blend the ball's settings toward the current mood and state. */
  animate(dt) {
    if (this.override && this.time > this.override.until) this.override = null;
    const shown = this.override ?? this; // a gesture's brief mood wins until it runs out
    const k = 0.35 + 0.65 * shown.intensity;
    const target = mix(COLORS.neutral, COLORS[shown.emotion], k);
    this.color = mix(this.color, target, 1 - Math.exp(-1.5 * dt));

    const state = this.state;
    const mood = MOODS[shown.emotion];
    this.runTimeline();
    const goal = Object.fromEntries(KEYS.map((key, i) => [key, NEUTRAL[i + 1] + (mood[i + 1] - NEUTRAL[i + 1]) * k]));
    if (state === "thinking") {
      goal.crackle += 0.15;
      goal.fill += 0.12; // the dust gathers upward as she concentrates
      goal.sway *= 0.4;
    } else if (state === "listening") {
      goal.glow *= 1.12;
      goal.dustSpeed *= 0.8;
    }

    // thinking: the dust turns into a slow vortex; searching (a longer wait) spins it faster
    const thinking = state === "thinking";
    this.searching = thinking && this.time - this.thinkStart > SEARCH_AFTER;
    const spinGoal = thinking ? (this.searching ? 2.4 : 1.4) : 0;
    this.spinSpeed = ease(this.spinSpeed, spinGoal, thinking ? 1.4 : 0.8, dt);
    this.spin += this.spinSpeed * dt * (this.reducedMotion ? 0.2 : 1);
    this.seek = ease(this.seek, thinking ? 1 : 0, thinking ? 2 : 1.2, dt);
    if (this.searching && this.time - (this.pings.at(-1) ?? -9) > PING_EVERY) this.pings.push(this.time);
    for (const key of KEYS) this.values[key] = ease(this.values[key], goal[key], 1.6, dt);

    // the voice: loudness swells the rim and gently breathes the ball's size
    const voiceGoal = state === "speaking" ? Math.min(1, this.level * 3.2) : 0;
    this.voice = ease(this.voice, voiceGoal, voiceGoal > this.voice ? 18 : 8, dt);

    if (!this.ball) return;
    const s = this.ball.settings;
    Object.assign(s, this.values);
    s.spin = this.spin;
    s.glow = this.values.glow * (1 + this.voice * 0.35);
    s.size = this.baseSize * (1 + this.voice * 0.035 + (state === "listening" ? 0.018 : 0));
    if (this.voice > 0.15) this.ball.surge(this.voice * 0.55);
    this.ball.setColor(this.color);

    if (this.time < this.nextBeat || this.reducedMotion) return;
    if (state === "thinking") {
      // an arc chases round the rim; searching adds sparks hopping about
      this.thinkAngle -= 0.9;
      this.ball.arc(this.thinkAngle, 0.9);
      if (this.searching && Math.random() < 0.5) this.ball.arc(rand(0, Math.PI * 2), 0.7);
      this.nextBeat = this.time + (this.searching ? 0.24 : 0.32);
    } else if (state === "answering") {
      // typed replies: a slow background cycle of sparks and stirs
      this.ball.arc(rand(0, Math.PI * 2), 0.9);
      if (Math.random() < 0.6) this.ball.kick(rand(-0.6, 0.6), rand(-0.6, 0.4), 0.3);
      this.nextBeat = this.time + rand(0.8, 1.6);
    } else if (state === "listening") {
      this.ball.arc(TOP + rand(-0.6, 0.6), 0.6);
      this.nextBeat = this.time + rand(0.9, 1.5);
    } else {
      this.nextBeat = this.time + 1;
    }
  }

  drawFog(anchors) {
    const { ctx, fog } = this;
    const W = fog.width;
    const H = fog.height;
    const S = FOG_SCALE;
    const deep = [0.004, 0.008, 0.004]; // near-black with a breath of green
    const tint = mix(this.color, [0, 0, 0], 0.95); // lime is bright: only a hint of it in the black
    const [cx, cy] = anchors.center;

    const bg = ctx.createRadialGradient(cx * S, cy * S, 0, cx * S, cy * S, Math.max(W, H) * 0.8);
    bg.addColorStop(0, rgba(mix(tint, this.color, 0.04 + this.voice * 0.06), 1));
    bg.addColorStop(0.45, rgba(mix(tint, deep, 0.7), 1));
    bg.addColorStop(1, rgba(deep, 1));
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const fogColor = mix(this.color, [1, 1, 1], 0.25);
    const FOG_STRENGTH = 0.45; // a pale, thin mist: thick lime fog would turn the black olive
    const t = this.reducedMotion ? 0 : this.time;
    for (const blob of this.blobs) {
      const bx = (((blob.x + t * blob.speed + 2) % 1.4) - 0.2) * W;
      const by = (blob.y + Math.sin(t * 0.05 + blob.seed) * 0.05) * H;
      const r = blob.r * Math.max(W, H) * (1 + Math.sin(t * 0.07 + blob.seed) * 0.12);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      g.addColorStop(0, rgba(fogColor, blob.a * FOG_STRENGTH * (blob.front ? 0.6 : 1)));
      g.addColorStop(1, rgba(fogColor, 0));
      ctx.fillStyle = g;
      ctx.fillRect(bx - r, by - r, r * 2, r * 2);
    }

    // listening: slow rings spread out from the ball like sound
    if (this.state === "listening" && this.time - (this.pulses.at(-1) ?? -9) > 1.6) this.pulses.push(this.time);
    this.pulses = this.pulses.filter((start) => this.time - start < 2.4);
    ctx.lineWidth = 1;
    for (const start of this.pulses) {
      const p = (this.time - start) / 2.4;
      ctx.strokeStyle = rgba(mix(this.color, [1, 1, 1], 0.5), 0.3 * (1 - p));
      ctx.beginPath();
      ctx.arc(cx * S, cy * S, anchors.radius * S * (1.05 + p * 0.6), 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawSeeking(cx * S, cy * S, anchors.radius * S);

    if (!this.ball) {
      // no WebGL2: a soft glowing orb keeps her present
      const orb = ctx.createRadialGradient(cx * S, cy * S, 0, cx * S, cy * S, anchors.radius * S);
      orb.addColorStop(0, rgba(this.color, 0.05));
      orb.addColorStop(0.85, rgba(this.color, 0.18 + this.voice * 0.2));
      orb.addColorStop(1, rgba(this.color, 0));
      ctx.fillStyle = orb;
      ctx.fillRect(0, 0, W, H);
    }
  }
  /** Thinking and searching visuals, drawn behind the glass so they glow through the ball. */
  drawSeeking(x, y, R) {
    const { ctx } = this;
    const glow = mix(this.color, [1, 1, 1], 0.35);
    this.pings = this.pings.filter((start) => this.time - start < 1.8);
    this.ripples = this.ripples.filter((start) => this.time - start < 1.2);

    if (this.seek > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, R * 0.97, 0, Math.PI * 2);
      ctx.clip();
      // a soft core that pulses like a heartbeat
      const beat = 0.6 + 0.4 * Math.sin(this.time * (this.searching ? 6 : 4));
      const core = ctx.createRadialGradient(x, y, 0, x, y, R * 0.8);
      core.addColorStop(0, rgba(glow, 0.16 * this.seek * beat));
      core.addColorStop(1, rgba(glow, 0));
      ctx.fillStyle = core;
      ctx.fillRect(x - R, y - R, R * 2, R * 2);
      ctx.restore();
    }

    // searching: sonar pings travel out through the glass into the fog
    for (const start of this.pings) {
      const p = (this.time - start) / 1.8;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = rgba(glow, 0.32 * (1 - p) * this.seek);
      ctx.beginPath();
      ctx.arc(x, y, R * (0.3 + p * 1.3), 0, Math.PI * 2);
      ctx.stroke();
    }
    // found: one bright ripple bursts outward
    for (const start of this.ripples) {
      const p = (this.time - start) / 1.2;
      ctx.lineWidth = 0.6 + 2.2 * (1 - p);
      ctx.strokeStyle = rgba(glow, 0.6 * (1 - p) * (1 - p));
      ctx.beginPath();
      ctx.arc(x, y, R * (1 + p * 0.85), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
