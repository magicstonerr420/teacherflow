/** Print a single element, hiding the rest of the application. */
export function printElement(el: HTMLElement | null) {
  if (typeof window === "undefined") return;
  if (!el) {
    window.print();
    return;
  }
  el.classList.add("print-target");
  document.body.classList.add("print-scoped");

  const cleanup = () => {
    el.classList.remove("print-target");
    document.body.classList.remove("print-scoped");
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  try {
    window.print();
  } finally {
    window.setTimeout(cleanup, 1500);
  }
}
