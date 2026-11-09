// Scrolls a box into its scroller's view by the least that shows it whole, inside the scroller's scroll padding (the
// Sheet's is the focus ring's extent and a pixel, docs/DESIGN.md §6). Only the nearest scrolling ancestor moves: the
// page's own scroll padding, kept for the tab bar, would also scroll the page behind a sheet. A box taller than the
// view keeps its top in view. Without a scroller the box scrolls into the page's view.

const pixels = (value: string): number => {
  const parsed = Number(value.trim().replace(/px$/, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** The person's reduced-motion choice: the system's, or the in-app setting on the root (docs/DESIGN.md §6). */
const reducedMotion = (): boolean =>
  document.documentElement.dataset['motion'] === 'reduce' ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function scrollerOf(box: Element): HTMLElement | null {
  let scroller = box.parentElement;
  while (scroller !== null && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement;
  }
  return scroller;
}

/** `smooth` glides there unless the person reduced motion; a focus move scrolls at once, as the browser's own does. */
export function reveal(box: Element, { smooth = false }: { readonly smooth?: boolean } = {}): void {
  const scroller = scrollerOf(box);
  if (scroller === null) {
    box.scrollIntoView({ block: 'nearest' });
    return;
  }
  const style = getComputedStyle(scroller);
  const shown = box.getBoundingClientRect();
  const top = scroller.getBoundingClientRect().top + scroller.clientTop;
  const below = shown.bottom + pixels(style.scrollPaddingBottom) - (top + scroller.clientHeight);
  const above = top + pixels(style.scrollPaddingTop) - shown.top;
  // Scroll positions snap to whole pixels while the rects are fractional: the move rounds up, or a sub-pixel of the
  // box (its focus ring) stays outside.
  const move = below > 0 ? Math.ceil(Math.min(below, Math.max(-above, 0))) : above > 0 ? -Math.ceil(above) : 0;
  if (move !== 0) scroller.scrollBy({ top: move, behavior: smooth && !reducedMotion() ? 'smooth' : 'instant' });
}
