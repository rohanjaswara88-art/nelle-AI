# Nelle AI: spec requirements vs code (hand-gesture spec, README, open markers)

Audit of branch `feat/hand-gestures` at commit 8b023a7 (local HEAD equals `origin/feat/hand-gestures`). Read-only. The only commands run were `node --test "tests/js/*.test.mjs"` (126 pass, 0 fail) and `python -m pytest -q` (96 passed). Sources are local file paths with line numbers; "PR #3" means `gh pr view 3` (open, base `feat/emotional-avatar`, head `feat/hand-gestures`).

## Q1. Which items in docs/prompts/hand-gestures.md are not implemented, not tested or not documented?

### Takeaway
Nearly all of the build work is done. What remains open:
- The manual real-camera checks (accuracy, false triggers, fps) were never done.
- The code has drifted from the spec in several values: a 4-frame hold instead of 6, detection on every frame instead of every other one, lime instead of pink, and a `move` event that follows the pointing fingertip instead of the palm centre.
- PR #3's description is stale and its image link is broken.
- The spec itself is untracked in git.

### Cited Findings

**Ground rules**
- DONE: the branch is `feat/hand-gestures` and PR #3 targets `feat/emotional-avatar` — `gh pr view 3` (baseRefName `feat/emotional-avatar`)
- DONE: no Python file changed against the base branch. `git diff feat/emotional-avatar..HEAD -- '*.py'` is empty, and the 24 changed files are all web, docs, tests or CI — `git diff --stat feat/emotional-avatar..HEAD`
- DONE: existing tests still pass (pytest 96 passed) — `tests/`
- DONE: tracking runs from the single loop through `stage.onFrame` with `tracker.tick(performance.now())` — `nelle2/web/app.js:65-66`. It pauses while the tab is hidden — `nelle2/web/gestures.js:267` (`if (!this.running || document.hidden) return;`) and resets on return — `gestures.js:133-136`
- DONE: frames stay in the browser. Frames go only into `detectForVideo` — `gestures.js:277`, and the comment says the same — `gestures.js:1-5`
- DONE: commits use conventional prefixes (`feat:`, `fix:`, `docs:`) — `git log main..HEAD`
- NOTE: the spec file `docs/prompts/hand-gestures.md` is untracked (`?? docs/prompts/` in `git status`), so it is not in the repo or the PR

**Camera and tracking**
- DONE: MediaPipe tasks-vision is pinned to `@1.2.0` on jsDelivr — `gestures.js:25`. It uses `runningMode: "VIDEO"` and `numHands: 1` — `gestures.js:74-75`, with GPU first and a CPU fallback — `gestures.js:80-85`
- DONE: a Camera glass pill sits next to the Voice pill — `nelle2/web/index.html:38` (speak-toggle) and `index.html:42` (camera-toggle). It is off by default and remembered in localStorage `nelle.camera` — `app.js:381, 393, 421`
- PARTLY (deviates): `getUserMedia` uses `facingMode: "user"`, but 640×480 is only `ideal`, and the code adds `frameRate: { ideal: 60 }`, which the spec does not ask for — `gestures.js:210-219`
- DONE: a denied or missing camera shows a friendly toast and turns the button back off — `app.js:51-56, 391-396`. The CameraError codes are at `gestures.js:91-97, 220-230`
- PARTLY (deviates): the mirrored 160px preview with 21 points, its connections and click-to-hide is done — `gestures.js:28, 56-63, 129-132, 313-346`. But the points are drawn in lime `rgba(182,255,59,0.9)` and `#efffd6`, not the pink the spec asks for — `gestures.js:333, 340`. The README documents lime — `README.md:37`
- NOT AS SPECIFIED: the spec says to detect on every other frame (about 30 fps). The code detects on every new camera frame and backs off to every second animation frame only when a detection takes more than 12 ms — `gestures.js:30-33, 269, 279`
- DONE: x is mirrored — `gestures.js:286`
- DONE: `nelle2/web/gestures.js` exports `GestureTracker` — `gestures.js:109`, and it emits `gesture` — `gestures.js:301` and `move` — `gestures.js:189`
- PARTLY (deviates): the spec's `move` is continuous palm-centre movement with x, y and velocity. In the code, `move` is the **index fingertip**, and it fires **only while pointing** (`isPoint`), null otherwise — `gestures.js:103-104, 182-190`. The palm centre is used only for scrolling — `gestures.js:200`. The README documents the pointing behaviour — `README.md:45-47`

**Gesture detection**
- DONE: a finger is extended when its tip is farther from the wrist than its PIP joint by a margin (ratio 1.12), with an "unsure" band — `nelle2/web/poses.js:17-24, 58-64`. The thumb compares the tip and IP distances from the index MCP — `poses.js:65-68`. Hysteresis is extra — `poses.js:40-51`
- NOT AS SPECIFIED: the spec wants **6 frames in a row**. The code uses `HOLD_FRAMES = 4` and also tolerates one unclear frame (`GAP_FRAMES = 1`) — `poses.js:154-155`. The tests assert 4 frames: "a pose fires once, on its fourth frame in a row" — `tests/js/poses.test.mjs:70`. The README says "about four camera frames" — `README.md:53`
- PARTLY: the 0.7 confidence threshold is passed to MediaPipe as `minHandDetectionConfidence` and `minHandPresenceConfidence` — `gestures.js:29, 76-77`. But the gate receives a hard-coded score, `hand ? 1 : 0`, so `PoseGate`'s own 0.7 check never sees a real score — `gestures.js:297-300`. The handedness score is shown in the debug panel only — `gestures.js:288`
- DONE: a 2.5 s cooldown — `poses.js:158, 216`. Release after 5 frames — `poses.js:156, 194-202`
- DONE: `two` — `poses.js:90-98`, `five` with spread > 1.15 palm widths — `poses.js:100-106`, and `thumbsUp` with tip rise and the other four folded — `poses.js:140-150`
- DONE: the palm centre is the mean of the wrist and the four MCPs — `poses.js:81-86`. `MotionFilter` has exponential smoothing, a dead zone and wave detection — `poses.js:225-301`
- EXTRA (not in spec): `isPoint` (follow the fingertip) — `poses.js:108-119` and `isThree` (scroll the chat) — `poses.js:121-132`, plus `nelle2/web/handscroll.js`

**Animations**
- DONE: flower with 7 petals (`PETALS = 7`, within the spec's 6 to 8) around a centre ring, petal groups — `nelle2/web/constellation.js:222, 226-234`. It draws over 1.2 s from the centre, with surge and staggered arcs, and holds for `GESTURE_HOLD = 2.5` — `nelle2/web/stage.js:32, 207-217`
- DONE: smile with an outline, ^ ^ eyes and a smile arc — `constellation.js:235-243`. It adds a happy mood, one kick and a hold — `stage.js:219-228`
- PARTLY (deviates): "HI BRO" from a stroke font, streamed from the dust, then scattered — `stage.js:232-242`, `constellation.js:246-255` (fits `maxWidth: 2.25`), `nelle2/web/strokefont.js` (A–Z, 0–9). But the spec says **pink** particles, and the theme is now lime on black — `nelle2/web/styles.css:2-3`. A leftover comment still says "pink halo" — `constellation.js:626`
- PARTLY (deviates): hand movement drives `ball.push`, `ball.lean` and `ball.kick` scaled by velocity, and a wave triggers ripples — `stage.js:246-292`. But this only runs while pointing, because `move` comes from the pointing fingertip (see above). The spec asks for a plain `ball.kick(dx, dy, strength)` plus a lean on any hand movement. The code added new `push()` and `lean()` methods — `nelle2/web/crystal.js:6`
- DONE: shapes scale with the ball radius — `constellation.js:5-6, 532, 597, 665`. Reduced motion is handled — `stage.js:51`, `constellation.js:282, 385`. No stacking: `if (stage.gestureBusy) return;` — `app.js:363-366`, `stage.js:191`
- NOT VERIFIED: the "smooth and immediate, no stutter" feel and "never fights gestures" can't be checked from code. No measurement exists (see Testing)

**Extensibility**
- DONE: the `GESTURES` registry of `{ name, detect }` — `gestures.js:41-46`, mapped to `GESTURE_ACTIONS` — `app.js:45-50`, and `GESTURE_SHAPES` — `constellation.js:225`. The how-to is documented — `README.md:57`

**Testing and PR requirements**
- DONE: a pure-function pose module tested with `node --test` against landmark fixtures, including near misses — `tests/js/poses.test.mjs`, 102 fixtures in `tests/js/fixtures/hands.json`, 126 tests passing, also run in CI — `.github/workflows/ci.yml`
- PARTLY: the spec says "recorded landmark arrays", but the fixtures are **synthetic**, generated by `tests/js/make-fixtures.mjs` — `README.md:118`. `tests/js/fixtures/recorded.json` does not exist; the loader skips it when it is missing — `tests/js/poses.test.mjs:13-17`
- DONE: the test command is documented — `README.md:112-116`
- DONE: the debug overlay at `?debug=gestures` — `app.js:401`, `nelle2/web/gesture-debug.js`. It shows finger states, the pose, follow and scroll state, 3D or 2D landmarks, detections per second, the time per detection, a log of fired gestures and "Copy landmarks" — `gesture-debug.js:24-63`. One gap: its prompt lists only "two, five, thumbsUp", so recorded pointing or three-finger fixtures can't be labelled as such (they would need `expect: null`) — `gesture-debug.js:51`
- NOT DONE: the real-camera test (each gesture 10 times, false triggers while typing or with no hand). PR #3 says: "⚠️ Not done: the real-camera accuracy test … accuracy on real hands is not measured yet" — `gh pr view 3`
- NOT DONE: the "report accuracy honestly" requirement is met only as a statement that accuracy wasn't measured. No accuracy figures exist anywhere — `gh pr view 3`, `README.md`
- NOT DONE: the about-60 fps check with the camera on. PR #3 says it is "not measured on real hardware" — `gh pr view 3`
- DONE: the README covers how to use the feature and has a privacy note — `README.md:31-57`, privacy at `README.md:49`
- PARTLY: the PR has images. The README embeds three PNGs (`docs/screenshots/gesture-{flower,smile,hibro}.png`) — `README.md:33-35`. But the PR #3 body embeds `docs/screenshots/gestures.png`, which is not in `origin/feat/hand-gestures` (`git ls-tree` lists only the three gesture-*.png), so **the PR image link is broken**. There is no GIF and no image of hand movement, pointing or scrolling — `gh pr view 3`
- STALE: the PR #3 description no longer matches the code. It says "PoseGate fires on 6 frames" (code: 4), "Detects on every other frame" (code: every new frame), "106 tests" and "90 landmark fixtures" (now 126 and 102), and "hand drives the dust brush" (now pointing only). It also doesn't mention pointing-follow or three-finger scroll, which later commits added (8cdb87e, 2cb694d) — `gh pr view 3`, `git log`

### Inferences
- Outstanding spec work: the manual camera QA (accuracy, false triggers, fps), real recorded fixtures, a PR description refresh and a working PR image (or GIF), and a decision on the spec deviations (4 vs 6 frames, lime vs pink, pointing-only `move`, frame cadence, the confidence passed to the gate). The deviations look intentional, given the README and the commit messages about the "lime and black theme" and "faster and steadier tracking". But the spec was never updated to match.

### Gaps
- Real-device accuracy and frame rate can't be judged without a camera. No data exists in the repo.
- Whether the spec owner accepts the deviations is unknown.

## Q2. Does the README promise things the code doesn't do, or the code do things the README doesn't mention?

### Takeaway
The README matches the current code well. The mismatches are small: a fixture file it points to doesn't exist, one claim about CI triggers is wider than the workflow, a few performance claims are unverified, and one endpoint goes unmentioned.

### Cited Findings
- `README.md:118` says recorded hands "can be added to `tests/js/fixtures/recorded.json`". The file does not exist (the fixtures directory holds only `hands.json`). The test loader treats it as optional — `tests/js/poses.test.mjs:13-17`. Accurate as a "can be", but nothing has been recorded yet.
- `README.md:120` says "GitHub Actions runs both suites on every push and pull request". The workflow runs on `push` to `main` only, plus all pull requests — `.github/workflows/ci.yml` (`push: branches: [main]`, `pull_request:`).
- `README.md:99` says the scene "runs at about 100 fps on a laptop". `README.md:53` says tracking adds "very little lag". Neither has a measurement in the repo, and PR #3 says fps with the camera was not measured.
- `README.md:47` says "Hold a pose still for about a tenth of a second". The code holds for 4 detections (`poses.js:154`, comment "~130 ms at 30 fps"). At 60 fps that is about 67 ms, and at 30 fps about 130 ms. Roughly consistent.
- `README.md:126` lists server routes "UI, /api/chat, /api/tts, /api/reset". The code also serves `GET /api/status` — `nelle2/server.py:50`, used by `app.js:429`. Not mentioned.
- The README doesn't mention the 0.9 s typing quiet window value (`app.js:36`), though it does describe the behaviour ("for a moment after you type", `README.md:47`). That is fine.
- README features checked against code: the Camera pill and persistence — `app.js:373-400`. The privacy claims — `gestures.js:1-5, 25-26`. The debug panel contents — `gesture-debug.js:37`. The adding-a-gesture steps — `gestures.js:42`, `app.js:46`, `constellation.js:225`, `strokefont.js:1-3`. Three-finger scroll and its cue — `handscroll.js`, `index.html:61`. Pointing-follow — `gestures.js:182-190`, `stage.js:246-275`. Reduced motion — `stage.js:51`. All are present.
- The README project structure (`README.md:124-138`) leaves out the top-level `reports/` and `research_notes/` folders that sit in the working tree (both directories exist at the repo root).

### Inferences
- The README was updated with the later commits (cb05e11, "docs: lime screenshots, three-finger scroll…"), so it tracks the code better than either the spec or the PR body does.

### Gaps
- Python-side README claims (14 emotions, 17 topics, calc safety, edge-tts voice) were not cross-checked line by line. The pytest suite passing (96) is the only evidence gathered for them here.

## Q3. Are there TODO/FIXME/XXX/HACK markers, stubs or "not implemented" paths in nelle2/ and tests/?

### Takeaway
None found.

### Cited Findings
- A case-insensitive search for `TODO|FIXME|XXX|HACK|NotImplemented|not implemented|bare pass|stub` over `nelle2/**` and `tests/**` returned no matches (Grep, this audit).
- The node test runner reports `todo 0` and `skipped 0` (126 tests). Pytest: 96 passed, none skipped.
- The only intentional no-op is a commented catch block for private-mode localStorage — `nelle2/web/app.js:88-90`.
- One stale comment: "pink halo" in a lime-themed build — `nelle2/web/constellation.js:626`.

### Inferences
- The remaining work is verification and alignment with the spec, not unfinished code paths.

### Gaps
- `.pyc` files under `nelle2/__pycache__/` were not inspected, and they are not relevant.
