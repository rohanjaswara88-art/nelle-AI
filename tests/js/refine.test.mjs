// Prompt suggestion helpers. Run with:  node --test "tests/js/*.test.mjs"
import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_CHARS, MIN_CHARS, nextIndex, shouldRefine } from "../../nelle2/web/refine.js";

test("drafts are sent for suggestions only when long enough, not too long and not already asked", () => {
  assert.equal(shouldRefine("hi", ""), false);
  assert.equal(shouldRefine("   ", ""), false);
  assert.equal(shouldRefine("x".repeat(MIN_CHARS), ""), true);
  assert.equal(shouldRefine("x".repeat(MAX_CHARS + 1), ""), false);
  assert.equal(shouldRefine("wat is recursion ", "wat is recursion"), false, "trailing space is the same draft");
  assert.equal(shouldRefine("wat is recursion?", "wat is recursion"), true);
});

test("Tab cycles forward through the suggestions and Shift+Tab backward, wrapping round", () => {
  assert.equal(nextIndex(-1, 3), 0);
  assert.equal(nextIndex(0, 3), 1);
  assert.equal(nextIndex(2, 3), 0);
  assert.equal(nextIndex(-1, 3, true), 2);
  assert.equal(nextIndex(0, 3, true), 2);
  assert.equal(nextIndex(0, 0), -1);
});
