export function createTooltip(element) {
  function move(event) {
    const offset = 18;
    const maxX = window.innerWidth - element.offsetWidth - 12;
    const maxY = window.innerHeight - element.offsetHeight - 12;
    const x = Math.min(event.clientX + offset, maxX);
    const y = Math.min(event.clientY + offset, maxY);
    element.style.transform = `translate(${x}px, ${y}px)`;
  }

  return {
    show(html, event) {
      element.innerHTML = html;
      element.classList.add("is-visible");
      element.setAttribute("aria-hidden", "false");
      move(event);
    },

    move,

    hide() {
      element.classList.remove("is-visible");
      element.setAttribute("aria-hidden", "true");
    },
  };
}
