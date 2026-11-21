# Two merges and a camera test from shipping

Nelle AI is close to done, and most of what is left is checking and tidying, not building. All of the new work (the emotional plasma ball and the hand gestures, 14 commits in total) is still sitting in two open pull requests, and **none of it has reached `main` yet** ([PR #2](https://github.com/rohanjaswara88-art/nelle-AI/pull/2), [PR #3](https://github.com/rohanjaswara88-art/nelle-AI/pull/3)). Both PRs pass their automatic checks and can be merged today with no conflicts. The biggest open gap is that **the hand gestures have never been tried on a real camera**: nobody has measured how often they work, how often they fire by mistake, or how smooth the app stays with the camera on. The automatic tests (96 Python, 126 JavaScript, all passing) only use made-up hand data. There is also **no unfinished code**: a search for TODO, FIXME and placeholder code found nothing. So the plan is short: test on a real camera, refresh the PR text, merge the two PRs in the right order, then fix a handful of safety and robustness issues. Nothing in this report has been changed in the project; it only lists the work.

## Must do to ship: test with a real hand, then merge in order

These are the steps between "works on my branch" and "it's in `main`". The order matters: test first, then fix the PR text, then merge #3 before #2.

| # | To do | Why (one line) | Where |
|---|-------|----------------|-------|
| 1 | Test the gestures on a real camera: do each gesture (two fingers, open hand, thumbs up) 10 times, and check for false triggers while typing or with no hand in view | The build spec asked for this and the PR itself says it was not done, so we don't know how well it works on real hands ([PR #3](https://github.com/rohanjaswara88-art/nelle-AI/pull/3)) | `nelle2/web/gestures.js`, `nelle2/web/poses.js`; debug panel at `http://127.0.0.1:8000/?debug=gestures` |
| 2 | Check the frame rate with the camera on (target about 60 fps) | The README claims smooth motion, but no one has measured it on real hardware | `README.md` (lines 53 and 99) |
| 3 | Write down the real accuracy numbers from steps 1 and 2 | The spec asked to "report accuracy honestly", and today there are no figures anywhere | PR #3 description and `README.md` |
| 4 | Update the PR #3 description | It is out of date: it says 6 frames (now 4), 106 tests (now 126), 90 fixtures (now 102), and leaves out pointing-follow and three-finger scroll | [PR #3](https://github.com/rohanjaswara88-art/nelle-AI/pull/3) |
| 5 | Fix the broken image in PR #3 | It points at `docs/screenshots/gestures.png`, which does not exist; the real files are `gesture-flower.png`, `gesture-smile.png` and `gesture-hibro.png` | `docs/screenshots/` |
| 6 | Decide whether the changes from the original spec are OK (4-frame hold instead of 6, lime instead of pink, the dust follows only a pointing finger, detection on every frame) | They look deliberate, but the spec was never updated, so the two now disagree | `docs/prompts/hand-gestures.md`, `nelle2/web/poses.js` (line 154) |
| 7 | Merge PR #3 into `feat/emotional-avatar` first | Merging in this order brings both features to `main` cleanly; merging #2 first forces #3 to be re-pointed | [PR #3](https://github.com/rohanjaswara88-art/nelle-AI/pull/3) |
| 8 | Then merge PR #2 into `main` | This is the step that actually ships everything; it is clean and its checks pass | [PR #2](https://github.com/rohanjaswara88-art/nelle-AI/pull/2) |
| 9 | Decide what to do with the untracked files: ignore `.claude/`, `research_notes/` and `reports/`, and either commit or ignore the spec `docs/prompts/hand-gestures.md` | They are personal tooling and notes, not app code, and they keep showing up as "new files" | `.gitignore` |

One thing to know before merging: `main` has **no branch protection**, so GitHub will not stop anyone pushing straight to it. The "never push to main" rule is only a habit right now ([repo settings](https://github.com/rohanjaswara88-art/nelle-AI)). Turning on protection is a two-minute job in GitHub settings, and it's worth doing.

## Should fix: three weak spots in safety, robustness and tests

None of these block shipping a local app that you run on your own machine. They matter more if anyone else uses it, or if it ever goes online. The server only listens on your own computer (127.0.0.1), which is why these are "should fix" and not "must fix" ([server.py](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/nelle2/server.py)).

### Safety: nothing stops a runaway or malicious page from spending your AI credit

| # | To do | Why (one line) | Where |
|---|-------|----------------|-------|
| 10 | Add a limit on how often `/api/chat` and `/api/tts` can be called | Every chat message can cost Anthropic credit, and nothing stops a loop or a bad web page from sending hundreds | `nelle2/server.py` (lines 55-92) |
| 11 | Only accept requests that come from Nelle's own page (check the Host and Origin headers) | Any other website you visit could quietly reset Nelle's memory, or in a rarer attack, send chats on your key | `nelle2/server.py` (lines 72-75) |
| 12 | Add basic security headers (for example, a content security policy) | The page has camera and microphone access, so it should block anything it doesn't expect | `nelle2/server.py` (lines 94-99) |
| 13 | Lock outside code to exact copies (integrity checks), or save copies locally | The 3D library and hand tracker load from public websites with no check that the file is unchanged; a tampered file would get camera access | `nelle2/web/crystal.js` (line 15), `nelle2/web/gestures.js` (line 25), `nelle2/web/index.html` |
| 14 | Pin exact versions of the Python packages | Packages only have minimum versions, so a future update could break a fresh install | `requirements.txt` |

The good news: your API key is handled safely. It is read only from `.env`, which git ignores, and it has never been committed. Chat text is never inserted into the page as raw HTML, so the usual "inject a script through a message" trick does not work.

### Robustness: a slow network can freeze or blank the app

| # | To do | Why (one line) | Where |
|---|-------|----------------|-------|
| 15 | Make the app still start if the 3D library website is down | Right now one failed download stops the whole page loading, and even the backup 2D ball never appears | `nelle2/web/crystal.js` (line 15), `nelle2/web/stage.js` (line 4), `nelle2/web/app.js` (line 5) |
| 16 | Add time limits to AI calls and to the page's requests | A slow AI reply leaves Nelle stuck on "Thinking" with no end (you can press Esc, but most users won't know that) | `nelle2/brain.py` (line 104), `nelle2/web/app.js` (lines 219-228) |
| 17 | Stop the camera properly if the video fails to start | One error path leaves the camera running in the background | `nelle2/web/gestures.js` (lines 230-236) |
| 18 | Add styling for the "no 3D support" fallback | The code marks the page as "no WebGL", but no style uses that mark | `nelle2/web/stage.js` (line 92), `nelle2/web/styles.css` |
| 19 | Split PyAudio out of the main install list | It often fails to install on Windows and Mac, and the web app doesn't need it (only the old voice loop does) | `requirements.txt` |

### Tests: only the gesture maths is checked automatically

| # | To do | Why (one line) | Where |
|---|-------|----------------|-------|
| 20 | Record real hand data and add it to the tests | All 102 test hands are computer-generated, so the tests can't catch problems with real hands | `tests/js/fixtures/recorded.json` (does not exist yet), `nelle2/web/gesture-debug.js` |
| 21 | Let the debug panel label pointing and three-finger hands | It only offers "two, five, thumbsUp", so you can't record the newer gestures properly | `nelle2/web/gesture-debug.js` (line 51) |
| 22 | Add tests for the screen and chat code | 7 of 10 front-end files have no tests at all, including the main chat logic | `nelle2/web/app.js`, `stage.js`, `crystal.js`, `constellation.js`, `handscroll.js`, `voice.js` |
| 23 | Add a test for the voice endpoint and the real-Claude setup | `/api/tts` and the code that connects to Claude are never tested | `tests/test_server.py`, `tests/test_brain.py`, `nelle2/server.py` (lines 77-92), `nelle2/brain.py` (lines 96-123, 171-178) |
| 24 | Measure test coverage in CI | Nobody knows how much code the tests reach; your own rules ask for 80%, and the gesture tracker is at about 33% | `.github/workflows/ci.yml`, `requirements-dev.txt` |
| 25 | Add one end-to-end browser test (open the page, send a message, see a reply) | Green checks today do not prove the app actually runs in a browser | `.github/workflows/ci.yml` |

## Nice to have: polish, tidy-up and the licence

| # | To do | Why (one line) | Where |
|---|-------|----------------|-------|
| 26 | Add a LICENSE file | The repo is public but has no licence, which legally means nobody else may reuse your code ([repo](https://github.com/rohanjaswara88-art/nelle-AI)) | repo root |
| 27 | Add a note that the plasma ball keeps its own licence (MIT + Commons Clause, by David Haz) | It can be used in your app but not sold on its own, whatever licence you choose for the rest ([crystal.js](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/nelle2/web/crystal.js)) | `LICENSE` or `README.md` |
| 28 | Make the faint text easier to read | Small grey labels like "You/Nelle" and the memory counter are at about 2.9:1 contrast, below the 4.5:1 readability standard | `nelle2/web/styles.css` (line 7) |
| 29 | Let keyboard users show or hide the camera preview | The preview toggle only works with a mouse click | `nelle2/web/index.html` (line 85), `nelle2/web/gestures.js` (lines 129-132) |
| 30 | Fix small README errors: CI runs on pushes to `main` only (not every push), and `/api/status` isn't listed | Keeps the docs honest ([README](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/README.md)) | `README.md` (lines 120, 126) |
| 31 | Add a GIF of pointing and three-finger scrolling to the PR and README | Today's screenshots show only the flower, smile and HI BRO, not the newer moves | `docs/screenshots/` |
| 32 | Remove leftovers: the test script `main.py`, two old MP3 files, a stale "pink halo" comment, and a `console.log` in the debug panel | Small clutter from earlier experiments that nothing uses | `nelle2/main.py`, `nelle2/test.mp3`, `nelle2/voice.mp3`, `nelle2/web/constellation.js` (line 626), `nelle2/web/gesture-debug.js` (line 59) |
| 33 | Split up the very large plasma-ball file, or note why it stays big | At 1,447 lines (one function is 624 lines) it is well over your 800-line guideline, though it is ported code | `nelle2/web/crystal.js` |
| 34 | Only if you want it online: make the host and port settable, add a deploy setup and HTTPS | Today it only runs on your own computer; the camera and mic need HTTPS once it's hosted | `nelle2/server.py` (line 113) |

## Conclusion

The project's risk has moved from "is it built?" to "does it really work for a person in front of a webcam?" The code is finished and the checks are green, but every number about gesture quality is still unknown, because the tests only ever see synthetic hands. That makes the real-camera session (items 1 to 3) the one piece of work that changes what you can honestly say about Nelle. It also feeds two later items: the recorded hands from that session become the real test data (item 20).

The safety items are cheap insurance rather than emergencies, because the app only listens on your own machine. They become urgent the moment you host Nelle for anyone else, since every unchecked request spends your Anthropic credit. If hosting is on the roadmap, do items 10, 11 and 16 before item 34, not after.
