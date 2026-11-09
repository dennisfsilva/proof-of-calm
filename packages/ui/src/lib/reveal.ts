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

type RevealOptions = {
  /** The scroller to move, when the caller holds it (the Sheet's popup); else the box's nearest scrolling ancestor. */
  readonly scroller?: HTMLElement;
  /** Glides there unless the person reduced motion; a focus move scrolls at once, as the browser's own does. */
  readonly smooth?: boolean;
};

export function reveal(box: Element, { scroller = scrollerOf(box) ?? undefined, smooth = false }: RevealOptions = {}) {
  if (scroller === undefined) {
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

/**
 * The controls where Chromium's focus scroll shows at most the caret's line: the text-entry fields. Nothing else is
 * revealed: the browser scrolls a button or link wholly into view itself, and a heading focused by a sheet's
 * `initialFocus` (a Learn module's section) is placed by the browser's own focus scroll, which WebKit centres; the least
 * scroll would leave it on the bottom edge with its section below the fold (docs/DESIGN.md §8).
 */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * On `focusin`, the least scroll that shows a focused text field and its ring inside the sheet, when the focus shows
 * (`:focus-visible`), measured then (reading the rects lays the page out). Not a frame later: a frame that comes late (a
 * page in the background) would pull the field back after the reader or a script has scrolled away.
 */
export function revealFocusedField(control: Element, scroller: HTMLElement) {
  if (control.matches(TEXT_ENTRY) && control.matches(':focus-visible')) reveal(control, { scroller });
}
