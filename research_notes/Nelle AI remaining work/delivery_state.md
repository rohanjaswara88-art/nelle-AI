# Nelle AI delivery state (branches, PRs, CI, readiness to ship)

Researched 2026-11-17, read-only. Sources are local commands run in `C:/Users/ROHAN/projects/nelle-AI` and `gh` calls against `rohanjaswara88-art/nelle-AI`. "Source" links point at the repo on GitHub or name the command used.

## Which branches exist locally and on the remote, and how far is each ahead of or behind main?

### Takeaway
There are three branches, each present both locally and on origin and in sync with it: `main`, `feat/emotional-avatar` (7 commits ahead of main) and `feat/hand-gestures` (14 ahead: the same 7 plus 7 of its own). Neither feature branch is behind main, so none of the new work has reached main yet.

### Cited Findings
- Local branches: `main` at 6f72b6e (tracks origin/main), `feat/emotional-avatar` at fcce1bc (tracks origin/feat/emotional-avatar), `feat/hand-gestures` at 8b023a7 (tracks origin/feat/hand-gestures, checked out). Each local tip matches its remote tip. — `git branch -a -vv`
- Remote branches: origin/main, origin/feat/emotional-avatar, origin/feat/hand-gestures. origin/HEAD points to origin/main. The `testable-commands` branch from PR #1 is no longer on the remote. — `git branch -a -vv`
- Behind/ahead of origin/main (`git rev-list --left-right --count origin/main...<branch>`): feat/emotional-avatar 0 behind / 7 ahead; feat/hand-gestures 0 behind / 14 ahead. — local git
- main's tip is "Merge pull request #1 from rohanjaswara88-art/testable-commands" (6f72b6e), committed Sun Nov 15 16:51 2026 +0530. — `git log -1 origin/main`
- The 7 commits on feat/emotional-avatar beyond main: de685b8 (emotion engine, Claude brain, FastAPI voice server), 674bcfb (shadow front end), d76545c (README rewrite), 2f93bf6 (plasma ball / React Bits CrystalizedBall), 516165a (exact calculations), 90be7e2 (thinking/searching/found states), fcce1bc (topic constellation). — `git log origin/main..feat/emotional-avatar`
- The 7 commits on feat/hand-gestures beyond feat/emotional-avatar: deb9929 (MediaPipe hand-gesture reactions), a619136 (docs), 98848ae (fix: hand beats a resting mouse), 8cdb87e (fingertip following), 2cb694d (three-finger scroll, lime and black theme), cb05e11 (docs), 8b023a7 (full-size chat box). — `git log feat/emotional-avatar..feat/hand-gestures`
- `main` has no branch protection ("Branch not protected", HTTP 404). — `gh api repos/rohanjaswara88-art/nelle-AI/branches/main/protection`

### Inferences
- The "never push to main" rule is a convention only. GitHub does not enforce it, because main has no protection rule.
- The branches are a linear stack: main <- feat/emotional-avatar <- feat/hand-gestures. Nothing has been added to main since the stack was cut, so no rebase is needed.

### Gaps
- No `git fetch` was run (read-only brief), so "in sync with origin" means the last fetched state. The `gh` data below, which is live, agrees with it.

## Which PRs are open, and is the PR stack still waiting to merge? Does a PR from feat/emotional-avatar into main exist?

### Takeaway
Yes, the PR exists: PR #2 (feat/emotional-avatar -> main) and PR #3 (feat/hand-gestures -> feat/emotional-avatar) are both open, mergeable, CLEAN, with passing CI and no reviews. The whole stack is still waiting to merge. PR #1 was merged earlier.

### Cited Findings
- PR #3 "feat: hand-gesture reactions (flower, smile, HI BRO, dust follows your hand)": base `feat/emotional-avatar`, head `feat/hand-gestures`, OPEN, not a draft, mergeable MERGEABLE, mergeStateStatus CLEAN, reviewDecision empty, 0 reviews, 7 commits, check `test` SUCCESS. Created 2026-11-15T21:35:48Z. — [PR #3](https://github.com/rohanjaswara88-art/nelle-AI/pull/3)
- PR #2 "feat: emotional AI living in a plasma ball": base `main`, head `feat/emotional-avatar`, OPEN, not a draft, MERGEABLE, CLEAN, reviewDecision empty, 0 reviews, 7 commits, check `test` SUCCESS. Created 2026-11-15T20:12:03Z. — [PR #2](https://github.com/rohanjaswara88-art/nelle-AI/pull/2)
- PR #1 "Testable command matching, tests, requirements and CI": base `main`, head `testable-commands`, MERGED (as merge commit 6f72b6e). — [PR #1](https://github.com/rohanjaswara88-art/nelle-AI/pull/1)
- The repo is public, and its default branch is main. — `gh api repos/rohanjaswara88-art/nelle-AI`

### Inferences
- Merge order to reach main: merge #3 into feat/emotional-avatar first, then merge #2 into main. That brings all 14 commits to main. If #2 is merged first, #3 then has to be retargeted to main, either by hand or by GitHub's automatic retargeting when the base branch is deleted.
- No reviewer approval is required. With no branch protection, the owner can merge both PRs now.

### Gaps
- I did not read the PR descriptions in full or check for unresolved review comments. The review count is 0.

## Do the latest CI runs pass?

### Takeaway
Yes. Every CI run on record succeeded, including the latest one on each PR and the push run on main after PR #1.

### Cited Findings
- Latest PR #3 run 43878138472 (2026-11-16T13:41:05Z): success in 15s. All 5 runs on feat/hand-gestures succeeded. — [run 43878138472](https://github.com/rohanjaswara88-art/nelle-AI/actions/runs/43878138472)
- Latest PR #2 run 43762650465 (2026-11-15T21:15:17Z): success. All 5 runs on feat/emotional-avatar succeeded. — [run 43762650465](https://github.com/rohanjaswara88-art/nelle-AI/actions/runs/43762650465)
- Push run on main 43708561874 (2026-11-15T11:21:50Z, after the PR #1 merge): success. — `gh run list`
- The CI workflow (`.github/workflows/ci.yml`) runs on push to main and on every pull_request. It uses ubuntu-latest and Python 3.12, runs `pip install -r requirements-dev.txt` and `python -m pytest -q`, then sets up Node 22 and runs `node --test "tests/js/*.test.mjs"`. — [ci.yml](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/.github/workflows/ci.yml)
- On main, ci.yml is 4 lines shorter than on feat/hand-gestures (the Node/JS test step is new on the branch). requirements.txt and requirements-dev.txt also differ. — `git diff --stat origin/main feat/hand-gestures`

### Inferences
- CI checks Python unit/API tests and JS pose tests only. It does not install the full requirements.txt (with PyAudio), run the browser front end, or test a real Claude call, so a green CI does not show the app runs end to end.

### Gaps
- I did not check test coverage. CI does not measure it.

## Untracked files: should they be committed or git-ignored?

### Takeaway
Only `.claude/launch.json` and `docs/prompts/hand-gestures.md` are untracked. `research_notes/` and `reports/` hold no files, so git does not list them (this notes file will be the first). None of these are app code. `.pytest_cache/` and `.env` are already ignored.

### Cited Findings
- `git status --short` shows only `?? .claude/` and `?? docs/prompts/`. — local git
- `.claude/launch.json` is a Claude Code preview config: it runs `python nelle2/server.py` on port 8000. — local file
- `docs/prompts/hand-gestures.md` is the build prompt used for the hand-gesture feature: branch rules, privacy rules ("Camera frames never leave the device"), and design constraints. — local file
- `reports/` is empty, and `research_notes/` holds only the empty "Nelle AI remaining work" folder (before this file). — `ls -R`
- `.gitignore` covers `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.venv/` and `.env`. — [.gitignore](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/.gitignore)
- Two MP3 files are tracked: `nelle2/test.mp3` and `nelle2/voice.mp3`. — `git ls-files`

### Inferences
- `.claude/`, `research_notes/` and `reports/` are tooling and personal working notes, so adding them to `.gitignore` is the cleaner choice. `.claude/launch.json` holds nothing secret, but it is editor-specific.
- `docs/prompts/hand-gestures.md` could be committed as design history if wanted. It is harmless (no secrets), but it is optional.
- `nelle2/test.mp3` and `voice.mp3` look like generated artefacts from the original voice loop. Whether they should stay tracked is a judgement call I did not verify.

### Gaps
- I did not check what generates the MP3 files or whether any code reads them.

## How is the app run and deployed? Hosting setup, LICENSE, .env.example, and licence implications of the CrystalizedBall port

### Takeaway
The app runs only locally (`python nelle2/server.py`, bound to 127.0.0.1:8000). There is no deploy or hosting config and no LICENSE file in a public repo. `.env.example` exists. The vendored CrystalizedBall port is under MIT + Commons Clause, and both `crystal.js` and the README credit it.

### Cited Findings
- README run steps: Python 3.10+, internet for the voice, `pip install -r requirements.txt`, `python nelle2/server.py`, open http://127.0.0.1:8000. The mic needs Chrome or Edge. — [README.md](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/README.md)
- `server.py` loads `.env` from the repo root with python-dotenv and calls `uvicorn.run(app, host="127.0.0.1", port=8000)`. The host and port are hard-coded. — [nelle2/server.py](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/nelle2/server.py)
- No Dockerfile, Procfile, render.yaml, fly.toml or vercel.json exist. No LICENSE file exists. The GitHub API reports `license: null` for the public repo. — `ls`; `gh api repos/...`
- `.env.example` is tracked. It has `ANTHROPIC_API_KEY=` (empty) and a commented-out optional `NELLE_MODEL`, and it says to copy it to `.env`, which is git-ignored. — [.env.example](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/.env.example)
- requirements.txt lists fastapi, uvicorn, edge-tts, anthropic and python-dotenv for the web app, plus SpeechRecognition, pyttsx3 and PyAudio for the original voice loop (`nelle2/nelle.py`), all in one file. — [requirements.txt](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/requirements.txt)
- The front end loads ogl 1.0.11 and @mediapipe/tasks-vision 1.2.0 from jsDelivr, the hand-landmarker model from storage.googleapis.com, and fonts from Google Fonts. edge-tts needs the network. — `nelle2/web/crystal.js`, `gestures.js`, `index.html`, `voice.py`
- The `crystal.js` header says it was adapted from React Bits CrystalizedBall, "Copyright (c) 2026 David Haz. MIT + Commons Clause License Condition v1.0". It allows use, modification and distribution "as part of an application, website, or product", requires the notice to be kept, and says the component "may not be sold, sublicensed, or redistributed on its own." The README also credits it ("MIT + Commons Clause, © David Haz"). — [nelle2/web/crystal.js](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/nelle2/web/crystal.js); [README.md](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/README.md)

### Inferences
- With no LICENSE, others have no right to reuse Nelle's own code, even though the repo is public. Choosing a licence for the project's own code is still to do. Whatever licence is chosen, `crystal.js` keeps its MIT + Commons Clause terms. A note saying so (for example in the LICENSE or README) would avoid confusion. Commons Clause also means the project cannot be sold in a way that mainly sells the ball component on its own.
- Hosting it for someone else would need at least: a configurable host/port (for example from a `PORT` env var and `0.0.0.0`), a deploy config, and a server-side API key with some form of rate limiting, because `/api/chat` would spend the owner's Anthropic credit. HTTPS is also needed for the camera and mic in browsers.
- PyAudio in the main requirements.txt often fails to install without PortAudio build tools (common on Windows/macOS). It is only needed for the old voice loop, so splitting it out would make first-time setup of the web app easier. This is unverified on a clean machine.

### Gaps
- I did not test a clean install (`pip install -r requirements.txt`) on a fresh machine.
- I found no deploy target or hosting decision recorded anywhere in the repo.

## Does the app work without an API key, and what does a new user need for full AI answers?

### Takeaway
Yes. With no key, `brain.py` uses an `OfflineProvider` with simple built-in replies. Commands and exact calculations still work, and any failed Claude call also falls back to offline. For full answers, a user copies `.env.example` to `.env`, adds an Anthropic API key and restarts. The status pill then changes from OFFLINE to CLAUDE.

### Cited Findings
- `brain.py` docstring: with a key it calls the model, otherwise it uses an offline responder, "so the app, the tests and CI all work with no secrets." — [nelle2/brain.py](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/nelle2/brain.py)
- Provider choice: if `ANTHROPIC_API_KEY` is set, it builds `ClaudeProvider(os.environ.get("NELLE_MODEL", DEFAULT_MODEL))`. If that fails it logs and uses `OfflineProvider`. A model call that fails at runtime is answered offline ("Model call failed; answering offline"). Reply sources are "claude", "offline", "command" or "calc". — nelle2/brain.py lines 62, 172-178, 213-214
- `DEFAULT_MODEL = "claude-opus-5-5"`. The `anthropic` package is imported lazily, so offline mode and the tests do not need it. — nelle2/brain.py lines 24, 102
- An offline reply tells the user to "Add an Anthropic API key to the .env file". — nelle2/brain.py lines 150-151
- README "Add the AI (optional)": copy `.env.example` to `.env`, put the key after `ANTHROPIC_API_KEY=`, restart, and the pill changes from `OFFLINE` to `CLAUDE`. — [README.md](https://github.com/rohanjaswara88-art/nelle-AI/blob/feat/hand-gestures/README.md)

### Inferences
- "Offline mode" means only that no Claude call is made. The voice (edge-tts), the plasma-ball library, MediaPipe and the fonts still need internet, as the README says for the voice.
- A new user needs their own Anthropic account and API key, since the app runs on their machine with their key.

### Gaps
- I did not run the app, so offline behaviour and the OFFLINE/CLAUDE pill were not checked live. The `.env` contents were not read, so I do not know whether a key is configured locally.
