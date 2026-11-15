// The constellation inside the ball: points of light joined by lines.
// Idle, they form a slowly turning network sphere. While Nelle thinks they drift apart and keep
// re-linking as if browsing; when the answer is found they assemble into a shape for the topic
// (</> for code, a heart for love, an atom for science...). Hand gestures play short shapes over the
// top (a flower, a smile, words) and then hand back to the topic. Everything scales with the ball's
// radius, so the drawing fits any screen size.

import { layoutText } from "./strokefont.js";

const NODES = 120; // topic shapes use up to about 70; words and flowers use more, the rest float free
const TAU = Math.PI * 2;
const LINK_DISTANCE = 0.42; // in ball units, for the drifting "browsing" web
const MAX_DPR = 2;
const ARRIVE_SECONDS = 0.32; // a gesture group's points are nearly in place this long after setting off
const LINE_SECONDS = 0.3; // then its lines draw in over this long

const rand = (a, b) => a + Math.random() * (b - a);
const ease = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- shapes: built from strokes in a 2D box from -1 to 1 (y up) ----------

class Sketch {
  constructor(step) {
    this.step = step;
    this.points = [];
    this.edges = [];
    this.groups = []; // which group each point belongs to: petals and letters appear in group order
    this.group = 0;
  }

  point(x, y, z = 0) {
    this.points.push([x, y, z + rand(-0.04, 0.04)]);
    this.groups.push(this.group);
    return this.points.length - 1;
  }

  /** A line through the given corners, sampled every `step` units. */
  line(corners, closed = false) {
    const path = closed ? [...corners, corners[0]] : corners;
    const first = this.points.length;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      const pieces = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / this.step));
      const last = i === path.length - 2;
      for (let p = 0; p < pieces + (last && !closed ? 1 : 0); p++) {
        this.point(ax + ((bx - ax) * p) / pieces, ay + ((by - ay) * p) / pieces);
      }
    }
    const end = this.points.length - 1;
    for (let i = first; i < end; i++) this.edges.push([i, i + 1]);
    if (closed && end > first) this.edges.push([end, first]);
  }

  /** An ellipse (or arc) sampled as a closed or open line. */
  ellipse(cx, cy, rx, ry, { tilt = 0, from = 0, to = TAU } = {}) {
    const closed = to - from >= TAU - 1e-6;
    const length = Math.abs(to - from) * Math.max(rx, ry);
    const count = Math.max(3, Math.round(length / this.step));
    const corners = [];
    for (let i = 0; i < count + (closed ? 0 : 1); i++) {
      const a = from + ((to - from) * i) / count;
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      corners.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
    }
    const first = this.points.length;
    corners.forEach(([x, y]) => this.point(x, y));
    const end = this.points.length - 1;
    for (let i = first; i < end; i++) this.edges.push([i, i + 1]);
    if (closed) this.edges.push([end, first]);
  }

  /** Fully connect two groups of points (used for the neural net). */
  mesh(a, b) {
    for (const i of a) for (const j of b) this.edges.push([i, j]);
  }
}

const SHAPES = {
  code(s) {
    s.line([[-0.32, 0.5], [-0.86, 0], [-0.32, -0.5]]);
    s.line([[0.16, 0.66], [-0.16, -0.66]]);
    s.line([[0.32, 0.5], [0.86, 0], [0.32, -0.5]]);
  },
  ai(s) {
    const layer = (x, ys) => ys.map((y) => s.point(x, y, rand(-0.15, 0.15)));
    const a = layer(-0.75, [0.55, 0, -0.55]);
    const b = layer(0, [0.72, 0.24, -0.24, -0.72]);
    const c = layer(0.75, [0.3, -0.3]);
    s.mesh(a, b);
    s.mesh(b, c);
  },
  math(s) {
    s.line([[0.58, 0.48], [0.58, 0.66], [-0.56, 0.66], [0.06, 0], [-0.56, -0.66], [0.58, -0.66], [0.58, -0.48]]);
  },
  science(s) {
    for (const tilt of [0, Math.PI / 3, (2 * Math.PI) / 3]) s.ellipse(0, 0, 0.88, 0.3, { tilt });
    s.ellipse(0, 0, 0.09, 0.09);
  },
  space(s) {
    s.ellipse(0, 0, 0.44, 0.44);
    s.ellipse(0, 0, 0.92, 0.24, { tilt: -0.32, from: -0.1, to: Math.PI + 0.1 });
    s.ellipse(0, 0, 0.92, 0.24, { tilt: -0.32, from: Math.PI + 0.75, to: TAU - 0.75 });
  },
  music(s) {
    s.ellipse(-0.42, -0.5, 0.2, 0.14, { tilt: 0.35 });
    s.ellipse(0.42, -0.34, 0.2, 0.14, { tilt: 0.35 });
    s.line([[-0.24, -0.45], [-0.24, 0.5], [0.6, 0.66], [0.6, -0.29]]);
    s.line([[-0.24, 0.26], [0.6, 0.42]]);
  },
  love(s) {
    const corners = [];
    for (let i = 0; i < 26; i++) {
      const t = (i / 26) * TAU;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      corners.push([x / 18, y / 18 + 0.08]);
    }
    corners.forEach(([x, y]) => s.point(x, y));
    for (let i = 0; i < corners.length; i++) s.edges.push([i, (i + 1) % corners.length]);
  },
  health(s) {
    s.line([[-0.92, 0], [-0.42, 0], [-0.26, 0.32], [-0.1, -0.6], [0.08, 0.78], [0.24, -0.24], [0.38, 0], [0.92, 0]]);
  },
  money(s) {
    s.line([[-0.82, -0.62], [-0.4, -0.12], [-0.08, -0.34], [0.36, 0.22], [0.78, 0.58]]);
    s.line([[0.44, 0.62], [0.78, 0.58], [0.72, 0.24]]);
    s.line([[-0.86, 0.7], [-0.86, -0.78], [0.86, -0.78]]);
  },
  weather(s) {
    const bumps = [[-0.42, 0.12, 0.3], [0.02, 0.32, 0.4], [0.44, 0.08, 0.28]];
    for (const [i, [cx, cy, r]] of bumps.entries()) {
      const from = i === 0 ? Math.PI * 0.5 : i === 1 ? Math.PI * 0.08 : -Math.PI * 0.5;
      const to = i === 0 ? Math.PI * 1.5 : i === 1 ? Math.PI * 0.95 : Math.PI * 0.62;
      s.ellipse(cx, cy, r, r, { from, to });
    }
    s.line([[-0.42, -0.18], [0.44, -0.2]]);
    s.line([[0.08, -0.3], [-0.12, -0.58], [0.06, -0.58], [-0.1, -0.86]]);
  },
  time(s) {
    s.ellipse(0, 0, 0.82, 0.82);
    s.line([[0, 0.56], [0, 0], [0.4, -0.18]]);
  },
  nature(s) {
    const left = [];
    const right = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const y = -0.72 + t * 1.5;
      const w = 0.52 * Math.sin(Math.PI * t);
      left.push([-w, y]);
      right.unshift([w, y]);
    }
    s.line([...left, ...right.slice(1, -1)], true);
    s.line([[0, -0.9], [0, 0.6]]);
    s.line([[0, -0.2], [-0.32, 0.08]]);
    s.line([[0, 0.12], [0.3, 0.38]]);
  },
  travel(s) {
    s.line([[-0.84, 0.08], [0.86, 0.52], [-0.26, -0.16]], true);
    s.line([[-0.26, -0.16], [0.86, 0.52], [-0.04, -0.66]], true);
  },
  web(s) {
    s.ellipse(0, 0, 0.82, 0.82);
    s.ellipse(0, 0, 0.82, 0.26);
    s.ellipse(0, 0, 0.34, 0.82);
  },
  books(s) {
    s.line([[0, -0.46], [-0.86, -0.3], [-0.86, 0.58], [0, 0.42], [0.86, 0.58], [0.86, -0.3], [0, -0.46]]);
    s.line([[0, 0.42], [0, -0.46]]);
    s.line([[-0.66, 0.26], [-0.2, 0.18]]);
    s.line([[0.2, 0.18], [0.66, 0.26]]);
  },
  fun(s) {
    s.ellipse(0, 0, 0.82, 0.82);
    s.ellipse(0, -0.05, 0.48, 0.42, { from: Math.PI * 1.15, to: Math.PI * 1.85 });
    s.line([[-0.28, 0.42], [-0.28, 0.18]]);
    s.line([[0.28, 0.42], [0.28, 0.18]]);
  },
  food(s) {
    s.line([[-0.58, 0.18], [-0.46, -0.66], [0.3, -0.66], [0.42, 0.18]], true);
    s.ellipse(0.5, -0.2, 0.24, 0.24, { from: -Math.PI / 2, to: Math.PI / 2 });
    s.line([[-0.28, 0.36], [-0.18, 0.56], [-0.28, 0.78]]);
    s.line([[0.08, 0.36], [0.18, 0.56], [0.08, 0.78]]);
  },
  general(s) {
    // a network sphere: points spread evenly over a globe, each linked to its nearest neighbours
    const count = 46;
    for (let i = 0; i < count; i++) {
      const y = 1 - (2 * (i + 0.5)) / count;
      const r = Math.sqrt(1 - y * y);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      s.points.push([Math.cos(a) * r * 0.86, y * 0.86, Math.sin(a) * r * 0.86]);
      s.groups.push(0);
    }
    const seen = new Set();
    s.points.forEach((p, i) => {
      s.points
        .map((q, j) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2])
        .filter(([j]) => j !== i)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3)
        .forEach(([j]) => {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (seen.has(key)) return;
          seen.add(key);
          s.edges.push([i, j]);
        });
    });
  },
};

export const TOPICS = Object.keys(SHAPES);

// ---------- gesture shapes ----------

const PETALS = 7;
const TOP_ANGLE = Math.PI / 2;

export const GESTURE_SHAPES = {
  /** A flower: a small centre ring (group 0) and petals as closed curves (one group each). */
  flower(s) {
    s.ellipse(0, 0, 0.15, 0.15);
    for (let i = 0; i < PETALS; i++) {
      s.group = i + 1;
      const angle = TOP_ANGLE + (i / PETALS) * TAU;
      s.ellipse(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0.33, 0.15, { tilt: angle });
    }
  },
  /** A cute smiling face: round outline, happy ^ ^ eyes and a wide smile. */
  smile(s) {
    s.ellipse(0, 0, 0.86, 0.86);
    s.group = 1;
    s.ellipse(-0.32, 0.2, 0.17, 0.15, { from: 0, to: Math.PI });
    s.ellipse(0.32, 0.2, 0.17, 0.15, { from: 0, to: Math.PI });
    s.group = 2;
    s.ellipse(0, -0.02, 0.54, 0.46, { from: Math.PI * 1.12, to: Math.PI * 1.88 });
  },
};

/** Words in the stroke font; each letter is its own group so they spell out in order. */
function textShape(text) {
  return (s) => {
    const { strokes, letters } = layoutText(text, { maxWidth: 2.25, maxHeight: 0.7 });
    strokes.forEach((stroke, i) => {
      s.group = letters[i];
      s.line(stroke);
    });
  };
}

function buildSketch(draw, firstStep) {
  for (let step = firstStep; ; step *= 1.12) {
    const sketch = new Sketch(step);
    draw(sketch);
    if (sketch.points.length <= NODES) return sketch;
  }
}

/** Build a topic shape with as many points as will fit, coarsening the sampling until it does. */
export function buildShape(topic) {
  return buildSketch(SHAPES[topic] ?? SHAPES.general, 0.17);
}

/** Build a gesture shape: "flower", "smile" or "text:SOME WORDS". */
export function buildGestureShape(name) {
  if (name.startsWith("text:")) return buildSketch(textShape(name.slice(5)), 0.075);
  return buildSketch(GESTURE_SHAPES[name], 0.12);
}

// ---------- the constellation ----------

export class Constellation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.time = 0;
    this.mode = "shape"; // "shape" (holding a topic) or "drift" (thinking / browsing)
    this.topic = "general";
    this.thinking = false;
    this.effect = null; // a gesture shape playing over the top, see play()
    this.glow = 1;
    this.drawTime = 1.3;
    this.handTarget = null; // [x, y] in -1..1 while a hand is in view
    this.hand = [0, 0]; // eased: the constellation turns and drifts toward the hand
    this.shape = buildShape("general");
    this.yaw = 0;
    this.pitch = 0.32;
    this.draw = 1; // 0..1, how much of the shape's lines are drawn in
    this.alpha = 0; // fades the whole constellation in on load
    this.speed = 1;
    this.pulses = [];
    this.nextPulse = 0;
    this.nodes = Array.from({ length: NODES }, () => {
      const home = randomInBall(0.9);
      return {
        pos: [...home],
        home,
        phase: [rand(0, TAU), rand(0, TAU), rand(0, TAU)],
        freq: [rand(0.3, 0.7), rand(0.3, 0.7), rand(0.3, 0.7)],
        delay: 0,
        lit: 0,
      };
    });
    this.assign();
    for (const node of this.nodes) if (node.target) node.pos = [...node.target]; // start already formed
    this.resize = this.resize.bind(this);
    addEventListener("resize", this.resize);
    this.resize();
  }

  resize() {
    const dpr = Math.min(MAX_DPR, devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
  }

  /** Show a topic: the points fly into its shape and the lines draw themselves in. */
  setTopic(topic, force = false) {
    const next = SHAPES[topic] ? topic : "general";
    const changed = force || next !== this.topic || this.mode !== "shape";
    this.topic = next;
    if (this.effect) return; // remembered: the effect hands back to it when it ends
    this.mode = "shape";
    if (!changed) return;
    this.shape = buildShape(next);
    this.assign();
    this.draw = 0;
    this.drawTime = 1.3;
  }

  /** Thinking: the points let go of their shape and drift, linking and unlinking as they search. */
  setThinking(on) {
    this.thinking = on;
    if (this.effect) return;
    if (on) {
      this.drift();
    } else if (this.mode === "drift") {
      this.setTopic(this.topic, true);
    }
  }

  drift() {
    this.mode = "drift";
    for (const node of this.nodes) node.home = randomInShell(0.42, 0.9);
  }

  /** Where the user's hand is, in -1..1 (y up), or null when it leaves. */
  setHand(point) {
    this.handTarget = point;
  }

  /** True while a gesture shape is playing. */
  get busy() {
    return this.effect !== null;
  }

  /**
   * Play a gesture shape, then go back to the topic (or to drifting, if Nelle is thinking).
   *   from: "centre" (points unfold outward), "dust" (they stream up from the plasma dust) or null
   *   drawTime: seconds for the groups to appear one after another
   *   hold: seconds to hold the finished shape
   *   glow: brightness boost while it plays
   *   scatter: true to burst the points back into the dust before returning
   * Returns false (and does nothing) if a gesture shape is already playing.
   */
  play(name, { from = null, drawTime = 1.2, hold = 2.5, glow = 1, scatter = false } = {}) {
    if (this.effect) return false;
    const calm = this.reducedMotion;
    this.effect = {
      start: this.time,
      drawTime: calm ? Math.min(drawTime, 0.6) : drawTime,
      hold: calm ? Math.min(hold, 1.6) : hold,
      glow: calm ? Math.min(glow, 1.2) : glow,
      scatter: scatter && !calm,
      phase: "in",
    };
    this.mode = "shape";
    this.shape = buildGestureShape(name);
    this.assign(this.effect.drawTime);
    this.draw = 0;
    this.drawTime = this.effect.drawTime;
    if (!calm && from) {
      for (const node of this.nodes) {
        if (!node.target) continue;
        node.pos = from === "centre" ? randomInBall(0.08) : dustPoint();
      }
    }
    return true;
  }

  /** Seconds after an effect starts that a group (petal, letter) sets off. */
  groupDelay(group) {
    return (group / Math.max(1, this.groupCount)) * (this.stagger ?? 0);
  }

  /** Move a playing effect along: hold, maybe scatter, then hand back. */
  advanceEffect() {
    const e = this.effect;
    if (!e) return;
    const age = this.time - e.start;
    const shown = e.drawTime + e.hold;
    if (e.phase === "in" && age >= shown) {
      if (e.scatter) {
        e.phase = "out";
        this.mode = "drift";
        for (const node of this.nodes) node.home = dustPoint();
      } else {
        this.finishEffect();
      }
    } else if (e.phase === "out" && age >= shown + 0.8) {
      this.finishEffect();
    }
  }

  finishEffect() {
    this.effect = null;
    if (this.thinking) this.drift();
    else this.setTopic(this.topic, true);
  }

  setSearching(on) {
    this.speed = on ? 1.9 : 1;
  }

  /**
   * Give every node a target: the shape's points first (in a shuffled order), the rest float free.
   * Grouped shapes (petals, letters) set off group by group across `stagger` seconds.
   */
  assign(stagger = 0) {
    const order = this.nodes.map((_, i) => i).sort(() => Math.random() - 0.5);
    const groups = this.shape.groups ?? [];
    this.groupCount = Math.max(1, ...groups.map((g) => g + 1));
    this.stagger = stagger;
    this.slot = new Array(this.shape.points.length);
    order.forEach((nodeIndex, k) => {
      const node = this.nodes[nodeIndex];
      const inShape = k < this.shape.points.length;
      node.target = inShape ? this.shape.points[k] : null;
      node.delay =
        stagger && this.groupCount > 1 && inShape ? this.groupDelay(groups[k] ?? 0) + Math.random() * 0.04 : Math.random() * 0.35;
      if (inShape) this.slot[k] = nodeIndex;
    });
    this.edges = this.shape.edges.map(([a, b]) => [this.slot[a], this.slot[b], groups[a] ?? 0]);
    this.assignedAt = this.time;
  }

  /** Called once per frame. `ball` is { x, y, radius } in CSS pixels; `color` is rgb 0..1. */
  render(dt, ball, color, voice) {
    this.time += dt;
    const t = this.time;
    const motion = this.reducedMotion ? 0.25 : 1;
    this.alpha = ease(this.alpha, 1, 1.2, dt);
    this.draw = Math.min(1, this.draw + dt / this.drawTime);
    this.advanceEffect();
    this.glow = ease(this.glow, this.effect?.phase === "in" ? this.effect.glow : 1, 3, dt);

    // turning: the network globe spins; topic shapes sway so they read as 3D without going edge-on;
    // gesture shapes face you almost square on so a word or a face reads at a glance
    const facing = this.effect ? 0.25 : 1;
    if (this.mode === "drift" || (this.topic === "general" && !this.effect)) {
      this.yaw += dt * (this.mode === "drift" ? 0.45 * this.speed : 0.22) * motion;
      this.pitch = ease(this.pitch, 0.32, 1, dt);
    } else {
      const goal = Math.sin(t * 0.42) * 0.36 * motion * facing;
      const near = goal + TAU * Math.round((this.yaw - goal) / TAU);
      this.yaw = ease(this.yaw, near, this.effect ? 4 : 1.6, dt);
      this.pitch = ease(this.pitch, Math.sin(t * 0.29) * 0.14 * motion * facing, this.effect ? 4 : 1.6, dt);
    }

    const [hx, hy] = this.handTarget ?? [0, 0];
    const follow = this.handTarget ? 5 : 1.5; // snappy toward the hand, slow back to centre
    this.hand = [ease(this.hand[0], hx, follow, dt), ease(this.hand[1], hy, follow, dt)];

    this.moveNodes(dt, t, motion);
    const projected = this.project(ball, voice);
    this.spawnPulses(dt, voice);
    this.paint(projected, ball, color, voice);
  }

  moveNodes(dt, t, motion) {
    const drifting = this.mode === "drift";
    const wander = (drifting ? 0.22 : 0.06) * motion;
    for (const node of this.nodes) {
      let goal;
      if (!drifting && node.target && t - this.assignedAt > node.delay) {
        goal = node.target;
      } else {
        const s = this.speed * (drifting ? 1 : 0.5);
        goal = node.home.map((h, i) => h + Math.sin(t * node.freq[i] * s + node.phase[i]) * wander);
      }
      const rate = drifting ? 2.2 : node.target ? (this.effect ? 5.5 : 3.2) : 1;
      node.pos = node.pos.map((p, i) => ease(p, goal[i], rate, dt));
      node.lit = Math.max(0, node.lit - dt * 1.6);
    }
  }

  /** Rotate and project every node to screen pixels, with depth for size and brightness. */
  project(ball, voice) {
    // the hand turns the constellation toward itself and pulls it a little that way
    const [hx, hy] = this.hand;
    const turn = this.reducedMotion ? 0.4 : 1;
    const yaw = this.yaw + hx * 0.55 * turn;
    const pitch = this.pitch - hy * 0.4 * turn;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const scale = ball.radius * 0.62 * (1 + voice * 0.05);
    const shiftX = hx * ball.radius * 0.14 * turn;
    const shiftY = -hy * ball.radius * 0.1 * turn;
    return this.nodes.map((node) => {
      const [x, y, z] = node.pos;
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const perspective = 2.6 / (2.6 - z2);
      return {
        x: ball.x + shiftX + x1 * scale * perspective,
        y: ball.y + shiftY - y2 * scale * perspective,
        depth: clamp01((z2 + 1) / 2),
      };
    });
  }

  /** Lines for this frame: the shape's edges, or links between drifting points that are close. */
  links(projected) {
    if (this.mode === "shape") {
      const total = this.edges.length;
      if (this.groupCount > 1 && this.effect) {
        // gesture shapes draw petal by petal (letter by letter): each group's lines draw in once its
        // points have nearly arrived, so lines never stretch between points still in flight
        const age = this.time - this.assignedAt;
        return this.edges.map(([a, b, group]) => {
          const arrived = this.groupDelay(group) + ARRIVE_SECONDS;
          return { a, b, grow: clamp01((age - arrived) / LINE_SECONDS), strength: 1 };
        });
      }
      return this.edges.map(([a, b], i) => {
        const start = (i / Math.max(1, total)) * 0.55;
        const grow = clamp01((this.draw - start) / 0.45);
        return { a, b, grow, strength: 1 };
      });
    }
    if (this.effect?.phase === "out") return []; // scattering back into the dust: no links
    const out = [];
    for (let a = 0; a < NODES; a++) {
      for (let b = a + 1; b < NODES; b++) {
        const p = this.nodes[a].pos;
        const q = this.nodes[b].pos;
        const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        if (d < LINK_DISTANCE) out.push({ a, b, grow: 1, strength: 1 - d / LINK_DISTANCE });
      }
    }
    return out;
  }

  spawnPulses(dt, voice) {
    this.pulses = this.pulses.filter((pulse) => this.time - pulse.start < pulse.duration);
    if (this.reducedMotion || this.time < this.nextPulse) return;
    const edges = this.lastLinks?.filter((link) => link.grow >= 1) ?? [];
    if (!edges.length) return;
    const busy = this.mode === "drift" ? 0.12 / this.speed : 0.9 - voice * 0.7;
    this.nextPulse = this.time + rand(busy * 0.6, busy * 1.4);
    const link = edges[(Math.random() * edges.length) | 0];
    const forward = Math.random() < 0.5;
    this.pulses.push({
      from: forward ? link.a : link.b,
      to: forward ? link.b : link.a,
      start: this.time,
      duration: rand(0.35, 0.7),
    });
  }

  paint(projected, ball, color, voice) {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    const light = color.map((c) => c + (1 - c) * 0.62);
    const tone = (a) => `rgba(${(light[0] * 255) | 0},${(light[1] * 255) | 0},${(light[2] * 255) | 0},${a})`;
    const unit = Math.max(0.6, ball.radius / 260); // line widths and dot sizes follow the ball
    const shine = this.alpha * (0.85 + voice * 0.4) * this.glow;

    const links = this.links(projected);
    this.lastLinks = links;
    // two passes: a wide soft glow, then the fine line itself; bucketed by brightness to batch strokes
    for (const [width, alpha] of [[4, 0.1], [1.15, 0.66]]) {
      for (const band of [0.35, 0.7, 1]) {
        ctx.beginPath();
        for (const link of links) {
          const level = link.strength * (0.45 + 0.55 * (projected[link.a].depth + projected[link.b].depth) / 2);
          if (level > band || level <= band - 0.35) continue;
          const p = projected[link.a];
          const q = projected[link.b];
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + (q.x - p.x) * link.grow, p.y + (q.y - p.y) * link.grow);
        }
        ctx.lineWidth = width * unit;
        ctx.strokeStyle = tone(alpha * band * shine);
        ctx.stroke();
      }
    }

    // points of light: brighter and larger when nearer, small and faint when floating free
    for (const [i, p] of projected.entries()) {
      const node = this.nodes[i];
      const inShape = this.mode === "drift" || node.target;
      const size = unit * (inShape ? 1.5 + p.depth * 1.3 : 0.9) * (1 + node.lit * 1.5);
      const alpha = shine * (inShape ? 0.35 + 0.6 * p.depth : 0.18) + node.lit * 0.6;
      ctx.fillStyle = tone(alpha * 0.18);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = tone(alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, TAU);
      ctx.fill();
    }

    // pulses: sparks of thought running along the lines
    for (const pulse of this.pulses) {
      const k = (this.time - pulse.start) / pulse.duration;
      const p = projected[pulse.from];
      const q = projected[pulse.to];
      const x = p.x + (q.x - p.x) * k;
      const y = p.y + (q.y - p.y) * k;
      if (k > 0.92) this.nodes[pulse.to].lit = 1;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, unit * 5);
      glow.addColorStop(0, `rgba(255,255,255,${0.9 * shine})`);
      glow.addColorStop(0.3, tone(0.45 * shine));
      glow.addColorStop(1, tone(0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, unit * 5, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
}

/** A random point between two radii, so drifting points spread through the ball instead of bunching. */
function randomInShell(inner, outer) {
  const p = randomInBall(1);
  const length = Math.hypot(...p) || 1;
  const r = inner + (outer - inner) * Math.random();
  return p.map((v) => (v / length) * r);
}

/** A point down in the plasma dust, which settles in the lower part of the ball. */
function dustPoint() {
  const p = randomInBall(0.9);
  return [p[0], -Math.abs(p[1]) * 0.8 - 0.25, p[2]];
}

function randomInBall(radius) {
  for (;;) {
    const p = [rand(-1, 1), rand(-1, 1), rand(-1, 1)];
    if (p[0] ** 2 + p[1] ** 2 + p[2] ** 2 <= 1) return p.map((v) => v * radius);
  }
}
