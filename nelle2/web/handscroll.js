// Scrolling with the hand: hold up three fingers and tilt them (or move the hand) up or down. The
// conversation moves with the fingertips like a mouse: a small movement is a small scroll, a quick
// flick goes further, and it stops the moment the fingers stop. Letting go after a flick glides on
// briefly. Driven from the stage's animation loop (tick), fed by tracker "scroll" events.

const CATCH_UP_RATE = 30; // per second: each camera frame's distance is drawn smoothly over ~2 frames
const GLIDE_SECONDS = 0.25; // momentum after letting go
const MIN_GLIDE_SPEED = 60; // px per second: slower than this when letting go means no glide

export class HandScroller {
  constructor(target, cue) {
    this.target = target;
    this.cue = cue;
    this.active = false;
    this.pending = 0; // px still to scroll from fingertip movement
    this.glide = 0; // px per second after letting go
    this.velocity = 0; // the fingers' latest speed, px per second
    this.carry = 0; // sub-pixel remainder, so slow scrolls don't stall
  }

  /** A tracker "scroll" event: { dy, vy } while three fingers are up, null when they go down. */
  update(event) {
    const was = this.active;
    this.active = Boolean(event);
    if (event) {
      this.pending += event.dy;
      this.velocity = event.vy;
      this.glide = 0;
    } else if (was) {
      this.glide = Math.abs(this.velocity) >= MIN_GLIDE_SPEED ? this.velocity : 0;
      this.velocity = 0;
    }
    document.body.classList.toggle("hand-scrolling", this.active);
  }

  /** Called every animation frame. */
  tick(dt) {
    const take = this.pending * (1 - Math.exp(-CATCH_UP_RATE * dt));
    this.pending -= take;
    if (Math.abs(this.pending) < 0.05) this.pending = 0;
    this.glide *= Math.exp(-dt / GLIDE_SECONDS);
    if (Math.abs(this.glide) < 5) this.glide = 0;
    const step = take + this.glide * dt;
    if (Math.abs(step) < 1e-3 && !this.pending) {
      this.showDirection(0);
      return;
    }
    const { target } = this;
    const max = target.scrollHeight - target.clientHeight;
    const before = target.scrollTop;
    this.carry += step;
    const whole = Math.trunc(this.carry);
    this.carry -= whole;
    target.scrollTop = Math.max(0, Math.min(max, before + whole));
    if (target.scrollTop === before && whole !== 0) {
      // reached the top or bottom: drop the rest so it doesn't fire later in the other direction
      this.pending = 0;
      this.glide = 0;
      this.carry = 0;
    }
    this.showDirection(Math.sign(step));
  }

  showDirection(direction) {
    const value = direction > 0 ? "down" : direction < 0 ? "up" : "";
    if (this.cue.dataset.dir !== value) this.cue.dataset.dir = value;
  }
}
