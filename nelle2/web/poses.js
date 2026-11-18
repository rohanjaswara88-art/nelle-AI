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

// Hysteresis: a finger that was extended last frame stays extended until it clearly folds (and the
// other way round), so a finger near a threshold doesn't flicker and break a gesture's streak.
export const HYSTERESIS = 0.6; // fraction of the unsure band a finger may slip back without changing

function classify(ratio, extended, folded, previous) {
  const give = (extended - folded) * HYSTERESIS;
  if (previous === "extended" && ratio > extended - give) return "extended";
  if (previous === "folded" && ratio < folded + give) return "folded";
  if (ratio >= extended) return "extended";
  if (ratio <= folded) return "folded";
  return "unsure";
}

/**
 * Each finger's state: "extended", "folded" or "unsure". Pass last frame's states as `previous`
 * for hysteresis. Works on image landmarks (with the frame aspect) or on MediaPipe's 3D world
 * landmarks (aspect 1), which hold up much better when the hand is tilted toward the camera.
 */
export function fingerStates(hand, aspect = DEFAULT_ASPECT, previous = null) {
  const wrist = hand[WRIST];
  const states = {};
  for (const [name, f] of Object.entries(FINGERS)) {
    const ratio = distance(hand[f.tip], wrist, aspect) / Math.max(1e-6, distance(hand[f.pip], wrist, aspect));
    states[name] = classify(ratio, EXTENDED_RATIO, FOLDED_RATIO, previous?.[name]);
  }
  const knuckle = hand[FINGERS.index.mcp];
  const thumbRatio =
    distance(hand[THUMB.tip], knuckle, aspect) / Math.max(1e-6, distance(hand[THUMB.ip], knuckle, aspect));
  states.thumb = classify(thumbRatio, THUMB_EXTENDED_RATIO, THUMB_FOLDED_RATIO, previous?.thumb);
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

/**
 * Pointing: index extended, middle, ring and pinky folded, thumb anything. Not a one-shot gesture:
 * while it holds, the fingertip moves the hand cursor and the thumb is its button.
 */
export function isPoint(hand, states = fingerStates(hand)) {
  return (
    states.index === "extended" &&
    states.middle === "folded" &&
    states.ring === "folded" &&
    states.pinky === "folded"
  );
}

/**
 * Three: index, middle and ring extended, pinky folded, thumb anything. Not a one-shot gesture:
 * while it holds, moving the hand up and down scrolls the conversation.
 */
export function isThree(hand, states = fingerStates(hand)) {
  return (
    states.index === "extended" &&
    states.middle === "extended" &&
    states.ring === "extended" &&
    states.pinky === "folded"
  );
}

// ---------- the hand mouse: the thumb is the button, the OK sign zooms ----------

// The thumb counts as pressed when its tip is within this many hand lengths of the pointing
// finger's lower half (knuckle to middle joint), released beyond the second; in between it keeps
// its last state, so a click never flickers.
export const TAP_PRESS = 0.2;
export const TAP_RELEASE = 0.3;
// OK sign: thumb and index tips within this many hand lengths, with middle, ring and pinky up.
export const OK_TOUCH = 0.3;

function segmentDistance(p, a, b, aspect) {
  const ax = a.x * aspect, ay = a.y, az = (a.z ?? 0) * aspect;
  const dx = b.x * aspect - ax, dy = b.y - ay, dz = (b.z ?? 0) * aspect - az;
  const px = p.x * aspect - ax, py = p.y - ay, pz = (p.z ?? 0) * aspect - az;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / Math.max(1e-9, dx * dx + dy * dy + dz * dz)));
  return Math.hypot(px - t * dx, py - t * dy, pz - t * dz);
}

/** How far the thumb tip is from the side of the pointing finger, in hand lengths. */
export function thumbTap(hand, aspect = DEFAULT_ASPECT) {
  const size = Math.max(0.02, handLength(hand, aspect));
  return segmentDistance(hand[THUMB.tip], hand[FINGERS.index.mcp], hand[FINGERS.index.pip], aspect) / size;
}

/**
 * The thumb as a mouse button: "down" when it lies against the pointing finger (or is clearly
 * folded), "up" when it sticks out like a finger gun's hammer, otherwise the previous state.
 */
export function thumbButton(hand, states, previous = "up", aspect = DEFAULT_ASPECT) {
  const tap = thumbTap(hand, aspect);
  if (tap < TAP_PRESS || states.thumb === "folded") return "down";
  if (tap > TAP_RELEASE && states.thumb === "extended") return "up";
  return previous;
}

/** OK sign 👌: thumb and index tips touching, middle, ring and pinky up. Moving it up or down zooms. */
export function isOk(hand, states = fingerStates(hand), aspect = DEFAULT_ASPECT) {
  if (!["middle", "ring", "pinky"].every((name) => states[name] === "extended")) return false;
  if (states.index === "extended") return false;
  const size = Math.max(0.02, handLength(hand, aspect));
  return distance(hand[THUMB.tip], hand[FINGERS.index.tip], aspect) / size < OK_TOUCH;
}

/** The index fingertip, the point that leads while pointing. */
export function indexTip(hand) {
  const tip = hand[FINGERS.index.tip];
  return { x: tip.x, y: tip.y };
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

export const HOLD_FRAMES = 4; // the same pose this many detection frames (~130 ms at 30 fps)
export const GAP_FRAMES = 1; // an unclear frame or two in the middle doesn't restart the count
export const RELEASE_FRAMES = 5; // gone this many frames counts as let go
export const MIN_CONFIDENCE = 0.7;
export const COOLDOWN_MS = 2500;

/**
 * Feed it one detected pose per detection frame; it answers with a gesture name the moment one
 * should fire, otherwise null. A gesture fires once per showing: hold it again after letting go
 * (and after the cooldown) to fire it again.
 */
export class PoseGate {
  constructor({
    hold = HOLD_FRAMES,
    gap = GAP_FRAMES,
    release = RELEASE_FRAMES,
    confidence = MIN_CONFIDENCE,
    cooldown = COOLDOWN_MS,
  } = {}) {
    this.hold = hold;
    this.gap = gap;
    this.release = release;
    this.confidence = confidence;
    this.cooldown = cooldown;
    this.reset();
  }

  reset() {
    this.candidate = null;
    this.streak = 0;
    this.gapFrames = 0;
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

    if (seen && seen === this.candidate) {
      this.streak += 1;
      this.gapFrames = 0;
    } else if (!seen && this.candidate && this.gapFrames < this.gap) {
      this.gapFrames += 1; // a blink of an unclear frame: hold the count, don't add to it
    } else {
      this.candidate = seen;
      this.streak = seen ? 1 : 0;
      this.gapFrames = 0;
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

export const SMOOTHING = 0.35; // exponential filter weight for each new position
export const DEAD_ZONE = 0.012; // in frame units: smaller wobbles are ignored
// The fingertip is followed more tightly than a palm would be, so it feels immediate.
export const FINGER_SMOOTHING = 0.55;
export const FINGER_DEAD_ZONE = 0.007;
export const WAVE_SPEED = 0.9; // frame widths per second before a direction counts for a wave
export const WAVE_WINDOW_MS = 1200;
export const WAVE_TURNS = 2;
export const WAVE_COOLDOWN_MS = 1500;

/**
 * Smooths the palm centre and reports position and velocity. Small jitter inside the dead zone
 * leaves the position still. Also spots a wave: the hand changing direction quickly twice or more.
 */
export class MotionFilter {
  constructor({ smoothing = SMOOTHING, deadZone = DEAD_ZONE } = {}) {
    this.smoothing = smoothing;
    this.deadZone = deadZone;
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
      x: this.smooth.x + (point.x - this.smooth.x) * this.smoothing,
      y: this.smooth.y + (point.y - this.smooth.y) * this.smoothing,
    };
    const moved = Math.hypot(this.smooth.x - this.anchor.x, this.smooth.y - this.anchor.y) > this.deadZone;
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

// ---------- three-finger scrolling: the fingertips drive it, like a mouse ----------

/** The point that scrolls: the average of the index, middle and ring fingertips (x, y and depth z). */
export function scrollPoint(hand) {
  const tips = [FINGERS.index.tip, FINGERS.middle.tip, FINGERS.ring.tip];
  const mean = (key) => tips.reduce((sum, i) => sum + (hand[i][key] ?? 0), 0) / tips.length;
  return { x: mean("x"), y: mean("y"), z: mean("z") };
}

const SCROLL_KNUCKLES = [FINGERS.index.mcp, FINGERS.middle.mcp, FINGERS.ring.mcp];

/** The middle of the three scrolling fingers' knuckles: the hand's own position for scrolling. */
export function scrollKnuckles(hand) {
  const mean = (key) => SCROLL_KNUCKLES.reduce((sum, i) => sum + (hand[i][key] ?? 0), 0) / SCROLL_KNUCKLES.length;
  return { x: mean("x"), y: mean("y"), z: mean("z") };
}

/**
 * Where the fingers point, in hand lengths, measured from their knuckles: it grows as the fingertips
 * go down in the picture or tip toward the camera. Tipping the fingers forward at the knuckles
 * mostly changes their depth, not their height in the picture, so depth counts too; that is what
 * lets a finger-only tilt scroll. Being relative to the knuckles and divided by the hand's size,
 * leaning in or out doesn't change it.
 */
export function fingerReach(hand, aspect = DEFAULT_ASPECT, size = handLength(hand, aspect)) {
  const tip = scrollPoint(hand);
  const base = scrollKnuckles(hand);
  const down = tip.y - base.y;
  const toward = -(tip.z - base.z) * aspect; // MediaPipe z: smaller is closer
  return (down + toward) / Math.max(0.02, size);
}

/**
 * The 1€ filter (Casiez et al., 2012): heavy smoothing when still, almost none when moving fast.
 * Kills fingertip jitter without the lag of a plain average. Time is in seconds.
 */
export class OneEuroFilter {
  constructor({ minCutoff = 1, beta = 0, dCutoff = 1 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.value = null;
    this.speed = 0;
    this.time = null;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value, time) {
    if (this.value === null) {
      this.value = value;
      this.time = time;
      return value;
    }
    const dt = Math.max(1e-3, time - this.time);
    this.time = time;
    const rawSpeed = (value - this.value) / dt;
    this.speed += (rawSpeed - this.speed) * OneEuroFilter.alpha(this.dCutoff, dt);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.speed);
    this.value += (value - this.value) * OneEuroFilter.alpha(cutoff, dt);
    return this.value;
  }
}

// Fingertips moving one hand length (wrist to middle knuckle) scroll this many pixels. Tilting the
// three fingers at the knuckles moves the tips about half a hand length, so a small finger tilt
// is a few hundred pixels, and the hand itself never has to move.
export const SCROLL_PX_PER_HAND = 1100;
export const SCROLL_ACCEL = 1.5; // quick flicks go up to (1 + this) times further, like a mouse
export const SCROLL_ACCEL_SPEED = 3; // hand lengths per second at which the extra is full
export const SCROLL_BACKLASH = 0.01; // hand lengths: wobble smaller than this never scrolls
export const SCROLL_GAP_MS = 200; // after a longer gap, start again from where the fingers are

/**
 * Turns fingertip movement into scroll pixels, mouse style: a direct position-to-distance mapping
 * (not speed-to-speed), measured in hand lengths so it feels the same near or far from the camera.
 * update() returns { dy, vy }: pixels to scroll now (down is positive) and the smoothed speed in
 * pixels per second, or null without a hand.
 */
export class FingerScroll {
  constructor({ pxPerHand = SCROLL_PX_PER_HAND, accel = SCROLL_ACCEL } = {}) {
    this.pxPerHand = pxPerHand;
    this.accel = accel;
    this.filter = new OneEuroFilter({ minCutoff: 0.6, beta: 6, dCutoff: 1.5 });
    this.reset();
  }

  reset() {
    this.filter.reset();
    this.anchor = null;
    this.size = null;
    this.time = null;
    this.vy = 0;
    this.baseY = null;
    this.handTravel = 0;
  }

  update(hand, now, aspect = DEFAULT_ASPECT) {
    if (!hand) {
      this.reset();
      return null;
    }
    if (this.time !== null && now - this.time > SCROLL_GAP_MS) this.reset();
    const size = Math.max(0.02, handLength(hand, aspect));
    this.size = this.size === null ? size : this.size + (size - this.size) * 0.2;
    // two parts, both in hand lengths: the hand moving (the knuckles' own steps, so leaning in
    // doesn't add up) plus where the fingers point relative to their knuckles (a finger-only tilt)
    const baseY = scrollKnuckles(hand).y;
    this.handTravel = this.baseY === null ? 0 : this.handTravel + (baseY - this.baseY) / this.size;
    this.baseY = baseY;
    const y = this.filter.filter(this.handTravel + fingerReach(hand, aspect, size), now / 1000);
    if (this.anchor === null) {
      this.anchor = y;
      this.time = now;
      return { dy: 0, vy: 0 };
    }
    const dt = Math.max(1e-3, (now - this.time) / 1000);
    this.time = now;
    // backlash: the anchor trails the fingertips by up to SCROLL_BACKLASH, so jitter is absorbed
    // but every bit of real movement past it counts (no dead zone that eats slow scrolls)
    let moved = 0;
    if (y > this.anchor + SCROLL_BACKLASH) moved = y - SCROLL_BACKLASH - this.anchor;
    else if (y < this.anchor - SCROLL_BACKLASH) moved = y + SCROLL_BACKLASH - this.anchor;
    this.anchor += moved;
    const speed = Math.abs(moved) / dt;
    const gain = this.pxPerHand * (1 + this.accel * Math.min(1, speed / SCROLL_ACCEL_SPEED));
    const dy = moved * gain;
    this.vy += (dy / dt - this.vy) * 0.5;
    return { dy, vy: this.vy };
  }
}
