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

/** One table's check: what it measures and the probe's and ruler's sizes its last check saw, as [w, h, w, h]. */
type Check = {
  readonly element: HTMLTableElement;
  readonly box: HTMLDivElement;
  readonly stack: boolean;
  readonly report: (scrolls: boolean) => void;
  sizes: readonly number[] | null;
};

// The checks asked for in one task run together in a microtask, before the frame paints: every read of the
// tables' visibility, then every attribute removed, every width read in one layout, every attribute set, and every
// scroller read. One table after another would lay the page out again for each of them.
const queued = new Set<Check>();

function sizesOf({ box }: Check): number[] {
  const probe = box.getBoundingClientRect();
  const ruler = box.firstElementChild?.getBoundingClientRect();
  return [probe.width, probe.height, ruler?.width ?? 0, ruler?.height ?? 0];
}

function flush() {
  const shown = [...queued].filter((check) => check.element.checkVisibility?.() !== false);
  queued.clear();
  for (const check of shown) if (check.stack) check.element.removeAttribute(STACKED);
  const wider = shown.map((check) => {
    check.sizes = sizesOf(check);
    return check.stack && check.element.getBoundingClientRect().width - (check.sizes[0] ?? 0) > 0.01;
  });
  shown.forEach((check, index) => {
    if (wider[index]) check.element.setAttribute(STACKED, '');
  });
  for (const check of shown) {
    const scroller = check.box.parentElement;
    check.report(scroller !== null && scroller.scrollWidth > scroller.clientWidth);
  }
}

function enqueue(check: Check) {
  if (queued.size === 0) queueMicrotask(flush);
  queued.add(check);
}

// One ResizeObserver for every probe and ruler, so one frame's observations come in one callback. It runs after
// the frame's layout, so its checks read a page already laid out; the first observation of a new probe is the
// mount's check, and one of the sizes the last check saw (a mutation's check ran first) starts none.
const watched = new Map<Element, { check: Check; at: number }>();
let sizes: ResizeObserver | null = null;

function resized(entries: readonly ResizeObserverEntry[]) {
  for (const { target, borderBoxSize, contentRect } of entries) {
    const found = watched.get(target);
    if (found === undefined) continue;
    const { check, at } = found;
    const size = [
      borderBoxSize?.[0]?.inlineSize ?? contentRect.width,
      borderBoxSize?.[0]?.blockSize ?? contentRect.height,
    ];
    if (check.sizes?.[at] !== size[0] || check.sizes?.[at + 1] !== size[1]) queued.add(check);
  }
  flush();
}

function watch(check: Check, targets: readonly Element[]) {
  if (typeof ResizeObserver !== 'function') return null;
  sizes ??= new ResizeObserver(resized);
  const observer = sizes;
  targets.forEach((target, index) => {
    watched.set(target, { check, at: index * 2 });
    observer.observe(target);
  });
  return () => {
    for (const target of targets) {
      watched.delete(target);
      observer.unobserve(target);
    }
    if (watched.size === 0 && sizes === observer) {
      observer.disconnect();
      sizes = null;
    }
  };
}

/**
 * Stacks the table while its columns are wider than its box, when `stack` is on, and reports whether the box
 * still scrolls after the check (`scrolls`). The check removes `data-stacked`, compares the table's width with the
 * probe's in sub-pixels, and sets the attribute when the table is wider, batched with the other tables' checks
 * before the frame paints. It runs at mount, in the probe's first ResizeObserver callback, after the frame's layout
 * (in a microtask where there is no ResizeObserver); when the probe or its ruler changes size from the last check's
 * (the box's width, a rotation, the text size, a web font); and, in a microtask, when the table's rows, text
 * or detail rows' `hidden` change, a `<details>` in it or around it opens or closes, or a table in it stacks or
 * unstacks (its own toggle starts no check). A table that is not rendered (a closed `<details>`) is skipped.
 */
function useStack(stack: boolean) {
  const probe = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const box = probe.current;
    const element = table.current;
    if (box === null || element === null) return;
    const check: Check = { element, box, stack, report: setScrolls, sizes: null };
    const unwatch = watch(check, box.firstElementChild === null ? [box] : [box, box.firstElementChild]);
    if (unwatch === null) enqueue(check);
    // A <details> opening inside the table, or a table inside it stacking, changes its width with no row or text
    // change. The check's own toggle of the table's attribute is no reason to check again, or it would loop.
    const own = (record: MutationRecord) => record.target === element && record.attributeName === STACKED;
    const content = new MutationObserver((records) => {
      if (!records.every(own)) enqueue(check);
    });
    content.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'open', STACKED],
    });
    const details = element.closest('details');
    if (details !== null) content.observe(details, { attributes: true, attributeFilter: ['open'] });
    return () => {
      queued.delete(check);
      unwatch?.();
      content.disconnect();
      element.removeAttribute(STACKED);
    };
  }, [stack]);
  return { probe, table, scrolls };
}

export { StackProbe, useStack };
