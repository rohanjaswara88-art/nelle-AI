// Pose rule tests. Run with:  node --test tests/js/
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { MotionFilter, PoseGate, fingerStates, indexTip, isFive, isPoint, isThree, isThumbsUp, isTwo, palmCenter } from "../../nelle2/web/poses.js";
import { classifyPose } from "../../nelle2/web/gestures.js";
import { layoutText, GLYPHS } from "../../nelle2/web/strokefont.js";

const here = dirname(fileURLToPath(import.meta.url));
const load = (file) => {
  const path = join(here, "fixtures", file);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
};
const hands = [...load("hands.json"), ...load("recorded.json")];

test("fixtures cover every pose with positives and near misses", () => {
  for (const pose of ["two", "five", "thumbsUp"]) {
    assert.ok(hands.some((h) => h.expect === pose), `no positive fixture for ${pose}`);
  }
  assert.ok(hands.filter((h) => h.expect === null).length >= 30);
});

for (const hand of hands) {
  test(`${hand.name} -> ${hand.expect ?? "nothing"}`, () => {
    assert.equal(classifyPose(hand.landmarks), hand.expect, JSON.stringify(fingerStates(hand.landmarks)));
  });
}

test("each rule is strict on its own, not just by registry order", () => {
  for (const hand of hands) {
    assert.equal(isTwo(hand.landmarks), hand.expect === "two", hand.name);
    assert.equal(isFive(hand.landmarks), hand.expect === "five", hand.name);
    assert.equal(isThumbsUp(hand.landmarks), hand.expect === "thumbsUp", hand.name);
  }
});

test("pointing is the index alone, with the thumb either way", () => {
  const pointing = hands.filter((h) => /^(one|oneThumbOut)\//.test(h.name));
  assert.equal(pointing.length, 12);
  for (const hand of pointing) assert.equal(isPoint(hand.landmarks), true, hand.name);
  const others = hands.filter((h) => !/^(one|oneThumbOut|thumbsUpIndexOut)\//.test(h.name) && !h.name.startsWith("recorded/"));
  for (const hand of others) assert.equal(isPoint(hand.landmarks), false, hand.name);
});

test("the fingertip followed while pointing is landmark 8", () => {
  const hand = Array.from({ length: 21 }, (_, i) => ({ x: i / 100, y: i / 50, z: 0 }));
  assert.deepEqual(indexTip(hand), { x: 0.08, y: 0.16 });
});

test("palm centre is the mean of the wrist and four knuckles", () => {
  const hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, x] of [[0, 0.1], [5, 0.2], [9, 0.3], [13, 0.4], [17, 0.5]]) hand[i] = { x, y: x, z: 0 };
  assert.deepEqual(palmCenter(hand), { x: 0.3, y: 0.3 });
});

// ---------- the gate: debouncing, confidence, cooldown, release ----------

const frames = (gate, pose, count, { score = 0.9, start = 0, step = 33 } = {}) => {
  const fired = [];
  for (let i = 0; i < count; i++) {
    const name = gate.update(pose, score, start + i * step);
    if (name) fired.push([name, i]);
  }
  return fired;
};

test("a pose fires once, on its fourth frame in a row", () => {
  const gate = new PoseGate();
  assert.deepEqual(frames(gate, "two", 30), [["two", 3]]);
});

test("three frames is not enough", () => {
  const gate = new PoseGate();
  assert.deepEqual(frames(gate, "two", 3), []);
});

test("one unclear frame in the middle doesn't restart the count, two do", () => {
  const blink = new PoseGate();
  frames(blink, "two", 2);
  blink.update(null, 0.9, 70);
  assert.deepEqual(frames(blink, "two", 2, { start: 100 }), [["two", 1]]);

  const gap = new PoseGate();
  frames(gap, "two", 2);
  gap.update(null, 0.9, 70);
  gap.update(null, 0.9, 100);
  assert.deepEqual(frames(gap, "two", 3, { start: 133 }), []);
});

test("a different pose restarts the count at once", () => {
  const gate = new PoseGate();
  frames(gate, "two", 3);
  assert.deepEqual(frames(gate, "five", 3, { start: 100 }), []);
});

test("low confidence never fires", () => {
  const gate = new PoseGate();
  assert.deepEqual(frames(gate, "five", 20, { score: 0.69 }), []);
});

test("holding a pose does not refire, even after the cooldown", () => {
  const gate = new PoseGate();
  assert.equal(frames(gate, "five", 200).length, 1); // 6.6 s held
});

test("after letting go, it refires only once the cooldown has passed", () => {
  const gate = new PoseGate();
  frames(gate, "five", 4, { start: 0 }); // fires at ~100 ms
  frames(gate, null, 5, { start: 200 }); // released
  assert.deepEqual(frames(gate, "five", 10, { start: 400 }), [], "inside the 2.5 s cooldown");
  frames(gate, null, 5, { start: 800 });
  assert.deepEqual(frames(gate, "five", 4, { start: 3000 }), [["five", 3]]);
});

test("four frames away is not a release", () => {
  const gate = new PoseGate();
  frames(gate, "two", 4, { start: 0 });
  frames(gate, null, 4, { start: 200 });
  assert.deepEqual(frames(gate, "two", 10, { start: 3000 }), []);
});

test("different gestures have separate cooldowns", () => {
  const gate = new PoseGate();
  assert.deepEqual(frames(gate, "two", 4, { start: 0 }), [["two", 3]]);
  assert.deepEqual(frames(gate, "five", 4, { start: 300 }), [["five", 3]]);
});

// ---------- finger states: hysteresis and 3D world landmarks ----------

/** One finger bent so its tip sits at `ratio` times its PIP distance from the wrist. */
function handWithIndexRatio(ratio) {
  const hand = hands.find((h) => h.name === "fist/right").landmarks.map((p) => ({ ...p }));
  const wrist = hand[0];
  const pip = hand[6];
  const reach = Math.hypot(((pip.x - wrist.x) * 4) / 3, pip.y - wrist.y, ((pip.z - wrist.z) * 4) / 3) * ratio;
  hand[8] = { x: wrist.x, y: wrist.y - reach, z: wrist.z };
  return hand;
}

test("a finger near the threshold keeps its state instead of flickering", () => {
  const borderline = handWithIndexRatio(1.07); // inside the unsure band
  assert.equal(fingerStates(borderline).index, "unsure");
  assert.equal(fingerStates(borderline, 4 / 3, { index: "extended" }).index, "extended");
  assert.equal(fingerStates(borderline, 4 / 3, { index: "folded" }).index, "folded");
  // but a clear change still wins over the previous state
  assert.equal(fingerStates(handWithIndexRatio(0.8), 4 / 3, { index: "extended" }).index, "folded");
  assert.equal(fingerStates(handWithIndexRatio(1.3), 4 / 3, { index: "folded" }).index, "extended");
});

test("finger states read the same from world-style landmarks (no aspect stretch)", () => {
  for (const hand of hands.filter((h) => h.name.endsWith("/right"))) {
    // world landmarks: metres, centred on the hand, no 4:3 squash
    const world = hand.landmarks.map((p) => ({ x: ((p.x - 0.5) * 4) / 3 * 0.4, y: (p.y - 0.5) * 0.4, z: ((p.z * 4) / 3) * 0.4 }));
    assert.deepEqual(fingerStates(world, 1), fingerStates(hand.landmarks), hand.name);
  }
});

// ---------- three fingers: scrolling ----------

test("three fingers is recognised for scrolling, and is never a one-shot gesture", () => {
  const three = hands.filter((h) => h.name.startsWith("three/"));
  assert.equal(three.length, 6);
  for (const hand of three) {
    assert.equal(isThree(hand.landmarks), true, hand.name);
    assert.equal(classifyPose(hand.landmarks), null, hand.name);
  }
  const others = hands.filter((h) => !h.name.startsWith("three/") && !h.name.startsWith("recorded/"));
  for (const hand of others) assert.equal(isThree(hand.landmarks), false, hand.name);
});

// ---------- movement ----------

test("small jitter inside the dead zone does not move the hand", () => {
  const filter = new MotionFilter();
  let out;
  for (let i = 0; i < 30; i++) out = filter.update({ x: 0.5 + (i % 2 ? 0.004 : -0.004), y: 0.5 }, i * 33);
  assert.equal(out.x, 0.5 + -0.004);
  assert.ok(Math.abs(out.vx) < 1e-9);
});

test("a steady sweep gives a smooth velocity in the right direction", () => {
  const filter = new MotionFilter();
  let out;
  for (let i = 0; i < 20; i++) out = filter.update({ x: 0.2 + i * 0.02, y: 0.5 }, i * 33);
  assert.ok(out.vx > 0.3, `vx ${out.vx}`);
  assert.ok(Math.abs(out.vy) < 0.05);
});

test("a fast wave is spotted, a single swipe is not", () => {
  const swipe = new MotionFilter();
  let waved = false;
  for (let i = 0; i < 20; i++) waved ||= swipe.update({ x: 0.2 + i * 0.04, y: 0.5 }, i * 33).wave;
  assert.equal(waved, false);

  const wave = new MotionFilter();
  waved = false;
  for (let i = 0; i < 40; i++) {
    const x = 0.5 + 0.2 * Math.sin((i / 30) * Math.PI * 2 * 2.2); // 2.2 waves a second
    waved ||= wave.update({ x, y: 0.5 }, i * 33).wave;
  }
  assert.equal(waved, true);
});

test("a tighter filter follows a fingertip more closely", () => {
  const loose = new MotionFilter();
  const tight = new MotionFilter({ smoothing: 0.55, deadZone: 0.007 });
  let a;
  let b;
  for (let i = 0; i < 4; i++) {
    a = loose.update({ x: 0.3 + i * 0.05, y: 0.5 }, i * 33);
    b = tight.update({ x: 0.3 + i * 0.05, y: 0.5 }, i * 33);
  }
  assert.ok(b.x > a.x, `${b.x} should lead ${a.x}`);
});

test("losing the hand resets movement", () => {
  const filter = new MotionFilter();
  filter.update({ x: 0.2, y: 0.2 }, 0);
  assert.equal(filter.update(null, 33), null);
  assert.deepEqual(filter.update({ x: 0.8, y: 0.8 }, 66), { x: 0.8, y: 0.8, vx: 0, vy: 0, wave: false });
});

// ---------- stroke font ----------

test("HI BRO lays out centred and inside the requested box", () => {
  const { strokes, letters } = layoutText("HI BRO", { maxWidth: 1.8, maxHeight: 0.7 });
  const points = strokes.flat();
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  assert.ok(Math.max(...xs) <= 0.9001 && Math.min(...xs) >= -0.9001);
  assert.ok(Math.max(...ys) <= 0.3501 && Math.min(...ys) >= -0.3501);
  assert.ok(Math.abs(Math.max(...xs) + Math.min(...xs)) < 1e-9, "centred");
  assert.equal(Math.max(...letters), 4, "five letters");
});

test("every glyph stays on its grid", () => {
  for (const [char, strokes] of Object.entries(GLYPHS)) {
    for (const [x, y] of strokes.flat()) {
      assert.ok(x >= 0 && x <= 4.2 && y >= -0.5 && y <= 6, `${char} ${x},${y}`);
    }
  }
});
