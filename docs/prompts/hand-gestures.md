# Prompt: hand-gesture reactions for Nelle

Build a hand-gesture feature for Nelle AI in `C:\Users\ROHAN\projects\nelle-AI`. Nelle uses the laptop camera to see the user's hand, and the plasma sphere reacts with animations.

## Ground rules
- Work on a new branch off `feat/emotional-avatar`, called `feat/hand-gestures`. Open a PR into `feat/emotional-avatar`. Never push to `main`.
- Everything runs in the browser. Camera frames never leave the device and are never sent to the server or saved.
- Keep all existing features, commands and pytest tests working. The Python server should need no changes.
- Keep the front end as plain ES modules, matching the existing code in `nelle2/web/`. Read `stage.js`, `crystal.js` (the React Bits CrystalizedBall port, which has `kick`, `surge` and `arc`), `constellation.js` and `app.js` first, and reuse their patterns.
- Use a single requestAnimationFrame loop: hook into `stage.onFrame`, not a new loop. Pause tracking while the tab is hidden.
- Use conventional commit messages (`feat:`, `fix:`, `docs:`). Never print or commit secrets.

## Camera and tracking
- Use MediaPipe **Hand Landmarker** (`@mediapipe/tasks-vision`). Load it from jsDelivr with an exact, pinned version, in `VIDEO` mode, with `numHands: 1` and GPU delegate (fall back to CPU).
- Add a **Camera** glass pill button to the top bar, next to Voice. It is off by default and the choice is remembered in localStorage.
  - Turning it on calls `getUserMedia` (front camera, 640×480).
  - If the user denies it or there is no camera, show a friendly toast and set the button back to off.
- Add a small mirrored preview, about 160px wide, in the bottom-left corner. It shows the camera with the 21 hand points and their connecting lines drawn in pink on top. Clicking it hides or shows the video.
- Run detection on every other frame, about 30 fps, to save CPU.
- Mirror the x axis so moving the hand right means right on screen.
- New file: `nelle2/web/gestures.js`. It exports a `GestureTracker` class that emits events: `gesture` (with a name) and `move` (with x, y and velocity).

## Gesture detection (must be precise)
Decide each finger as extended or folded from the landmarks:
- **Fingers:** the tip is farther from the wrist than the PIP joint, by a margin.
- **Thumb:** use the tip versus IP-joint distance from the index MCP, so it works for both hands.

A gesture only fires when **all** of these hold:
- the same pose is seen in **6 frames in a row** (about 200 ms)
- detection confidence is ≥ 0.7
- the same gesture has not fired in the last **2.5 s**

Show the pose again after the cooldown to fire it again. Release means the pose is gone for 5 frames.

| Pose | Rule |
|---|---|
| `two` | index and middle extended; ring and pinky folded; thumb any |
| `five` | all five extended, spread (index and pinky tips farther apart than the palm width) |
| `thumbsUp` | thumb extended and pointing up (tip y well above the thumb MCP); the other four folded |

Hand movement (`move`) is continuous, not a gesture. Track the palm centre (the average of the wrist and the four finger MCPs) and smooth it with an exponential filter. Use a dead zone so small jitter does nothing.

## Animations (in `stage.js`, `crystal.js` and `constellation.js`)
1. **Two fingers → flower bloom.**
   - The constellation points fly into a flower: 6 to 8 petals as closed curves around a small centre ring.
   - The petals unfold outward one after another over about 1.2 s, with lines drawing in.
   - The ball surges, with soft arcs around the rim.
   - Hold for about 2.5 s, then morph back to the current topic shape.
2. **Five fingers → smile face.**
   - The points form a cute smiling face: round outline, two curved happy eyes `^ ^` and a wide smile arc.
   - The mood blends briefly to `happy`.
   - One playful kick to the plasma dust.
   - Hold for about 2.5 s, then return to normal (the previous mood and topic shape).
3. **Thumbs up → "HI BRO" in pink particles.**
   - The text is spelled out with the sphere's pink particles inside the ball. Build a constellation shape from the letters: each letter as strokes on a simple grid, scaled to fit the ball width so it fits on mobile too.
   - The particles stream in from the dust, the text glows and holds for about 2.5 s, then the particles scatter back.
   - Write the letter shapes as a small reusable stroke font, so more words can be added later.
4. **Hand movement → particles follow.**
   - Moving the hand left or right pushes the plasma dust inside the sphere the same way: use `ball.kick(dx, dy, strength)` scaled by hand velocity, plus a gentle steady lean toward the hand position.
   - A fast wave (direction changing quickly 2 or more times) also makes ripples across the dust.
   - This must feel smooth and immediate, with no stutter. It works at the same time as the gestures and never fights them.

All gesture shapes must:
- scale with the ball radius, so they fit any screen size
- respect `prefers-reduced-motion` with shorter, calmer versions
- be ignored if a gesture is already playing, so they never stack

## Make it easy to add more later
Use a single registry in `gestures.js`, like `{ name, detect(landmarks) }` mapped to an action in `app.js`. A new gesture should be one rule plus one animation function.

## Testing
- Add a pure-function module for the pose rules. Test it with Node's built-in `node --test` using recorded landmark arrays: positives for each pose and near-miss negatives (for example three fingers is not `two`).
- Document the command in the README.
- Add a debug overlay, turned on with `?debug=gestures`, that shows the live finger states and the detected pose.
- Test in Chrome with a real camera: each gesture 10 times, plus false triggers while typing or with no hand in view.
- Report accuracy honestly.
- Check that the frame rate stays smooth (about 60 fps) with the camera on.
- Update the README with how to use the feature and a privacy note.
- Open the PR with screenshots or a short GIF of each animation.
