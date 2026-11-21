// Spotlight buttons: a soft light follows the pointer inside each top bar button. Only sets two
// CSS variables on pointer movement (no animation loop of its own); ui.css draws the light.

export function spotlight(root) {
  root.addEventListener("pointermove", (event) => {
    const button = event.target.closest(".pill");
    if (!button) return;
    const box = button.getBoundingClientRect();
    button.style.setProperty("--mx", `${event.clientX - box.left}px`);
    button.style.setProperty("--my", `${event.clientY - box.top}px`);
  });
}
