// Scrolling with the hand: hold up three fingers and move the hand up or down. The conversation
// scrolls the same way (hand down = scroll down), and keeps gliding briefly after you stop, like a
// flick on a touchpad. Driven from the stage's animation loop (tick), fed by tracker "scroll" events.

const GAIN = 2.4; // a hand speed of one frame height per second scrolls this many viewports per second
const FOLLOW_RATE = 16; // how fast the scroll speed catches up with the hand (per second)
const GLIDE_SECONDS = 0.35; // momentum after letting go
const MIN_SPEED = 4; // px per second: slower than this counts as stopped
const MIN_VIEWPORT = 480; // px: on a short panel, still scroll a useful distance

export class HandScroller {
  constructor(target, cue) {
    this.target = target;
    this.cue = cue;
    this.active = false;
    this.goal = 0; // px per second the hand is asking for
    this.speed = 0; // px per second actually applied
    this.carry = 0; // sub-pixel remainder, so slow scrolls don't stall
  }

  /** A tracker "scroll" event: { vy } while three fingers are up, null when they go down. */
  update(event) {
    this.active = Boolean(event);
    this.goal = event ? event.vy * GAIN * Math.max(this.target.clientHeight, MIN_VIEWPORT) : 0;
    document.body.classList.toggle("hand-scrolling", this.active);
  }

  /** Called every animation frame. */
  tick(dt) {
    if (this.active) {
      this.speed += (this.goal - this.speed) * (1 - Math.exp(-FOLLOW_RATE * dt));
    } else {
      this.speed *= Math.exp(-dt / GLIDE_SECONDS);
    }
    if (Math.abs(this.speed) < MIN_SPEED) {
      this.speed = this.active ? this.speed : 0;
      this.showDirection(0);
      return;
    }
    const { target } = this;
    const max = target.scrollHeight - target.clientHeight;
    const before = target.scrollTop;
    this.carry += this.speed * dt;
    const whole = Math.trunc(this.carry);
    this.carry -= whole;
    target.scrollTop = Math.max(0, Math.min(max, before + whole));
    if (target.scrollTop === before && whole !== 0) this.speed = 0; // reached the top or bottom
    this.showDirection(Math.sign(this.speed));
  }

  showDirection(direction) {
    const value = direction > 0 ? "down" : direction < 0 ? "up" : "";
    if (this.cue.dataset.dir !== value) this.cue.dataset.dir = value;
  }
}
