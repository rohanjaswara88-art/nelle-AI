# Nelle AI: code-quality, testing and security gaps

Audit of the working tree on branch `feat/hand-gestures` (HEAD 8b023a7), read-only. Sources are local files; line numbers are from the current tree. `python -m pytest -q` gives 96 passed; `node --test "tests/js/*.test.mjs"` gives 126 passed (both re-run during this audit). `.env` does not currently exist in the working tree and has never been committed (`git log --all -- .env` is empty); its contents were not read.

## Prioritised summary (input for the report writer)

- HIGH: whole front end depends on an un-SRI'd, dynamically built CDN module imported at top level; if jsdelivr is unreachable the app never boots and the `no-webgl` fallback never runs — [crystal.js:15](nelle2/web/crystal.js), [stage.js:4](nelle2/web/stage.js), [app.js:5](nelle2/web/app.js)
- HIGH: 7 of 10 front-end modules (app, stage, crystal, constellation, handscroll, voice, gesture-debug) have zero tests; gestures.js is 33% line-covered; no end-to-end tests; no coverage measurement in CI — [ci.yml](.github/workflows/ci.yml), [tests/js/poses.test.mjs:8-10](tests/js/poses.test.mjs)
- MEDIUM: no rate limiting on `/api/chat` or `/api/tts`; no request timeout on the Anthropic client, and the front end has no fetch timeout — [server.py:55-92](nelle2/server.py), [brain.py:104](nelle2/brain.py), [app.js:219-228](nelle2/web/app.js)
- MEDIUM: no Host-header / CSRF protection; `/api/reset` (no body) is callable cross-site; no TrustedHostMiddleware against DNS rebinding — [server.py:72-75](nelle2/server.py)
- MEDIUM: crystal.js is 1,447 lines (soft ceiling 800) with one 624-line function; eight functions over 50 lines
- MEDIUM: faint text (`--ink-faint`) is about 2.9:1 contrast at 9-10.5 px sizes (WCAG AA needs 4.5:1) — [styles.css:7](nelle2/web/styles.css)
- MEDIUM: `no-webgl` body class is set but has no CSS rule — [stage.js:92](nelle2/web/stage.js)
- LOW: camera preview toggle is a clickable `<div>` with no keyboard access — [index.html:85](nelle2/web/index.html), [gestures.js:129-132](nelle2/web/gestures.js)
- LOW: leftover script `nelle2/main.py` and committed binaries `nelle2/test.mp3`, `nelle2/voice.mp3`; `console.log` in gesture-debug.js:59
- LOW: `/api/tts` endpoint and `ClaudeProvider`/`make_provider` have no tests
- Not a gap: no user/model text is inserted as HTML; `.glass` is in use; `hud.js` was already deleted; API key is only read from env/`.env` which is git-ignored.

## Test coverage: which modules have no tests, is coverage measured, are there E2E tests?

### Takeaway
Python modules are mostly tested (one test file per module except the legacy `nelle.py`/`main.py`), but the JavaScript tests only import three pure-logic modules; the entire UI layer (app, stage, crystal, constellation, handscroll, voice, gesture-debug) has no tests, coverage is not measured anywhere, and there are no E2E/browser tests.

### Cited Findings
- The only JS test file imports just `poses.js`, `gestures.js` (`classifyPose`) and `strokefont.js` — [tests/js/poses.test.mjs:8-10](tests/js/poses.test.mjs)
- `tests/js/` contains only `poses.test.mjs`, `make-fixtures.mjs` and `fixtures/` — [tests/js](tests/js)
- Node's built-in coverage (`node --test --experimental-test-coverage`, run during this audit): poses.js 100% lines, strokefont.js 100% lines, gestures.js 33.43% lines / 11.11% functions (uncovered 68-89, 111-346: the whole `GestureTracker` class, camera start/stop, `tick`, MediaPipe loading). app.js, stage.js, crystal.js, constellation.js, handscroll.js, voice.js and gesture-debug.js are never loaded, so 0% — [nelle2/web/gestures.js](nelle2/web/gestures.js)
- CI runs `python -m pytest -q` and `node --test "tests/js/*.test.mjs"` only; no coverage flags, no thresholds, no lint step, no browser/E2E job — [.github/workflows/ci.yml](.github/workflows/ci.yml)
- `coverage`/`pytest-cov` is not installed and not in dev requirements (`pytest`, `fastapi`, `httpx` only) — [requirements-dev.txt](requirements-dev.txt)
- No Playwright/Puppeteer/Selenium anywhere in the repo (grep of tests, requirements, CI, README returned nothing) — [README.md](README.md)
- Python test files exist for brain, calc, commands, emotion, server, topics, voice — [tests/](tests)
- Server tests cover `/`, `/api/chat` (structured reply, empty/oversize rejection, calc, topic), `/api/reset`, `/api/status`; there is no test of `/api/tts` (success, 503 on failure, emotion coercion, 3000-char limit) — [tests/test_server.py:11-49](tests/test_server.py), [nelle2/server.py:77-92](nelle2/server.py)
- Brain tests use fake providers; `ClaudeProvider.generate` (including the `refusal` branch) and `make_provider` (key present / import failure) are never exercised — [nelle2/brain.py:96-123](nelle2/brain.py), [nelle2/brain.py:171-178](nelle2/brain.py), [tests/test_brain.py](tests/test_brain.py)
- The model-failure fallback is tested — [tests/test_brain.py:46](tests/test_brain.py)
- `nelle2/nelle.py` (original voice loop, imports pyttsx3/speech_recognition) and `nelle2/main.py` have no tests — [nelle2/nelle.py:1-7](nelle2/nelle.py)
- Note: the `-q` server middleware (`Cache-Control: no-cache`) is also not asserted in tests — [nelle2/server.py:94-99](nelle2/server.py)

### Inferences
- Measured JS coverage across all front-end source is far below the 80% target in the user's rules; only the gesture maths is safe from regression. Interaction logic in app.js (`send`, interrupt/job cancellation, voice/text reveal) is the highest-risk untested code.
- handscroll.js (55 lines, pure class driven by `tick`/`update`) and the pure helpers in crystal.js (`buildPalette`, `parseColor` exported at crystal.js:818) look testable under Node without a browser.

### Gaps
- Python line coverage could not be measured because `coverage` is not installed (installing would modify the environment, outside the read-only brief).

## Files over 800 lines and functions over 50 lines

### Takeaway
One source file exceeds the 800-line ceiling (crystal.js, 1,447 lines) and contains a 624-line factory function; seven other functions exceed 50 lines.

### Cited Findings
- File sizes (wc -l): crystal.js 1447, styles.css 776, constellation.js 746, stage.js 490, app.js 446, gestures.js 347, poses.js 301; all Python files under 222 lines — [nelle2/web/crystal.js](nelle2/web/crystal.js)
- Functions over 50 lines (brace-matching scan for JS, `ast` for Python):
  - `createCrystalBall` 624 lines, crystal.js:824-1447 — [crystal.js:824](nelle2/web/crystal.js)
  - inner `frame` closure 196 lines, crystal.js:1135 — [crystal.js:1135](nelle2/web/crystal.js)
  - `send` 70 lines, app.js:230-299 — [app.js:230](nelle2/web/app.js)
  - `Constellation.paint` 70 lines, constellation.js:655 — [constellation.js:655](nelle2/web/constellation.js)
  - `Stage.animate` 62 lines, stage.js:331 — [stage.js:331](nelle2/web/stage.js)
  - `create_app` 61 lines, server.py:42-102 (route closures inside) — [server.py:42](nelle2/server.py)
  - `attachGestureDebug` 57 lines, gesture-debug.js:8 — [gesture-debug.js:8](nelle2/web/gesture-debug.js)
  - `Stage` constructor 56 lines, stage.js:46 — [stage.js:46](nelle2/web/stage.js)
  - `Stage.drawFog` 55 lines, stage.js:394 — [stage.js:394](nelle2/web/stage.js)
- crystal.js credits a ported React Bits component ("The React wrapper was removed") — [crystal.js:4](nelle2/web/crystal.js)

### Inferences
- crystal.js is a port of third-party code, which may be the "deliberate exception" the rules allow, but no such reason is recorded in the file header. styles.css (776) and constellation.js (746) are close to the ceiling.
- `create_app` is long only because the route handlers are nested inside it; that pattern is idiomatic for FastAPI app factories.

### Gaps
- The JS scan is a heuristic (brace counting); shader strings inside crystal.js could inflate counts slightly, but 624 lines is unambiguous.

## Security: rate limiting, input length, CORS, XSS, API key, CDN pinning / SRI

### Takeaway
Input length is validated and no text is inserted as HTML, and the key is env-only and git-ignored; but there is no rate limiting, no timeouts, no CSRF/Host protection, and the third-party scripts are version-pinned without Subresource Integrity.

### Cited Findings
- Rate limiting: none. No middleware or dependency limits `/api/chat` or `/api/tts`; the only middleware sets `Cache-Control` — [server.py:55-99](nelle2/server.py). Each chat call can hit the paid Anthropic API with `max_tokens=2048` — [brain.py:25](nelle2/brain.py), [brain.py:111-119](nelle2/brain.py); each TTS call hits edge-tts — [server.py:83](nelle2/server.py)
- Input length: chat `message` 1-2000 chars and TTS `text` 1-3000 chars via Pydantic; whitespace-only chat rejected; intensity bounded 0..1; unknown TTS emotion coerced to neutral — [server.py:26-39](nelle2/server.py), [server.py:58-60](nelle2/server.py), [server.py:81](nelle2/server.py). Front end also sets `maxlength="2000"` — [index.html:73](nelle2/web/index.html). Tested — [tests/test_server.py:24-28](tests/test_server.py)
- CORS: no `CORSMiddleware` configured (default same-origin only) — [server.py:14-17](nelle2/server.py)
- CSRF / DNS rebinding: no `TrustedHostMiddleware`, no Origin check. `/api/reset` takes no body, so any web page can fire a cross-site POST to it. `/api/chat` and `/api/tts` require a JSON body. Server binds only to 127.0.0.1:8000 — [server.py:72-75](nelle2/server.py), [server.py:113](nelle2/server.py)
- No security headers (CSP, X-Content-Type-Options, frame-ancestors) are set — [server.py:94-99](nelle2/server.py)
- XSS: all chat text goes through `textContent` (message body, tags, word spans, link label) — [app.js:128-175](nelle2/web/app.js). The only `innerHTML` is a static template in the debug panel with no interpolation — [gesture-debug.js:11-15](nelle2/web/gesture-debug.js). Links come from server `url`, which is only built in commands.py from fixed bases plus `urllib.parse.quote` — [commands.py:8-47](nelle2/commands.py); rendered with `rel="noopener noreferrer"` and opened with `window.open(..., "noopener")` — [app.js:152-160](nelle2/web/app.js), [app.js:274-277](nelle2/web/app.js)
- API key: read only from the environment by the Anthropic SDK (`os.environ.get("ANTHROPIC_API_KEY")`), loaded from `.env` via python-dotenv — [brain.py:173](nelle2/brain.py), [server.py:109](nelle2/server.py). `.env` is git-ignored — [.gitignore:5](.gitignore); `.env.example` has an empty value and a do-not-commit note — [.env.example](.env.example). `git grep "sk-ant"` across tracked files and history: no matches. `/api/status` returns only provider name and memory count — [server.py:50-53](nelle2/server.py)
- CDN pinning: ogl pinned `ogl@1.0.11/+esm` — [crystal.js:15](nelle2/web/crystal.js); MediaPipe pinned `@mediapipe/tasks-vision@1.2.0` (bundle + wasm) — [gestures.js:25](nelle2/web/gestures.js), [gestures.js:70-71](nelle2/web/gestures.js); hand model URL `.../float16/1/hand_landmarker.task` (versioned path, Google storage) — [gestures.js:26](nelle2/web/gestures.js); Google Fonts stylesheet unversioned — [index.html:11-14](nelle2/web/index.html)
- SRI: no `integrity` attribute or import map anywhere; ES-module `import`/dynamic `import()` from CDN cannot carry SRI without an import map `integrity` field — [crystal.js:15](nelle2/web/crystal.js), [gestures.js:70](nelle2/web/gestures.js), [index.html:91](nelle2/web/index.html)
- `requirements.txt` uses only lower bounds (`fastapi>=0.110`, `anthropic>=2.0`, etc.), no lock file — [requirements.txt](requirements.txt)

### Inferences
- jsdelivr's `/+esm` endpoint is generated output, so even a pinned version is not byte-stable; a compromised CDN would get full script access to a page that has camera and microphone permission.
- Because the server is local-only, the realistic abuse paths are a malicious web page (cross-site reset; or DNS rebinding to drive `/api/chat` and spend API credit) and runaway client loops, not internet-wide attacks. This makes rate limiting/Host checking MEDIUM rather than CRITICAL.

### Gaps
- Whether FastAPI in the installed version rejects non-JSON content types for `/api/chat` was not empirically tested (would require running a cross-origin request).

## Error handling: AI provider failure, missing WebGL, camera denied

### Takeaway
Provider failures and camera errors are handled with friendly fallbacks; WebGL absence is handled only partially (no CSS for the fallback class), and a CDN outage breaks the whole page. Timeouts are missing.

### Cited Findings
- Provider failure: any exception from `provider.generate` is logged and answered by the offline responder, `source="offline"` — [brain.py:207-213](nelle2/brain.py); a missing package or bad config at startup also falls back offline — [brain.py:171-178](nelle2/brain.py); refusals return a fixed polite reply — [brain.py:120-121](nelle2/brain.py)
- No timeout or `max_retries` is configured on `anthropic.Anthropic()` (SDK defaults apply) — [brain.py:104](nelle2/brain.py); grep for `timeout|max_retries` in nelle2/*.py found nothing
- Front end: a failed/non-2xx `/api/chat` shows an in-character "server didn't answer" message — [app.js:246-258](nelle2/web/app.js); `postJson` has no timeout, only user abort — [app.js:219-228](nelle2/web/app.js); TTS failure falls back to text with a toast — [app.js:261-264](nelle2/web/app.js), [app.js:282](nelle2/web/app.js); server side TTS returns 503 — [server.py:82-88](nelle2/server.py); boot shows "NO SERVER" if status fails — [app.js:432-434](nelle2/web/app.js)
- WebGL: `createCrystalBall` returns null without WebGL2 — [crystal.js:821](nelle2/web/crystal.js); Stage catches and adds `body.no-webgl`, and draws a 2D gradient orb instead — [stage.js:87-92](nelle2/web/stage.js), [stage.js:439-446](nelle2/web/stage.js). No CSS rule references `no-webgl` (grep of styles.css and index.html: none). No `webglcontextlost`/`webglcontextrestored` handling (grep: none)
- CDN failure: crystal.js imports ogl statically at module top — [crystal.js:15](nelle2/web/crystal.js) — and is imported by stage.js:4, which app.js:5 imports, so a failed CDN fetch aborts the whole module graph before any try/catch runs
- Camera: `getUserMedia` missing → `unsupported`; `NotAllowedError`/`SecurityError` → `denied`; other → `no-camera`; MediaPipe load failure → `model` and stream tracks stopped — [gestures.js:205-229](nelle2/web/gestures.js); app shows a mapped toast and resets the setting — [app.js:51-56](nelle2/web/app.js), [app.js:388-397](nelle2/web/app.js); GPU delegate falls back to CPU — [gestures.js:80-85](nelle2/web/gestures.js); per-frame detection errors are caught — [gestures.js:270-283](nelle2/web/gestures.js)
- `await video.play()` and the `loadeddata` wait in `start()` are not in a try block, so a failure there leaves the stream running (tracks not stopped) — [gestures.js:230-236](nelle2/web/gestures.js)
- Mic: `not-allowed` and other speech errors toast — [app.js:316-320](nelle2/web/app.js)

### Inferences
- A slow (not failed) Anthropic call keeps the UI in "Thinking" with no upper bound other than SDK defaults; the user can interrupt with Esc.

### Gaps
- Did not run the app in a browser without WebGL to see what the fallback looks like.

## Accessibility basics: keyboard, reduced motion, contrast

### Takeaway
Keyboard chat works and reduced motion is respected in JS animations, but the faint text fails contrast and the camera preview is mouse-only.

### Cited Findings
- Keyboard: Enter sends, Shift+Enter newline, Esc interrupts globally — [app.js:333-348](nelle2/web/app.js); all controls are `<button>`s with labels; focus ring via `:focus-visible` — [styles.css:138-141](nelle2/web/styles.css); `#input` sets `outline: 0` but `#composer:focus-within` provides a visible state — [styles.css:636-648](nelle2/web/styles.css)
- The camera preview toggle is a `<div id="cam">` with a click handler, no `tabindex`, role or key handler — [index.html:85](nelle2/web/index.html), [gestures.js:129-132](nelle2/web/gestures.js)
- Live regions: `#log` is `aria-live="polite"` — [index.html:60](nelle2/web/index.html); status is `role="status"` and changes every state — [index.html:29](nelle2/web/index.html); toast is `role="alert"` — [index.html:90](nelle2/web/index.html)
- Reduced motion: JS checks `prefers-reduced-motion` in stage.js:51, constellation.js:282, crystal.js:1085, read once at construction (no change listener); CSS reduced-motion block only disables `.grain`, `.dot`, mic pulse and `.w` transitions — [styles.css:773-776](nelle2/web/styles.css), while styles.css has 25 `animation:`/`transition:` declarations
- Contrast: `--ink-faint: rgba(210,255,160,0.36)` over `--deep #020302` blends to about rgb(77,94,59), contrast about 2.92:1 (computed); `--ink-dim` about 7.75:1 — [styles.css:6-7](nelle2/web/styles.css). `--ink-faint` is used for `.sub` (10 px), `.msg .meta` (10 px), `.hint` (9.5 px), the textarea placeholder, the chat-head counter and debug title — [styles.css:184-188](nelle2/web/styles.css), [styles.css:506-515](nelle2/web/styles.css), [styles.css:654-655](nelle2/web/styles.css), [styles.css:713-718](nelle2/web/styles.css). Many labels are 9-10.5 px — [styles.css:302](nelle2/web/styles.css), [styles.css:367](nelle2/web/styles.css)

### Inferences
- WCAG 2.1 AA needs 4.5:1 for normal text; the faint text fails at about 2.9:1, and the tiny sizes make it worse. The "MEM 00/12" counter and message "You/Nelle" labels carry real information.

### Gaps
- Contrast was computed against the page background only; text on `.glass` panels sits on a slightly lighter gradient, so actual ratios may be a little lower. No screen-reader run was done.

## Leftover debug code and dead code

### Takeaway
Little real dead code remains: `hud.js` is already deleted and `.glass` is used; the leftovers are a test script, two committed MP3s, an unused CSS hook, and one `console.log` in the opt-in debug panel.

### Cited Findings
- `console.log(JSON.stringify(fixture))` in the Copy-landmarks handler — [gesture-debug.js:59](nelle2/web/gesture-debug.js) (debug panel only loads with `?debug=gestures` — [app.js:401](nelle2/web/app.js))
- `console.warn` calls for real failures: app.js:395, gestures.js:83, 242, 281, stage.js:89
- `window.nelle = { stage, setState, ... }` global exposed "for poking at states from devtools" — [app.js:445](nelle2/web/app.js)
- `nelle2/main.py` is a 7-line edge-tts "Jarvis voice test" that writes `test.mp3` and is not imported anywhere — [main.py:1-7](nelle2/main.py); `nelle2/test.mp3` (20 KB) and `nelle2/voice.mp3` (16 KB) are committed and not referenced by any Python code (grep)
- `hud.js` was deleted in an earlier commit (git log `--diff-filter=D`) and no file references `hud` — [nelle2/web](nelle2/web)
- `.panel`: no such selector in styles.css. `.glass` is defined — [styles.css:121](nelle2/web/styles.css) — and used in index.html (brand, status, pills, cam, toast) and gesture-debug.js:10. A scan of every class selector in styles.css against JS/HTML found no unused classes (the only hits, `.org`/`.w3`, are inside an SVG data URL at styles.css:92)
- `body.no-webgl` is added in JS with no CSS consumer — [stage.js:92](nelle2/web/stage.js)
- `ChatResult`/`/api/status`: none unused. `nelle2/nelle.py` is the legacy voice loop, still documented in requirements.txt ("Original voice loop") — [requirements.txt](requirements.txt)

### Inferences
- The class-usage scan uses whole-word matching, so a class name that also appears as an ordinary word in JS could hide an unused rule; nothing suspicious stood out.

### Gaps
- Unused element IDs and unused JS exports were not exhaustively scanned.
