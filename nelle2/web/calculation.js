// Calculation animation. While Nelle works a sum out, maths glyphs orbit the ball and scramble.
// When the answer arrives, the numbers from the question drift in above the ball, fly into it one
// by one, the ball flares, and the result counts up in its centre before fading away.

const GLYPHS = "0123456789+−×÷=%√^";
const GLYPH_COUNT = 14;
const LOOKS_LIKE_MATH =
  /\d\s*(?:[-+*/x×÷^%]|plus|minus|times|divided|percent|mod|to the power|squared|cubed)\s*(?:[\d(.-]|of|$)|square root|sqrt|√\s*\d/i;

const TAU = Math.PI * 2;
const HOLD_SECONDS = 5;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const rand = (a, b) => a + Math.random() * (b - a);
const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

/** A quick client-side guess, so the animation can start before the server answers. */
export const looksLikeMath = (text) => LOOKS_LIKE_MATH.test(text);

export class CalcFx {
  constructor(root, stage) {
    this.root = root;
    this.stage = stage;
    this.run = null;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  get active() {
    return Boolean(this.run);
  }

  /** Begin the "working it out" orbit. */
  start() {
    this.clear();
    const glyphs = Array.from({ length: GLYPH_COUNT }, (_, i) => ({
      el: this.make("calc-glyph", glyph()),
      angle: (i / GLYPH_COUNT) * TAU,
      radius: rand(1.2, 1.36),
      swap: rand(0, 0.15),
      bob: rand(0, TAU),
    }));
    this.run = { t: 0, glyphs, tokens: [], spin: 0 };
    this.stage.setCalculating(true);
  }

  /** The answer arrived. Resolves once the result has landed in the ball. */
  resolve(calc) {
    if (!this.run || this.run.calc) this.start();
    const run = this.run;
    const quick = this.reducedMotion ? 0.15 : 1;
    run.calc = calc;
    run.absorbAt = run.t;
    run.tokens = calc.tokens.map((text) => ({ el: this.make("calc-token", text) }));
    run.flyAt = run.t + 0.55 * quick;
    run.stagger = 0.07 * quick;
    run.flyTime = 0.6 * quick;
    run.landAt = run.flyAt + run.stagger * (run.tokens.length - 1) + run.flyTime;
    run.decimals = (calc.result.split(".")[1] || "").length;
    return new Promise((resolve) => (run.onLanded = resolve));
  }

  /** Fade everything out quickly (interrupt, or the server didn't see a sum after all). */
  cancel() {
    if (!this.run || this.run.leaving !== undefined) return;
    this.run.leaving = this.run.t;
    this.run.leaveTime = 0.3;
    this.run.onLanded?.();
    this.stage.setCalculating(false);
  }

  clear() {
    this.run?.onLanded?.();
    this.root.replaceChildren();
    this.run = null;
  }

  make(className, text) {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    this.root.append(el);
    return el;
  }

  /** Called once per frame from the stage loop. */
  tick(dt, { anchors }) {
    const run = this.run;
    if (!run) return;
    run.t += dt;
    const t = run.t;
    const [cx, cy] = anchors.center;
    const R = anchors.radius;
    const leave = run.leaving === undefined ? 1 : 1 - clamp01((t - run.leaving) / run.leaveTime);

    // 1. glyphs orbit, scramble, then spiral into the ball once the answer is known
    const absorb = run.absorbAt === undefined ? 0 : easeInOut(clamp01((t - run.absorbAt) / 0.75));
    run.spin += dt * (0.7 + absorb * 3);
    for (const g of run.glyphs) {
      g.swap -= dt;
      if (g.swap < 0 && absorb < 0.6) {
        g.el.textContent = glyph();
        g.swap = rand(0.08, 0.18);
      }
      const a = g.angle + run.spin;
      const r = R * g.radius * (1 - absorb * 0.95) + Math.sin(t * 1.6 + g.bob) * 4;
      const alpha = clamp01(t / 0.5) * 0.85 * (1 - absorb) * leave;
      place(g.el, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.92, 1 - absorb * 0.5, alpha);
    }

    // 2. the question's tokens appear above the ball, then fly into it one after another
    if (run.tokens.length) {
      const gap = 12;
      const widths = run.tokens.map((tok) => (tok.width ??= tok.el.offsetWidth));
      const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
      const fit = Math.min(1, (innerWidth * 0.9) / total);
      let x = cx - (total * fit) / 2;
      const y = Math.max(96, cy - R * 1.32);
      run.tokens.forEach((tok, i) => {
        const homeX = x + (widths[i] * fit) / 2;
        x += (widths[i] + gap) * fit;
        const appear = easeOut(clamp01((t - run.absorbAt - i * 0.05) / 0.35));
        const fly = easeInOut(clamp01((t - run.flyAt - i * run.stagger) / run.flyTime));
        const px = homeX + (cx - homeX) * fly;
        const py = y + 8 * (1 - appear) + (cy - y) * fly - Math.sin(fly * Math.PI) * R * 0.18;
        const alpha = appear * (1 - clamp01((fly - 0.7) / 0.3)) * leave;
        place(tok.el, px, py, fit * (1 - fly * 0.65), alpha);
      });
    }

    // 3. landing: the ball flares and the result counts up in its centre
    if (run.landAt !== undefined && t >= run.landAt && !run.result && run.leaving === undefined) {
      run.result = this.make("calc-result", "0");
      run.expression = this.make("calc-expr", run.calc.expression);
      run.resultAt = t;
      this.stage.absorb();
      run.onLanded?.();
      run.onLanded = null;
    }
    if (run.result) {
      const count = easeOut(clamp01((t - run.resultAt) / (this.reducedMotion ? 0.01 : 0.9)));
      const pop = easeOutBack(clamp01((t - run.resultAt) / 0.45));
      const fade = 1 - clamp01((t - run.resultAt - HOLD_SECONDS) / 0.8);
      const alpha = clamp01((t - run.resultAt) / 0.25) * fade * leave;
      run.result.textContent = count < 1 ? format(run.calc.value * count, run.decimals) : run.calc.result;
      run.result.style.fontSize = `${Math.round(Math.max(30, R * 0.38))}px`;
      const rise = (1 - fade) * 12;
      place(run.result, cx, cy - rise, 0.6 + 0.4 * pop, alpha);
      place(run.expression, cx, cy + Math.max(30, R * 0.38) * 0.75 - rise, 1, alpha * 0.92);
      if (fade <= 0) this.clear();
    }

    if (run.leaving !== undefined && leave <= 0) this.clear();
  }
}

function place(el, x, y, scale, alpha) {
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
  el.style.opacity = alpha.toFixed(3);
}

function format(value, decimals) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}
