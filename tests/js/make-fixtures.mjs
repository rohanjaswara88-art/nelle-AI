// Builds MediaPipe-shaped hand landmark fixtures for the pose tests (tests/js/fixtures/hands.json).
//
// These are synthetic: 21 points laid out with real hand proportions, for both hands, rotated,
// near and far from the camera, with a little noise. Recordings from a real camera can be added
// to fixtures/recorded.json with the debug overlay (?debug=gestures, "Copy landmarks").
//
//   node tests/js/make-fixtures.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ASPECT = 4 / 3;

// a tiny seeded random so the fixtures are the same every run
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jitter = (amount) => (random() - 0.5) * 2 * amount;

const FINGERS = [
  // [name, knuckle x (towards the thumb is +), knuckle y, length scale, spread direction]
  ["index", 0.34, -0.95, 1.0, 1],
  ["middle", 0.11, -1.0, 1.08, 0.3],
  ["ring", -0.1, -0.95, 1.0, -0.6],
  ["pinky", -0.3, -0.84, 0.8, -1.4],
];

/**
 * Hand space: wrist at the origin, fingers pointing up (-y), the thumb on the +x side, z towards
 * the camera is negative, units are hand lengths. `pose` gives each finger's shape.
 */
function handSpace(pose, spread) {
  const p = new Array(21);
  p[0] = [0, 0, 0];
  for (const [i, [name, kx, ky, scale, side]] of FINGERS.entries()) {
    const base = 5 + i * 4;
    const mcp = [kx, ky, 0];
    const shape = pose[name];
    const angle = side * spread;
    const dir = [Math.sin(angle), -Math.cos(angle), 0];
    const seg = [0.42 * scale, 0.26 * scale, 0.21 * scale];
    let pip;
    let dip;
    let tip;
    if (shape === "extended") {
      pip = add(mcp, mul(dir, seg[0]));
      dip = add(pip, mul(dir, seg[1]));
      tip = add(dip, mul(dir, seg[2]));
    } else if (shape === "half") {
      // bent 90 degrees at the middle joint, pointing at the camera
      pip = add(mcp, mul(dir, seg[0]));
      dip = add(pip, [0, -0.02, -seg[1]]);
      tip = add(dip, [0, 0.02, -seg[2]]);
    } else {
      // folded into a fist: the tip tucks back under the knuckle
      pip = add(mcp, [0, -0.22 * scale, -0.25 * scale]);
      dip = add(pip, [0, 0.18 * scale, -0.12 * scale]);
      tip = add(mcp, [0, 0.16 * scale, -0.12 * scale]);
    }
    p[base] = mcp;
    p[base + 1] = pip;
    p[base + 2] = dip;
    p[base + 3] = tip;
  }
  const cmc = [0.22, -0.22, 0];
  const mcp = [0.46, -0.38, -0.02];
  let ip;
  let tip;
  if (pose.thumb === "out") {
    const dir = norm([1, -0.45, 0]);
    ip = add(mcp, mul(dir, 0.3));
    tip = add(ip, mul(dir, 0.26));
  } else if (pose.thumb === "along") {
    // along the knuckle line and up past the index: the thumb of a thumbs up, before rotating
    const dir = norm([1, -0.3, 0]);
    ip = add(mcp, mul(dir, 0.3));
    tip = add(ip, mul(dir, 0.26));
  } else {
    // folded across the palm, tip resting near the index knuckle
    ip = add(mcp, [-0.05, -0.2, -0.08]);
    tip = [0.24, -0.78, -0.1];
  }
  p[1] = cmc;
  p[2] = mcp;
  p[3] = ip;
  p[4] = tip;
  return p;
}

/** Place a hand-space hand in the video frame: rotation (radians), size, centre, mirror for left/right. */
function toFrame(points, { rotate = 0, size = 0.2, at = [0.5, 0.65], left = false, noise = 0.003 }) {
  const c = Math.cos(rotate);
  const s = Math.sin(rotate);
  return points.map(([x, y, z]) => {
    const hx = left ? -x : x;
    const rx = hx * c - y * s;
    const ry = hx * s + y * c;
    return {
      x: round(at[0] + (rx * size) / ASPECT + jitter(noise)),
      y: round(at[1] + ry * size + jitter(noise)),
      z: round((z * size) / ASPECT + jitter(noise)),
    };
  });
}

const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, k) => a.map((v) => v * k);
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const round = (v) => Math.round(v * 10000) / 10000;

const ALL = (shape) => ({ index: shape, middle: shape, ring: shape, pinky: shape });
const POSES = {
  two: { thumb: "folded", index: "extended", middle: "extended", ring: "folded", pinky: "folded" },
  twoThumbOut: { thumb: "out", index: "extended", middle: "extended", ring: "folded", pinky: "folded" },
  five: { thumb: "out", ...ALL("extended") },
  fist: { thumb: "folded", ...ALL("folded") },
  three: { thumb: "folded", index: "extended", middle: "extended", ring: "extended", pinky: "folded" },
  one: { thumb: "folded", index: "extended", middle: "folded", ring: "folded", pinky: "folded" },
  oneThumbOut: { thumb: "out", index: "extended", middle: "folded", ring: "folded", pinky: "folded" },
  oneMiddleHalf: { thumb: "folded", index: "extended", middle: "half", ring: "folded", pinky: "folded" },
  twoRingHalf: { thumb: "folded", index: "extended", middle: "extended", ring: "half", pinky: "folded" },
  twoMiddleHalf: { thumb: "folded", index: "extended", middle: "half", ring: "folded", pinky: "folded" },
  four: { thumb: "folded", ...ALL("extended") },
  fiveThumbIn: { thumb: "folded", ...ALL("extended") },
  thumbsUp: { thumb: "along", ...ALL("folded") },
  thumbsUpIndexOut: { thumb: "along", index: "extended", middle: "folded", ring: "folded", pinky: "folded" },
  rock: { thumb: "folded", index: "extended", middle: "folded", ring: "folded", pinky: "extended" },
};

const VIEWS = [
  { name: "right", left: false, rotate: 0, size: 0.2 },
  { name: "left", left: true, rotate: 0, size: 0.2 },
  { name: "right-tilted", left: false, rotate: 0.3, size: 0.22 },
  { name: "left-tilted", left: true, rotate: -0.3, size: 0.18 },
  { name: "far", left: false, rotate: -0.1, size: 0.12, at: [0.3, 0.55] },
  { name: "near", left: true, rotate: 0.12, size: 0.3, at: [0.6, 0.7] },
];

function build(poseName, spread, view, thumbsUp = false) {
  const points = handSpace(POSES[poseName], spread);
  // thumbs up: the fist turns sideways so the thumb (hand-space +x) points up the screen
  const rotate = thumbsUp ? (view.left ? Math.PI / 2 : -Math.PI / 2) + view.rotate * 0.5 : view.rotate;
  return toFrame(points, { ...view, rotate });
}

const fixtures = [];
const add_ = (expect, pose, spread, { thumbsUp = false, label = pose } = {}) => {
  for (const view of VIEWS) {
    fixtures.push({ name: `${label}/${view.name}`, expect, landmarks: build(pose, spread, view, thumbsUp) });
  }
};

// positives
add_("two", "two", 0.14);
add_("two", "twoThumbOut", 0.14);
add_("five", "five", 0.2);
add_("thumbsUp", "thumbsUp", 0.03, { thumbsUp: true });
// near misses
add_(null, "five", -0.05, { label: "fiveTogether" }); // all out but held together (fingers converge a little)
add_(null, "three", 0.12);
add_(null, "one", 0.1); // pointing: no one-shot gesture, it starts following instead
add_(null, "oneThumbOut", 0.1);
add_(null, "oneMiddleHalf", 0.1);
add_(null, "twoRingHalf", 0.14);
add_(null, "twoMiddleHalf", 0.14);
add_(null, "four", 0.18);
add_(null, "fist", 0.05);
add_(null, "rock", 0.15);
add_(null, "thumbsUpIndexOut", 0.03, { thumbsUp: true });
add_(null, "thumbsUp", 0.03, { label: "thumbSideways" }); // fist not turned: the thumb points sideways
for (const view of VIEWS) {
  // thumbs down: same fist turned the other way
  const points = handSpace(POSES.thumbsUp, 0.03);
  const rotate = view.left ? -Math.PI / 2 : Math.PI / 2;
  fixtures.push({ name: `thumbsDown/${view.name}`, expect: null, landmarks: toFrame(points, { ...view, rotate }) });
}

mkdirSync(join(here, "fixtures"), { recursive: true });
writeFileSync(join(here, "fixtures", "hands.json"), JSON.stringify(fixtures));
console.log(`wrote ${fixtures.length} hands`);
