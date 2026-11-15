// Hand pose rules, as pure functions so they can be tested in Node (tests/js/poses.test.js).
//
// Input is one hand from MediaPipe Hand Landmarker: 21 points {x, y, z}, x and y normalised to the
// video frame (0..1, y down), already mirrored so x grows to the user's right. z is depth on roughly
// the same scale as x. Points: 0 wrist; thumb 1-4 (CMC, MCP, IP, tip); index 5-8, middle 9-12,
// ring 13-16, pinky 17-20 (MCP, PIP, DIP, tip).

export const WRIST = 0;
export const THUMB = { cmc: 1, mcp: 2, ip: 3, tip: 4 };
export const FINGERS = {
  index: { mcp: 5, pip: 6, tip: 8 },
  middle: { mcp: 9, pip: 10, tip: 12 },
  ring: { mcp: 13, pip: 14, tip: 16 },
  pinky: { mcp: 17, pip: 18, tip: 20 },
};

// A finger is extended when its tip is this much farther from the wrist than its PIP joint,
// folded when the tip is no farther than the PIP. In between it is "unsure" and no pose that
// needs that finger will match, which keeps half-bent fingers from firing anything.
export const EXTENDED_RATIO = 1.12;
export const FOLDED_RATIO = 1.0;
// The thumb compares tip and IP joint distances from the index knuckle (works for either hand).
export const THUMB_EXTENDED_RATIO = 1.12;
export const THUMB_FOLDED_RATIO = 1.0;
// Five: index and pinky tips must be this many palm widths apart.
export const SPREAD_RATIO = 1.15;
// Thumbs up: the thumb tip must rise this far above its MCP joint, in hand lengths.
export const THUMB_RISE = 0.32;

/** Frame aspect (width / height) so distances aren't squashed: 640×480 video is 4:3. */
export const DEFAULT_ASPECT = 4 / 3;

export function distance(a, b, aspect = DEFAULT_ASPECT) {
  const dx = (a.x - b.x) * aspect;
  const dy = a.y - b.y;
  const dz = ((a.z ?? 0) - (b.z ?? 0)) * aspect;
  return Math.hypot(dx, dy, dz);
}

function classify(ratio, extended, folded) {
  if (ratio >= extended) return "extended";
  if (ratio <= folded) return "folded";
  return "unsure";
}

/** Each finger's state: "extended", "folded" or "unsure". */
export function fingerStates(hand, aspect = DEFAULT_ASPECT) {
  const wrist = hand[WRIST];
  const states = {};
  for (const [name, f] of Object.entries(FINGERS)) {
    const ratio = distance(hand[f.tip], wrist, aspect) / Math.max(1e-6, distance(hand[f.pip], wrist, aspect));
    states[name] = classify(ratio, EXTENDED_RATIO, FOLDED_RATIO);
  }
  const knuckle = hand[FINGERS.index.mcp];
  const thumbRatio =
    distance(hand[THUMB.tip], knuckle, aspect) / Math.max(1e-6, distance(hand[THUMB.ip], knuckle, aspect));
  states.thumb = classify(thumbRatio, THUMB_EXTENDED_RATIO, THUMB_FOLDED_RATIO);
  return states;
}

/** Hand length: wrist to middle knuckle. Used to make rules independent of distance to the camera. */
export function handLength(hand, aspect = DEFAULT_ASPECT) {
  return distance(hand[WRIST], hand[FINGERS.middle.mcp], aspect);
}

export function palmWidth(hand, aspect = DEFAULT_ASPECT) {
  return distance(hand[FINGERS.index.mcp], hand[FINGERS.pinky.mcp], aspect);
}

/** Palm centre: the average of the wrist and the four finger knuckles. */
export function palmCenter(hand) {
  const ids = [WRIST, 5, 9, 13, 17];
  const sum = ids.reduce((acc, i) => ({ x: acc.x + hand[i].x, y: acc.y + hand[i].y }), { x: 0, y: 0 });
  return { x: sum.x / ids.length, y: sum.y / ids.length };
}

// ---------- the poses ----------

/** Two: index and middle extended, ring and pinky folded, thumb anything. */
export function isTwo(hand, states = fingerStates(hand)) {
  return (
    states.index === "extended" &&
    states.middle === "extended" &&
    states.ring === "folded" &&
    states.pinky === "folded"
  );
}

/** Five: all five extended and spread (index and pinky tips farther apart than the palm is wide). */
export function isFive(hand, states = fingerStates(hand), aspect = DEFAULT_ASPECT) {
  const allOut = ["thumb", "index", "middle", "ring", "pinky"].every((name) => states[name] === "extended");
  if (!allOut) return false;
  const spread = distance(hand[FINGERS.index.tip], hand[FINGERS.pinky.tip], aspect);
  return spread > palmWidth(hand, aspect) * SPREAD_RATIO;
}

/** Thumbs up: thumb extended and pointing up, the other four folded. */
export function isThumbsUp(hand, states = fingerStates(hand), aspect = DEFAULT_ASPECT) {
  if (states.thumb !== "extended") return false;
  if (!["index", "middle", "ring", "pinky"].every((name) => states[name] === "folded")) return false;
  const tip = hand[THUMB.tip];
  const mcp = hand[THUMB.mcp];
  const rise = mcp.y - tip.y; // y grows downward
  const sideways = Math.abs(tip.x - mcp.x) * aspect;
  // well above its base, and more up than sideways
  return rise > THUMB_RISE * handLength(hand, aspect) && rise > sideways;
}

// ---------- turning noisy per-frame poses into single gesture events ----------

export const HOLD_FRAMES = 6; // the same pose this many detection frames in a row (~200 ms at 30 fps)
export const RELEASE_FRAMES = 5; // gone this many frames counts as let go
export const MIN_CONFIDENCE = 0.7;
export const COOLDOWN_MS = 2500;

/**
 * Feed it one detected pose per detection frame; it answers with a gesture name the moment one
 * should fire, otherwise null. A gesture fires once per showing: hold it again after letting go
 * (and after the cooldown) to fire it again.
 */
export class PoseGate {
  constructor({ hold = HOLD_FRAMES, release = RELEASE_FRAMES, confidence = MIN_CONFIDENCE, cooldown = COOLDOWN_MS } = {}) {
    this.hold = hold;
    this.release = release;
    this.confidence = confidence;
    this.cooldown = cooldown;
    this.reset();
  }

  reset() {
    this.candidate = null;
    this.streak = 0;
    this.lastFired = new Map(); // name -> time
    this.armed = new Map(); // name -> false while still being held after firing
    this.absent = new Map(); // name -> frames since last seen
  }

  /** `pose` is a gesture name or null; `score` is the hand's detection confidence. */
  update(pose, score, now) {
    const seen = score >= this.confidence ? pose : null;

    for (const name of this.armed.keys()) {
      if (name === seen) {
        this.absent.set(name, 0);
        continue;
      }
      const gone = (this.absent.get(name) ?? 0) + 1;
      this.absent.set(name, gone);
      if (gone >= this.release) this.armed.set(name, true);
    }

    if (seen !== this.candidate) {
      this.candidate = seen;
      this.streak = seen ? 1 : 0;
    } else if (seen) {
      this.streak += 1;
    }
    if (!seen || this.streak < this.hold) return null;
    if (this.armed.get(seen) === false) return null;
    if (now - (this.lastFired.get(seen) ?? -Infinity) < this.cooldown) return null;

    this.lastFired.set(seen, now);
    this.armed.set(seen, false);
    this.absent.set(seen, 0);
    return seen;
  }
}

// ---------- continuous hand movement ----------

export const SMOOTHING = 0.35; // exponential filter weight for each new palm position
export const DEAD_ZONE = 0.012; // in frame units: smaller wobbles are ignored
export const WAVE_SPEED = 0.9; // frame widths per second before a direction counts for a wave
export const WAVE_WINDOW_MS = 1200;
export const WAVE_TURNS = 2;
export const WAVE_COOLDOWN_MS = 1500;

/**
 * Smooths the palm centre and reports position and velocity. Small jitter inside the dead zone
 * leaves the position still. Also spots a wave: the hand changing direction quickly twice or more.
 */
export class MotionFilter {
  constructor() {
    this.reset();
  }

  reset() {
    this.smooth = null;
    this.anchor = null;
    this.vx = 0;
    this.vy = 0;
    this.time = null;
    this.direction = 0;
    this.turns = [];
    this.lastWave = -Infinity;
  }

  /** Returns { x, y, vx, vy, wave } or null when there is no hand. */
  update(point, now) {
    if (!point) {
      this.reset();
      return null;
    }
    if (!this.smooth) {
      this.smooth = { ...point };
      this.anchor = { ...point };
      this.time = now;
      return { x: point.x, y: point.y, vx: 0, vy: 0, wave: false };
    }
    const dt = Math.max(1e-3, (now - this.time) / 1000);
    this.time = now;
    this.smooth = {
      x: this.smooth.x + (point.x - this.smooth.x) * SMOOTHING,
      y: this.smooth.y + (point.y - this.smooth.y) * SMOOTHING,
    };
    const moved = Math.hypot(this.smooth.x - this.anchor.x, this.smooth.y - this.anchor.y) > DEAD_ZONE;
    const next = moved ? { ...this.smooth } : this.anchor;
    const vx = (next.x - this.anchor.x) / dt;
    const vy = (next.y - this.anchor.y) / dt;
    this.anchor = next;
    this.vx += (vx - this.vx) * 0.5;
    this.vy += (vy - this.vy) * 0.5;
    return { x: next.x, y: next.y, vx: this.vx, vy: this.vy, wave: this.checkWave(now) };
  }

  checkWave(now) {
    if (Math.abs(this.vx) > WAVE_SPEED) {
      const direction = Math.sign(this.vx);
      if (this.direction && direction !== this.direction) this.turns.push(now);
      this.direction = direction;
    }
    this.turns = this.turns.filter((t) => now - t <= WAVE_WINDOW_MS);
    if (this.turns.length >= WAVE_TURNS && now - this.lastWave > WAVE_COOLDOWN_MS) {
      this.lastWave = now;
      this.turns = [];
      return true;
    }
    return false;
  }
}
