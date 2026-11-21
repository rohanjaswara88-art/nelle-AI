# Nelle AI

Emotionally aware chatbot: a FastAPI server (`nelle2/server.py`) and a vanilla ES-module front end
(`nelle2/web/`) with an animated plasma sphere, a topic constellation and MediaPipe hand gestures.
The user is a student on Windows and writes informal English: read requests for intent, and ask one
short question when a request can mean two different things.

## Commands

- Run: `python nelle2/server.py`, then open http://127.0.0.1:8000 (already in `.claude/launch.json`;
  if port 8000 is taken, the server is probably already running, so open the URL instead)
- Gesture debug panel: http://127.0.0.1:8000/?debug=gestures
- Python tests: `python -m pytest -q`
- JS tests: `node --test "tests/js/*.test.mjs"`
- Both test suites must pass before a commit. CI runs them (`.github/workflows/ci.yml`).

## Rules

- Never push to `main`. Work on a feature branch and open a PR. Conventional commits
  (`feat:`, `fix:`, `docs:`...), no Co-Authored-By trailer.
- Never print, log or commit secrets. The API key lives in the git-ignored `.env`; without it Nelle
  runs in offline mode, so tests never need a key.
- Camera frames never leave the browser: hand tracking runs on-device only.
- One animation loop: hook per-frame work into `stage.onFrame`, never start another
  `requestAnimationFrame` loop.
- Keep existing commands and tests working. Update `README.md` when a user-visible feature changes.
- Don't add build tools, frameworks or npm packages to the front end; it is plain ES modules.

## Code map

- `nelle2/server.py` API + static files; `brain.py` Claude call and offline replies; `emotion.py`
  mood smoothing; `topics.py` topic detection; `calc.py` safe arithmetic; `refine.py` prompt suggestions; `voice.py` edge-tts.
- `nelle2/web/app.js` wires everything; `stage.js` sphere + frame loop; `crystal.js` plasma render;
  `constellation.js` points and shapes; `gestures.js` camera + gesture events; `poses.js` pure
  hand-pose maths (unit-tested); `handscroll.js` three-finger scrolling; `refine.js` suggestion chips.
- Hand fixtures for JS tests: `tests/js/fixtures/hands.json`.

## Testing gestures

Gestures can only be checked with simulated hands here, never the real webcam. Say so when reporting,
and ask the user for numbers from the debug panel when tuning thresholds. In a hidden browser pane
`requestAnimationFrame` is paused: step `stage.frameHooks` by hand, and import modules from `/static/`.
