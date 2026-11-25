/**
 * Focuses a row's toggle and brings it into view within the page's scroll padding: the browser's own
 * focus scroll leaves a row that starts under the phone tab bar there (docs/DESIGN.md §6).
 */
export function focusInView(element: HTMLElement | null | undefined) {
  element?.focus({ preventScroll: true });
  element?.scrollIntoView({ block: 'nearest' });
}

/** The toggle of the nth transaction, by the mark inside it, since an open detail can hold other controls. */
export function rowToggle(list: HTMLElement | null, index: number) {
  return list?.querySelectorAll<HTMLElement>('[data-row]')[index]?.closest('button');
}
