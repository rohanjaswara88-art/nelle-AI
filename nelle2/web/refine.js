// Prompt suggestions: while you type, Nelle offers up to three better versions of your message.
// When you pause, a line of light sweeps across above the input and the suggestions appear behind
// it. Click one (or Tab to it and press Enter) to use it; keep typing or press Esc to ignore them,
// and Enter still sends exactly what you wrote. Driven by events only, no animation loop.

export const PAUSE_MS = 700; // ask once typing pauses this long
export const MIN_CHARS = 6; // shorter drafts get no suggestions
export const MAX_CHARS = 500; // the server's limit

/** Should this draft be sent for suggestions? Not when too short, too long or already asked. */
export function shouldRefine(draft, lastAsked) {
  const text = draft.trim();
  return text.length >= MIN_CHARS && text.length <= MAX_CHARS && text !== lastAsked;
}

/** Tab moves the highlight forward and Shift+Tab back, wrapping; -1 means none highlighted. */
export function nextIndex(current, count, backwards = false) {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? -1 : 1) + count) % count;
}

export class PromptRefiner {
  /**
   * input: the message textarea; box: the element the suggestions are drawn in;
   * fetchSuggestions(text, signal): resolves to { suggestions: [...] }; onPick(text): after a pick.
   */
  constructor({ input, box, fetchSuggestions, onPick }) {
    this.input = input;
    this.box = box;
    this.fetchSuggestions = fetchSuggestions;
    this.onPick = onPick;
    this.timer = 0;
    this.abort = null;
    this.lastAsked = "";
    this.items = [];
    this.highlight = -1;
    this.enabled = true;

    input.addEventListener("input", () => this.schedule());
    // capture: runs before the composer's own Enter handler, so Enter can pick a highlighted one
    input.addEventListener("keydown", (event) => this.onKey(event), { capture: true });
    box.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-index]");
      if (button) this.pick(Number(button.dataset.index));
    });
  }

  get visible() {
    return this.items.length > 0;
  }

  schedule() {
    clearTimeout(this.timer);
    this.abort?.abort();
    this.setHighlight(-1);
    const draft = this.input.value;
    if (!draft.trim() || draft.trim() !== this.lastAsked) this.box.classList.add("stale");
    if (!draft.trim()) return this.hide();
    if (!this.enabled || !shouldRefine(draft, this.lastAsked)) return;
    this.timer = setTimeout(() => this.ask(draft.trim()), PAUSE_MS);
  }

  async ask(draft) {
    this.abort = new AbortController();
    this.lastAsked = draft;
    this.box.classList.add("thinking");
    this.box.hidden = false; // the line shimmers above the input while Nelle thinks of better versions
    try {
      const { suggestions = [] } = await this.fetchSuggestions(draft, this.abort.signal);
      if (this.input.value.trim() !== draft) return; // typed on while we waited: wait for the next pause
      this.show(suggestions);
    } catch (error) {
      if (error.name !== "AbortError") console.warn("Suggestions unavailable:", error);
    } finally {
      this.box.classList.remove("thinking");
      if (!this.items.length) this.box.hidden = true;
    }
  }

  show(suggestions) {
    this.items = suggestions.slice(0, 3);
    this.highlight = -1;
    this.box.replaceChildren();
    if (!this.items.length) return this.hide();
    const label = document.createElement("span");
    label.className = "refine-label mono";
    label.textContent = "Better ways to ask";
    this.box.append(label);
    this.items.forEach((text, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.index = String(index);
      button.style.setProperty("--i", String(index));
      button.textContent = text;
      button.title = "Use this (or keep typing to ignore)";
      this.box.append(button);
    });
    const hint = document.createElement("span");
    hint.className = "refine-hint mono";
    hint.textContent = "Tab to choose · Esc to dismiss";
    this.box.append(hint);
    // restart the sweep: the line runs across, the suggestions appear behind it
    this.box.classList.remove("on", "stale");
    void this.box.offsetWidth;
    this.box.classList.add("on");
    this.box.hidden = false;
  }

  hide() {
    clearTimeout(this.timer);
    this.abort?.abort();
    this.items = [];
    this.highlight = -1;
    this.box.classList.remove("on", "thinking", "stale");
    this.box.hidden = true;
    this.box.replaceChildren();
  }

  /** Forget everything, e.g. after the message is sent. */
  reset() {
    this.hide();
    this.lastAsked = "";
  }

  setHighlight(index) {
    this.highlight = index;
    for (const button of this.box.querySelectorAll("button[data-index]")) {
      button.classList.toggle("active", Number(button.dataset.index) === index);
    }
  }

  pick(index) {
    const text = this.items[index];
    if (text === undefined) return;
    this.input.value = text;
    this.lastAsked = text; // don't immediately suggest improvements to the improvement
    this.hide();
    this.input.focus();
    this.input.setSelectionRange(text.length, text.length);
    this.onPick?.(text);
  }

  onKey(event) {
    if (!this.visible || this.box.classList.contains("stale")) return;
    if (event.key === "Tab") {
      event.preventDefault();
      this.setHighlight(nextIndex(this.highlight, this.items.length, event.shiftKey));
    } else if (event.key === "Enter" && !event.shiftKey && this.highlight >= 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.pick(this.highlight);
    } else if (event.key === "Escape") {
      event.stopPropagation(); // dismiss only; don't also interrupt Nelle
      this.hide();
    }
  }
}
