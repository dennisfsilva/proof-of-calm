import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

// A table stacks each row's cells when its columns, laid side by side, are wider than its box (docs/DESIGN.md §8,
// docs/research/narrow-tables.md). Every check lays the table out side by side again and measures it then, so
// nothing measured is kept: a width stored from an earlier check goes stale with the rows, the text size and the font.

/** The attribute a stacked table carries; the cells' `in-data-stacked:` utilities read it. */
const STACKED = 'data-stacked';

/** Any short line of text: its width follows the font and the text size. Never shown, never read. */
const RULER = '0123456789 Aa';

/**
 * The table box's width and the text's metrics, for `useStack`: the scroller's first child, a zero-height block as
 * wide as the box, clipping a hidden line of text in the table's type. Neither changes size when the table stacks,
 * so a check run from their ResizeObserver never loops.
 */
function StackProbe({ ref }: { ref: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={ref} aria-hidden className="h-0 overflow-hidden">
      <span className="invisible inline-block whitespace-nowrap text-14">{RULER}</span>
    </div>
  );
}

/**
 * Stacks the table while its columns are wider than its box, when `stack` is on, and reports whether the box
 * still scrolls after the check (`scrolls`). The check removes `data-stacked`, compares the table's width with the
 * probe's in sub-pixels, and sets the attribute when the table is wider, in one task before the frame paints. It
 * runs at mount; when the probe or its ruler changes size (the box's width, a rotation, the text size, a web font);
 * and when the table's rows, text or detail rows' `hidden` change, or an enclosing `<details>` opens or closes. A
 * table that is not rendered (a closed `<details>`) is skipped.
 */
function useStack(stack: boolean) {
  const probe = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const box = probe.current;
    const element = table.current;
    if (box === null || element === null) return;
    const check = () => {
      if (element.checkVisibility?.() === false) return;
      if (stack) {
        element.removeAttribute(STACKED);
        if (element.getBoundingClientRect().width - box.getBoundingClientRect().width > 0.01) {
          element.setAttribute(STACKED, '');
        }
      }
      const scroller = box.parentElement;
      setScrolls(scroller !== null && scroller.scrollWidth > scroller.clientWidth);
    };
    check();
    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null;
    sizes?.observe(box);
    if (box.firstElementChild !== null) sizes?.observe(box.firstElementChild);
    const content = new MutationObserver(check);
    content.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
    const details = element.closest('details');
    if (details !== null) content.observe(details, { attributes: true, attributeFilter: ['open'] });
    return () => {
      sizes?.disconnect();
      content.disconnect();
      element.removeAttribute(STACKED);
    };
  }, [stack]);
  return { probe, table, scrolls };
}

export { StackProbe, useStack };
