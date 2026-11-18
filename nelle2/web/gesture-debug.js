// Debug overlay for hand tracking, shown with ?debug=gestures. It lists each finger's state, the
// detected pose and confidence, logs fired gestures, and can copy the current landmarks as a JSON
// fixture for tests/js/fixtures/recorded.json.

const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];
const MARK = { extended: "▮", folded: "▯", unsure: "·" };

export function attachGestureDebug(tracker) {
  const panel = document.createElement("aside");
  panel.className = "gesture-debug glass";
  panel.innerHTML = `
    <p class="title">gestures · debug</p>
    <pre class="live">no hand</pre>
    <ol class="fired"></ol>
    <button type="button">Copy landmarks</button>`;
  document.body.append(panel);
  const live = panel.querySelector(".live");
  const fired = panel.querySelector(".fired");
  const copy = panel.querySelector("button");
  let fps = 0;
  let frames = 0;
  let since = performance.now();

  tracker.on("pose", (info) => {
    frames += 1;
    const now = performance.now();
    if (now - since > 1000) {
      fps = Math.round((frames * 1000) / (now - since));
      frames = 0;
      since = now;
    }
    if (!info) {
      live.textContent = `no hand\ndetections ${fps}/s`;
      return;
    }
    const fingers = FINGERS.map((name) => `${name.padEnd(6)} ${MARK[info.states[name]]} ${info.states[name]}`).join("\n");
    live.textContent = `${fingers}\n\npose   ${info.pose ?? "—"}${info.following ? `  · cursor ☝ (thumb ${info.button}, tap ${info.tap.toFixed(2)})` : ""}${info.scrolling ? "  · scrolling ↕" : ""}${info.zooming ? "  · zoom 👌" : ""}${info.quiet ? " (typing, ignored)" : ""}\nside   ${info.score.toFixed(2)} · ${info.world ? "3D" : "2D"}\ndetections ${fps}/s · ${info.detectMs.toFixed(1)} ms`;
  });

  tracker.on("gesture", ({ name }) => {
    const item = document.createElement("li");
    item.textContent = `${new Date().toLocaleTimeString()}  ${name}`;
    fired.prepend(item);
    while (fired.children.length > 8) fired.lastChild.remove();
  });

  copy.addEventListener("click", async () => {
    const hand = tracker.lastHand;
    if (!hand) {
      copy.textContent = "No hand in view";
      return;
    }
    const expect = window.prompt("Which pose is this? (two, five, thumbsUp, or leave empty for none)", "") || null;
    const fixture = { name: `recorded/${expect ?? "none"}/${Date.now()}`, expect, landmarks: hand.map(({ x, y, z }) => ({ x, y, z })) };
    try {
      await navigator.clipboard.writeText(JSON.stringify(fixture));
      copy.textContent = "Copied ✓";
    } catch {
      console.log(JSON.stringify(fixture));
      copy.textContent = "Logged to console";
    }
    setTimeout(() => (copy.textContent = "Copy landmarks"), 1500);
  });
}
