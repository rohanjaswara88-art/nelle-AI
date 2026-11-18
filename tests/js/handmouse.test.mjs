// Hand mouse tests: the thumb as a mouse button, the cursor mapping and the OK sign.
// Run with:  node --test "tests/js/*.test.mjs"
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_BOX,
  ClickGate,
  DOUBLE_MS,
  DRAG_PX,
  LONG_PRESS_MS,
  cursorToScreen,
} from "../../nelle2/web/handmouse.js";
import { FINGERS, THUMB, fingerStates, isOk, isPoint, thumbButton, thumbTap } from "../../nelle2/web/poses.js";

const here = dirname(fileURLToPath(import.meta.url));
const hands = JSON.parse(readFileSync(join(here, "fixtures", "hands.json"), "utf8"));
const byName = (name) => hands.find((h) => h.name === name).landmarks;
const types = (events) => events.map((e) => e.type);

// ---------- the click gate ----------

function play(gate, steps) {
  const out = [];
  for (const [button, x, y, t] of steps) out.push(...gate.update(button, { x, y }, t));
  return out;
}

test("pointing with the thumb already down never clicks until the thumb has been up", () => {
  const gate = new ClickGate();
  const events = play(gate, [["down", 100, 100, 0], ["down", 100, 100, 33], ["down", 100, 100, 66]]);
  assert.deepEqual(events, []);
  assert.equal(gate.armed, false);
});

test("thumb down and up is a click where the press started", () => {
  const gate = new ClickGate();
  const events = play(gate, [["up", 100, 100, 0], ["down", 100, 100, 33], ["down", 104, 102, 66], ["up", 105, 103, 120]]);
  assert.deepEqual(types(events), ["press", "click"]);
  assert.deepEqual([events[1].x, events[1].y], [100, 100]);
});

test("two quick taps in the same place are a double-click", () => {
  const gate = new ClickGate();
  const events = play(gate, [
    ["up", 200, 200, 0],
    ["down", 200, 200, 30],
    ["up", 200, 200, 120],
    ["down", 203, 201, 220],
    ["up", 203, 201, 300],
  ]);
  assert.deepEqual(types(events), ["press", "click", "press", "click", "double"]);
});

test("two taps far apart in time are two single clicks", () => {
  const gate = new ClickGate();
  const events = play(gate, [
    ["up", 200, 200, 0],
    ["down", 200, 200, 30],
    ["up", 200, 200, 120],
    ["down", 200, 200, 120 + DOUBLE_MS + 100],
    ["up", 200, 200, 120 + DOUBLE_MS + 180],
  ]);
  assert.deepEqual(types(events), ["press", "click", "press", "click"]);
});

test("holding the thumb down and moving is a drag (text selection), not a click", () => {
  const gate = new ClickGate();
  const events = play(gate, [
    ["up", 100, 100, 0],
    ["down", 100, 100, 33],
    ["down", 100 + DRAG_PX + 5, 100, 66],
    ["down", 180, 120, 99],
    ["up", 180, 120, 133],
  ]);
  assert.deepEqual(types(events), ["press", "dragstart", "drag", "drag", "dragend"]);
  assert.deepEqual([events[1].x, events[1].y], [100, 100], "the drag starts where the press did");
});

test("holding the thumb down still is a right-click, even with no new camera frame", () => {
  const gate = new ClickGate();
  play(gate, [["up", 50, 60, 0], ["down", 50, 60, 33]]);
  assert.equal(gate.holdProgress(33 + LONG_PRESS_MS / 2), 0.5);
  const right = gate.tick({ x: 51, y: 60 }, 33 + LONG_PRESS_MS + 1);
  assert.deepEqual(types(right), ["right"]);
  assert.deepEqual(types(gate.update("up", { x: 51, y: 60 }, 33 + LONG_PRESS_MS + 50)), [], "no click after a right-click");
});

test("losing the hand mid-drag ends the drag; mid-click it is dropped", () => {
  const drag = new ClickGate();
  play(drag, [["up", 0, 0, 0], ["down", 0, 0, 33], ["down", 60, 0, 66]]);
  assert.deepEqual(types(drag.cancel({ x: 60, y: 0 })), ["dragend"]);
  const click = new ClickGate();
  play(click, [["up", 0, 0, 0], ["down", 0, 0, 33]]);
  assert.deepEqual(types(click.cancel({ x: 0, y: 0 })), ["cancel"]);
  assert.equal(click.armed, false, "after losing the hand the thumb must be lifted again");
});

// ---------- the cursor ----------

test("the middle of the camera frame maps to the whole window, clamped at the edges", () => {
  assert.deepEqual(cursorToScreen({ x: ACTIVE_BOX.left, y: ACTIVE_BOX.top }, 1001, 801), { x: 0, y: 0 });
  const corner = cursorToScreen({ x: ACTIVE_BOX.right, y: ACTIVE_BOX.bottom }, 1001, 801);
  assert.ok(Math.abs(corner.x - 1000) < 1e-9 && Math.abs(corner.y - 800) < 1e-9);
  assert.deepEqual(cursorToScreen({ x: 0, y: 1 }, 1001, 801), { x: 0, y: 800 });
  const mid = cursorToScreen({ x: (ACTIVE_BOX.left + ACTIVE_BOX.right) / 2, y: (ACTIVE_BOX.top + ACTIVE_BOX.bottom) / 2 }, 1001, 801);
  assert.ok(Math.abs(mid.x - 500) < 1e-9 && Math.abs(mid.y - 400) < 1e-9);
});

// ---------- the thumb as a button ----------

// A pointing hand with the thumb moved so its tip sits `gap` hand lengths out from the middle of the
// index finger's lower half, sideways: a finger gun with the hammer up (big gap) or down (small).
function fingerGun(gap) {
  const a = 4 / 3; // frame aspect: x is squashed in landmark units
  const hand = byName("oneThumbOut/right").map((p) => ({ ...p }));
  const knuckle = hand[FINGERS.index.mcp];
  const pip = hand[FINGERS.index.pip];
  const size = Math.hypot((hand[0].x - hand[9].x) * a, hand[0].y - hand[9].y, (hand[0].z - hand[9].z) * a);
  const mid = { x: (knuckle.x + pip.x) / 2, y: (knuckle.y + pip.y) / 2, z: (knuckle.z + pip.z) / 2 };
  // perpendicular to the finger in the picture, on the side away from the middle finger
  const dx = (pip.x - knuckle.x) * a;
  const dy = pip.y - knuckle.y;
  const len = Math.hypot(dx, dy);
  let px = -dy / len;
  let py = dx / len;
  const middle = hand[FINGERS.middle.mcp];
  if (px * (middle.x - knuckle.x) * a + py * (middle.y - knuckle.y) > 0) [px, py] = [-px, -py];
  const tip = { x: mid.x + (px * gap * size) / a, y: mid.y + py * gap * size, z: mid.z };
  hand[THUMB.tip] = tip;
  hand[THUMB.ip] = { x: (tip.x + hand[THUMB.mcp].x) / 2, y: (tip.y + hand[THUMB.mcp].y) / 2, z: mid.z };
  return hand;
}

test("the finger-gun hand really is pointing, with the thumb gap we asked for", () => {
  for (const gap of [0.1, 0.6]) {
    const hand = fingerGun(gap);
    assert.equal(isPoint(hand), true);
    assert.ok(Math.abs(thumbTap(hand) - gap) < 0.05, `tap ${thumbTap(hand)} for ${gap}`);
  }
});

test("thumb against the finger is down, thumb out is up, in between keeps its state", () => {
  const down = fingerGun(0.1);
  const up = fingerGun(0.6);
  assert.equal(thumbButton(down, { ...fingerStates(down), thumb: "unsure" }, "up"), "down");
  assert.equal(thumbButton(up, { ...fingerStates(up), thumb: "extended" }, "down"), "up");
  const between = fingerGun(0.25);
  const states = { ...fingerStates(between), thumb: "unsure" };
  assert.equal(thumbButton(between, states, "up"), "up");
  assert.equal(thumbButton(between, states, "down"), "down");
});

test("a folded thumb counts as down", () => {
  const hand = byName("fist/right");
  assert.equal(thumbButton(hand, { ...fingerStates(hand), thumb: "folded" }, "up"), "down");
});

// ---------- OK sign ----------

// Five fingers with the index curled round so its tip meets the thumb tip.
function okSign() {
  const hand = byName("five/right").map((p) => ({ ...p }));
  const thumb = hand[THUMB.tip];
  const mcp = hand[FINGERS.index.mcp];
  hand[8] = { x: thumb.x + 0.004, y: thumb.y - 0.004, z: thumb.z };
  hand[7] = { x: (mcp.x + thumb.x) / 2, y: (mcp.y + thumb.y) / 2 - 0.03, z: thumb.z };
  hand[6] = { x: mcp.x + (thumb.x - mcp.x) * 0.25, y: mcp.y - 0.05, z: mcp.z };
  return hand;
}

test("the OK sign is recognised and no other fixture is one", () => {
  const ok = okSign();
  assert.equal(isOk(ok), true, JSON.stringify(fingerStates(ok)));
  for (const hand of hands) assert.equal(isOk(hand.landmarks), false, hand.name);
});
