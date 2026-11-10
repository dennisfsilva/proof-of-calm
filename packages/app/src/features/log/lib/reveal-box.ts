// The scroll that shows a box the entry form reveals (an issue, a status line), apart from the form.

/**
 * Scrolls the nearest scrolling ancestor (the sheet) by the least that shows the whole box. Only that one moves: the
 * page's own scroll padding, kept for the tab bar, would also scroll the page behind a sheet. Without one the box
 * scrolls into the page's view.
 */
export function reveal(box: HTMLElement) {
  let scroller = box.parentElement;
  while (scroller !== null && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement;
  }
  if (scroller === null) {
    box.scrollIntoView({ block: 'nearest' });
    return;
  }
  const shown = box.getBoundingClientRect();
  const top = scroller.getBoundingClientRect().top + scroller.clientTop;
  const below = shown.bottom - (top + scroller.clientHeight);
  const above = top - shown.top;
  // Scroll positions snap to whole pixels while the rects are fractional: round the move up, or a sub-pixel of the
  // box (its focus ring) stays outside.
  if (below > 0) scroller.scrollTop += Math.ceil(Math.min(below, Math.max(-above, 0)));
  else if (above > 0) scroller.scrollTop -= Math.ceil(above);
}
