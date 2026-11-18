// Hand scroller tests: fingertip pixels become smooth scrolling. Run with:  node --test "tests/js/*.test.mjs"
import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.document ??= { body: { classList: { toggle() {} } } };
const { HandScroller } = await import("../../nelle2/web/handscroll.js");

const fakeLog = (height = 2000, view = 400) => ({ scrollTop: 0, scrollHeight: height, clientHeight: view });
const fakeCue = () => ({ dataset: {} });
const run = (scroller, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) scroller.tick(1 / 60);
};

test("the scroll follows the fingertips one to one, smoothed over a couple of frames", () => {
  const log = fakeLog();
  const scroller = new HandScroller(log, fakeCue());
  scroller.update({ dy: 120, vy: 0 });
  scroller.tick(1 / 60);
  assert.ok(log.scrollTop > 30 && log.scrollTop < 120, `first frame ${log.scrollTop}`);
  run(scroller, 0.3);
  assert.ok(Math.abs(log.scrollTop - 120) <= 1, `settled at ${log.scrollTop}`);
});

test("it stops the moment the fingers stop", () => {
  const log = fakeLog();
  const scroller = new HandScroller(log, fakeCue());
  scroller.update({ dy: 80, vy: 2400 });
  run(scroller, 0.2);
  scroller.update({ dy: 0, vy: 0 }); // fingers still, three fingers still up
  const at = log.scrollTop;
  run(scroller, 0.5);
  assert.ok(log.scrollTop - at <= 1, `kept going ${log.scrollTop - at} px`);
});

test("letting go after a flick glides on a little; letting go when still doesn't", () => {
  const flick = fakeLog();
  const a = new HandScroller(flick, fakeCue());
  a.update({ dy: 0, vy: 1500 });
  a.update(null);
  run(a, 1);
  assert.ok(flick.scrollTop > 200 && flick.scrollTop < 500, `glided ${flick.scrollTop}`);

  const still = fakeLog();
  const b = new HandScroller(still, fakeCue());
  b.update({ dy: 0, vy: 10 });
  b.update(null);
  run(b, 1);
  assert.equal(still.scrollTop, 0);
});

test("scrolling up works and stops cleanly at the top and bottom", () => {
  const log = fakeLog(1000, 400);
  const cue = fakeCue();
  const scroller = new HandScroller(log, cue);
  scroller.update({ dy: 5000, vy: 0 });
  run(scroller, 0.5);
  assert.equal(log.scrollTop, 600);
  scroller.update({ dy: -50, vy: 0 });
  scroller.tick(1 / 60);
  assert.equal(cue.dataset.dir, "up");
  run(scroller, 0.5);
  assert.ok(Math.abs(log.scrollTop - 550) <= 1, `at ${log.scrollTop}`);
  scroller.update({ dy: -9000, vy: 0 });
  run(scroller, 0.5);
  assert.equal(log.scrollTop, 0);
});
