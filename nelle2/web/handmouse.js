// The hand mouse: a cursor inside the Nelle page, driven by the pointing index finger.
//
//   move         point like a finger gun 👉, thumb up; the cursor follows the fingertip
//   click        drop the thumb against the side of the pointing finger, lift it again
//   double-click two quick taps (selects a word)
//   drag/select  hold the thumb down and move: selects text in the conversation
//   right-click  hold the thumb down without moving: Nelle's menu (copy, ask Nelle, select all)
//   zoom         OK sign 👌 moved up (bigger text) or down (smaller), see zoom()
//
// A web page can't move the real mouse, so everything happens on this page: clicks press buttons
// and links, focus the message box, select text and kick the sphere where you tap it.

import { OneEuroFilter } from "./poses.js";

// The middle part of the camera frame maps to the whole window, so the edges are easy to reach.
export const ACTIVE_BOX = { left: 0.2, right: 0.8, top: 0.12, bottom: 0.68 };

export const LONG_PRESS_MS = 650; // held this long without moving: right-click
export const DOUBLE_MS = 450; // a second click within this long and DOUBLE_PX: double-click
export const DOUBLE_PX = 40;
export const DRAG_PX = 22; // moved this far while held: a drag (text selection)
export const PRESS_LOOKBACK_MS = 90; // the thumb drags the fingertip as it drops; click where it was

/** Map the mirrored index fingertip (0..1 camera space) to window pixels through ACTIVE_BOX. */
export function cursorToScreen(tip, width, height, box = ACTIVE_BOX) {
  const u = (tip.x - box.left) / (box.right - box.left);
  const v = (tip.y - box.top) / (box.bottom - box.top);
  return {
    x: Math.max(0, Math.min(1, u)) * (width - 1),
    y: Math.max(0, Math.min(1, v)) * (height - 1),
  };
}

/**
 * Turns the thumb button ("down"/"up") and the cursor position into mouse events:
 * press, click, double, dragstart, drag, dragend, right, cancel. The button only works once it
 * has been seen up after pointing starts ("armed"), so pointing with a tucked thumb never clicks.
 */
export class ClickGate {
  constructor() {
    this.reset();
    this.lastClick = null;
  }

  reset() {
    this.armed = false;
    this.press = null; // { x, y, time, moved, long }
  }

  /** Call on every tracked frame. Returns a list of { type, x, y } events. */
  update(button, pos, now) {
    const events = [];
    if (button === "up") {
      if (this.press) events.push(...this.release(pos, now));
      this.armed = true;
      return events;
    }
    if (!this.armed) return events;
    if (!this.press) {
      this.press = { x: pos.x, y: pos.y, time: now, moved: false, long: false };
      events.push({ type: "press", x: pos.x, y: pos.y });
      return events;
    }
    return events.concat(this.hold(pos, now));
  }

  /** Time passing without a new frame still turns a still hold into a right-click. */
  tick(pos, now) {
    return this.press ? this.hold(pos, now) : [];
  }

  hold(pos, now) {
    const press = this.press;
    if (press.long) return [];
    if (!press.moved && Math.hypot(pos.x - press.x, pos.y - press.y) > DRAG_PX) {
      press.moved = true;
      return [
        { type: "dragstart", x: press.x, y: press.y },
        { type: "drag", x: pos.x, y: pos.y },
      ];
    }
    if (press.moved) return [{ type: "drag", x: pos.x, y: pos.y }];
    if (now - press.time >= LONG_PRESS_MS) {
      press.long = true;
      return [{ type: "right", x: press.x, y: press.y }];
    }
    return [];
  }

  release(pos, now) {
    const press = this.press;
    this.press = null;
    if (press.moved) return [{ type: "dragend", x: pos.x, y: pos.y }];
    if (press.long) return [];
    const events = [{ type: "click", x: press.x, y: press.y }];
    const last = this.lastClick;
    if (last && now - last.time <= DOUBLE_MS && Math.hypot(press.x - last.x, press.y - last.y) <= DOUBLE_PX) {
      events.push({ type: "double", x: press.x, y: press.y });
      this.lastClick = null;
    } else {
      this.lastClick = { x: press.x, y: press.y, time: now };
    }
    return events;
  }

  /** The hand went away mid-press: end a drag where it is, drop anything else. */
  cancel(pos) {
    const press = this.press;
    this.reset();
    return press?.moved ? [{ type: "dragend", x: pos.x, y: pos.y }] : press ? [{ type: "cancel" }] : [];
  }

  /** 0..1 progress of a still hold toward a right-click, for the cursor's ring. */
  holdProgress(now) {
    const press = this.press;
    if (!press || press.moved || press.long) return 0;
    return Math.min(1, (now - press.time) / LONG_PRESS_MS);
  }
}

const CLICKABLE = "button, a[href], [role='button'], summary, label, select, input:not([type='text'])";
const TYPABLE = "textarea, input[type='text'], input:not([type]), [contenteditable='true']";
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.8;
const ZOOM_PX = 1200; // OK-sign movement in scroll pixels for each doubling of the text size

function caretAt(x, y) {
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
  }
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

export class HandMouse {
  /**
   * stage: for the sphere's reaction; ask(text): send a message to Nelle; toast(text); zoomTarget:
   * the element whose text size the OK sign changes; zoomCue: its "Text 120%" badge.
   */
  constructor({ stage, ask, toast, zoomTarget, zoomCue, storage }) {
    this.stage = stage;
    this.ask = ask;
    this.toast = toast;
    this.zoomTarget = zoomTarget;
    this.zoomCue = zoomCue;
    this.storage = storage;
    this.gate = new ClickGate();
    this.fx = new OneEuroFilter({ minCutoff: 1.2, beta: 0.012, dCutoff: 1 });
    this.fy = new OneEuroFilter({ minCutoff: 1.2, beta: 0.012, dCutoff: 1 });
    this.pos = null; // filtered cursor, px
    this.velocity = { x: 0, y: 0 };
    this.history = []; // recent positions, to click where the finger was before the thumb dropped
    this.button = "up";
    this.hovered = null;
    this.selectFrom = null;
    this.zoomLevel = Number(storage?.get("nelle.zoom")) || 1;
    this.zoomTimer = 0;

    this.cursor = document.createElement("div");
    this.cursor.className = "hand-cursor";
    this.cursor.setAttribute("aria-hidden", "true");
    this.cursor.innerHTML = '<span class="ring"></span><span class="dot"></span>';
    document.body.append(this.cursor);

    this.menu = this.buildMenu();
    document.addEventListener("keydown", (event) => event.key === "Escape" && this.closeMenu());
    document.addEventListener("pointerdown", (event) => {
      if (event.isTrusted && !this.menu.contains(event.target)) this.closeMenu();
    });
    this.applyZoom();
  }

  get active() {
    return this.pos !== null;
  }

  /** A tracker "move" event while pointing ({ tip, thumb button, ... }), or null when it stops. */
  update(move) {
    const now = performance.now();
    if (!move) {
      if (this.pos) this.run(this.gate.cancel(this.pos));
      this.gate.reset();
      this.pos = null;
      this.history = [];
      this.fx.reset();
      this.fy.reset();
      this.setHover(null);
      this.cursor.classList.remove("on", "pressed", "dragging");
      this.stage.handCursor(null);
      return;
    }
    const raw = cursorToScreen(move.tip, innerWidth, innerHeight);
    const pressed = this.gate.press !== null;
    // while the thumb is down and the hand hasn't really moved, hold the cursor still: dropping
    // the thumb tugs the fingertip, and a click shouldn't slide off its button
    const target = pressed && !this.gate.press.moved ? this.frozen(raw) : raw;
    const x = this.fx.filter(target.x, now / 1000);
    const y = this.fy.filter(target.y, now / 1000);
    if (this.pos) {
      const dt = Math.max(1e-3, (now - this.lastTime) / 1000);
      this.velocity = { x: (x - this.pos.x) / dt, y: (y - this.pos.y) / dt };
    }
    this.pos = { x, y };
    this.lastTime = now;
    this.history.push({ x, y, time: now });
    while (this.history.length && now - this.history[0].time > 400) this.history.shift();

    this.button = move.button;
    const at = this.button === "down" && !pressed ? this.lookback(now) : this.pos;
    this.run(this.gate.update(this.button, at, now));
    this.cursor.classList.add("on");
    this.setHover(this.clickableAt(x, y));
    this.stage.handCursor({ x, y, vx: this.velocity.x, vy: this.velocity.y });
  }

  /** Every animation frame: draw the cursor and let a still hold become a right-click. */
  tick() {
    if (!this.pos) return;
    const now = performance.now();
    this.run(this.gate.tick(this.pos, now));
    const { style, classList } = this.cursor;
    style.transform = `translate(${this.pos.x}px, ${this.pos.y}px)`;
    style.setProperty("--hold", this.gate.holdProgress(now).toFixed(3));
    classList.toggle("pressed", this.gate.press !== null);
    classList.toggle("dragging", Boolean(this.gate.press?.moved));
    classList.toggle("ready", this.gate.armed);
  }

  frozen(raw) {
    const press = this.gate.press;
    return Math.hypot(raw.x - press.x, raw.y - press.y) > DRAG_PX * 1.5 ? raw : { x: press.x, y: press.y };
  }

  lookback(now) {
    const before = this.history.find((h) => now - h.time <= PRESS_LOOKBACK_MS);
    return before ?? this.pos;
  }

  run(events) {
    for (const event of events) this[`on${event.type[0].toUpperCase()}${event.type.slice(1)}`]?.(event);
  }

  // ---------- what each event does ----------

  elementAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && !this.cursor.contains(el) ? el : null;
  }

  clickableAt(x, y) {
    const el = this.elementAt(x, y);
    return el?.closest(`${CLICKABLE}, ${TYPABLE}`) ?? null;
  }

  setHover(el) {
    if (el === this.hovered) return;
    this.hovered?.classList.remove("hand-hover");
    el?.classList.add("hand-hover");
    this.hovered = el;
    this.cursor.classList.toggle("over", Boolean(el));
  }

  onPress() {
    this.cursor.classList.add("pressed");
  }

  onClick({ x, y }) {
    this.pulse();
    const el = this.elementAt(x, y);
    if (!el) return;
    if (!this.menu.contains(el)) this.closeMenu();
    const typable = el.closest(TYPABLE);
    if (typable) {
      typable.focus();
      return;
    }
    const clickable = el.closest(CLICKABLE);
    if (clickable) {
      clickable.click();
      return;
    }
    if (el.closest("#ball")) {
      // tap the sphere: the same jolt a real mouse click gives it
      el.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
      return;
    }
    getSelection()?.removeAllRanges();
  }

  onDouble({ x, y }) {
    const caret = caretAt(x, y);
    const selection = getSelection();
    if (!caret || !selection?.modify) return;
    selection.collapse(caret.node, caret.offset);
    selection.modify("move", "backward", "word");
    selection.modify("extend", "forward", "word");
  }

  onDragstart({ x, y }) {
    this.closeMenu();
    const el = this.elementAt(x, y);
    this.selectFrom = el && !el.closest(`${CLICKABLE}, ${TYPABLE}, #ball`) ? caretAt(x, y) : null;
  }

  onDrag({ x, y }) {
    if (!this.selectFrom) return;
    const caret = caretAt(x, y);
    if (!caret) return;
    try {
      getSelection().setBaseAndExtent(this.selectFrom.node, this.selectFrom.offset, caret.node, caret.offset);
    } catch {
      // the caret landed somewhere unselectable (like a canvas); keep the last good selection
    }
  }

  onDragend() {
    this.selectFrom = null;
  }

  onRight({ x, y }) {
    this.pulse();
    this.openMenu(x, y);
  }

  pulse() {
    this.cursor.classList.remove("clicked");
    void this.cursor.offsetWidth; // restart the animation
    this.cursor.classList.add("clicked");
  }

  // ---------- Nelle's right-click menu ----------

  buildMenu() {
    const menu = document.createElement("div");
    menu.className = "hand-menu glass";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    const items = [
      ["copy", "Copy"],
      ["ask", "Ask Nelle about this"],
      ["all", "Select all messages"],
      ["clear", "Clear selection"],
    ];
    for (const [action, label] of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = action;
      button.setAttribute("role", "menuitem");
      button.textContent = label;
      button.addEventListener("click", () => this.menuAction(action));
      menu.append(button);
    }
    document.body.append(menu);
    return menu;
  }

  openMenu(x, y) {
    const text = getSelection()?.toString().trim() ?? "";
    for (const button of this.menu.querySelectorAll("button")) {
      button.disabled = ["copy", "ask", "clear"].includes(button.dataset.action) && !text;
    }
    this.menu.hidden = false;
    const { width, height } = this.menu.getBoundingClientRect();
    this.menu.style.left = `${Math.min(x + 6, innerWidth - width - 8)}px`;
    this.menu.style.top = `${Math.min(y + 6, innerHeight - height - 8)}px`;
  }

  closeMenu() {
    this.menu.hidden = true;
  }

  async menuAction(action) {
    const selection = getSelection();
    const text = selection?.toString().trim() ?? "";
    this.closeMenu();
    if (action === "copy" && text) {
      try {
        await navigator.clipboard.writeText(text);
        this.toast("Copied.");
      } catch {
        this.toast("The browser blocked copying. Press Ctrl+C instead.");
      }
    } else if (action === "ask" && text) {
      selection.removeAllRanges();
      this.ask(`About this: "${text.slice(0, 600)}"`);
    } else if (action === "all") {
      const log = document.querySelector("#log");
      if (log) selection.selectAllChildren(log);
    } else if (action === "clear") {
      selection.removeAllRanges();
    }
  }

  // ---------- zoom with the OK sign ----------

  /** A tracker "zoom" event: { dy } while the OK sign moves (up is negative), null when it ends. */
  zoom(event) {
    if (!event) {
      this.zoomTimer = setTimeout(() => this.zoomCue?.classList.remove("on"), 900);
      return;
    }
    clearTimeout(this.zoomTimer);
    // hand up (negative dy) makes the text bigger
    const level = this.zoomLevel * Math.pow(2, -event.dy / ZOOM_PX);
    this.zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
    this.applyZoom();
    this.zoomCue?.classList.add("on");
    this.storage?.set("nelle.zoom", this.zoomLevel.toFixed(2));
  }

  applyZoom() {
    this.zoomTarget?.style.setProperty("--chat-zoom", this.zoomLevel.toFixed(3));
    if (this.zoomCue) this.zoomCue.querySelector("span").textContent = `Text ${Math.round(this.zoomLevel * 100)}%`;
  }
}
