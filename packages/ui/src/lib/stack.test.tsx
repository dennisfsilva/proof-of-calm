// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StackProbe, useStack } from './stack';

// A table stacks while its side-by-side columns are wider than its box, measured afresh at every check and kept
// nowhere (docs/DESIGN.md §8). jsdom lays nothing out, so the widths are stubbed, and stand-in observers record
// what they watch and run the check when a test says the probe resized or the table changed.

const NativeMutationObserver = globalThis.MutationObserver;

let widths = { table: 0, box: 0, scroll: 0, client: 0 };
/** Whether the table still carried `data-stacked` each time its width was read. */
let stackedWhenMeasured: boolean[] = [];

type Observed = { target: Node; options?: MutationObserverInit };
const resizes: { callback: () => void; targets: Element[]; connected: boolean }[] = [];
const mutations: { callback: (records: MutationRecord[]) => void; observed: Observed[]; connected: boolean }[] = [];

class StubResizeObserver {
  readonly #entry: (typeof resizes)[number];
  constructor(callback: () => void) {
    this.#entry = { callback, targets: [], connected: true };
    resizes.push(this.#entry);
  }
  observe(target: Element) {
    this.#entry.targets.push(target);
  }
  disconnect() {
    this.#entry.connected = false;
  }
}

class StubMutationObserver {
  readonly #entry: (typeof mutations)[number];
  constructor(callback: (records: MutationRecord[]) => void) {
    this.#entry = { callback, observed: [], connected: true };
    mutations.push(this.#entry);
  }
  observe(target: Node, options?: MutationObserverInit) {
    this.#entry.observed.push({ target, ...(options === undefined ? {} : { options }) });
  }
  disconnect() {
    this.#entry.connected = false;
  }
}

const rect = (width: number) => ({ width }) as DOMRect;

beforeEach(() => {
  widths = { table: 0, box: 0, scroll: 0, client: 0 };
  stackedWhenMeasured = [];
  resizes.length = 0;
  mutations.length = 0;
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('MutationObserver', StubMutationObserver);
  vi.spyOn(HTMLTableElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    stackedWhenMeasured.push(this.hasAttribute('data-stacked'));
    return rect(widths.table);
  });
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(() => rect(widths.box));
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => widths.scroll);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => widths.client);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Stacking({ stack = true }: { stack?: boolean }) {
  const { probe, table, scrolls } = useStack(stack);
  return (
    <details open>
      <summary>Dates</summary>
      <div data-testid="scroller" data-scrolls={scrolls}>
        <StackProbe ref={probe} />
        <table ref={table}>
          <tbody>
            <tr>
              <td>28 de fevereiro de 2027</td>
              <td>12 345,67 €</td>
            </tr>
            <tr>
              <td colSpan={2}>
                {/* A detail row's own table view, such as a coin's daily closes, with its own stacking. */}
                <details data-testid="nested-details">
                  <summary>Daily closes</summary>
                  <table data-testid="nested-table">
                    <tbody>
                      <tr>
                        <td>28 de fevereiro de 2027</td>
                      </tr>
                    </tbody>
                  </table>
                </details>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}

const table = () => document.querySelector('table') as HTMLTableElement;
const scrolls = () => document.querySelector('[data-testid="scroller"]')?.getAttribute('data-scrolls');

/** The widths change, then the probe's ResizeObserver reports it. */
function resize(next: Partial<typeof widths>) {
  widths = { ...widths, ...next };
  act(() => {
    for (const observer of resizes) if (observer.connected) observer.callback();
  });
}

/** The widths change, then the table's MutationObserver reports a change. */
function mutate(next: Partial<typeof widths>) {
  widths = { ...widths, ...next };
  act(() => {
    const record = { type: 'childList', target: table(), attributeName: null } as MutationRecord;
    for (const observer of mutations) if (observer.connected) observer.callback([record]);
  });
}

describe('useStack', () => {
  it('stacks a table wider than its box and keeps the columns of one that fits, at mount', () => {
    widths = { table: 400.5, box: 328, scroll: 0, client: 0 };
    render(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(true);
    cleanup();
    widths = { table: 328, box: 328, scroll: 0, client: 0 };
    render(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(false);
  });

  it('compares in sub-pixels: a table a fraction of a pixel wider stacks', () => {
    widths = { table: 328.4, box: 328, scroll: 0, client: 0 };
    render(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(true);
  });

  it('removes the attribute before it measures, so each check sees the columns side by side', () => {
    widths = { table: 400, box: 328, scroll: 0, client: 0 };
    render(<Stacking />);
    resize({});
    mutate({});
    expect(stackedWhenMeasured.length).toBeGreaterThanOrEqual(3);
    expect(stackedWhenMeasured.every((stacked) => !stacked)).toBe(true);
  });

  it('checks again on a probe resize, both ways, holding nothing between checks', () => {
    widths = { table: 328, box: 328, scroll: 0, client: 0 };
    render(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(false);
    resize({ box: 300 });
    expect(table().hasAttribute('data-stacked')).toBe(true);
    resize({ box: 328 });
    expect(table().hasAttribute('data-stacked')).toBe(false);
    resize({ table: 420 });
    expect(table().hasAttribute('data-stacked')).toBe(true);
    resize({ table: 300 });
    expect(table().hasAttribute('data-stacked')).toBe(false);
  });

  it('checks again on a row or text mutation, both ways', () => {
    widths = { table: 400, box: 328, scroll: 0, client: 0 };
    render(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(true);
    mutate({ table: 320 });
    expect(table().hasAttribute('data-stacked')).toBe(false);
    mutate({ table: 340 });
    expect(table().hasAttribute('data-stacked')).toBe(true);
  });

  it('watches the probe and its ruler, the rows and text, hidden, open and nested stacking inside, the details’ open', () => {
    render(<Stacking />);
    const probe = document.querySelector('[data-testid="scroller"] > div');
    expect(resizes).toHaveLength(1);
    expect(resizes[0]?.targets).toEqual([probe, probe?.firstElementChild]);
    expect(mutations).toHaveLength(1);
    const observed = mutations[0]?.observed ?? [];
    expect(observed.find((entry) => entry.target === table())?.options).toEqual({
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'open', 'data-stacked'],
    });
    expect(observed.find((entry) => entry.target === document.querySelector('details'))?.options).toEqual({
      attributes: true,
      attributeFilter: ['open'],
    });
  });

  it('checks again when a row’s hidden changes, the details open or close, a row is added or its text changes', async () => {
    // jsdom's own MutationObserver here, so the filter on the table and the details is what decides.
    vi.stubGlobal('MutationObserver', NativeMutationObserver);
    widths = { table: 400, box: 328, scroll: 0, client: 0 };
    render(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(true);
    const flush = () => act(async () => await Promise.resolve());
    const row = table().querySelector('tr') as HTMLTableRowElement;
    const details = document.querySelector('details') as HTMLDetailsElement;
    const cell = table().querySelector('td') as HTMLTableCellElement;

    widths = { ...widths, table: 320 };
    row.hidden = true;
    await flush();
    expect(table().hasAttribute('data-stacked')).toBe(false);
    widths = { ...widths, table: 400 };
    row.hidden = false;
    await flush();
    expect(table().hasAttribute('data-stacked')).toBe(true);

    widths = { ...widths, table: 320 };
    details.open = false;
    await flush();
    expect(table().hasAttribute('data-stacked')).toBe(false);
    widths = { ...widths, table: 400 };
    details.open = true;
    await flush();
    expect(table().hasAttribute('data-stacked')).toBe(true);

    widths = { ...widths, table: 320 };
    (cell.firstChild as Text).data = '28 Feb 2027';
    await flush();
    expect(table().hasAttribute('data-stacked')).toBe(false);
    widths = { ...widths, table: 400 };
    row.after(row.cloneNode(true));
    await flush();
    expect(table().hasAttribute('data-stacked')).toBe(true);

    // Its own attribute is not watched: setting it starts no further check.
    const checks = stackedWhenMeasured.length;
    table().setAttribute('data-stacked', '');
    await flush();
    expect(stackedWhenMeasured).toHaveLength(checks);
  });

  it('checks again when a <details> inside the table opens or closes, and reports scrolls from it', async () => {
    // Portfolio's Holdings: a coin's daily closes open inside its detail row and widen the table past its box.
    vi.stubGlobal('MutationObserver', NativeMutationObserver);
    widths = { table: 328, box: 328, scroll: 328, client: 328 };
    render(<Stacking stack={false} />);
    expect(scrolls()).toBe('false');
    const flush = () => act(async () => await Promise.resolve());
    const nested = document.querySelector('[data-testid="nested-details"]') as HTMLDetailsElement;

    widths = { ...widths, scroll: 442 };
    nested.open = true;
    await flush();
    expect(scrolls()).toBe('true');
    widths = { ...widths, scroll: 328 };
    nested.open = false;
    await flush();
    expect(scrolls()).toBe('false');
  });

  it('checks again when a table inside the table stacks or unstacks, and not on its own toggle', async () => {
    vi.stubGlobal('MutationObserver', NativeMutationObserver);
    widths = { table: 400, box: 328, scroll: 0, client: 0 };
    render(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(true);
    const flush = () => act(async () => await Promise.resolve());
    const nested = document.querySelector('[data-testid="nested-table"]') as HTMLTableElement;

    widths = { ...widths, table: 320 };
    nested.setAttribute('data-stacked', '');
    await flush();
    expect(table().hasAttribute('data-stacked')).toBe(false);
    widths = { ...widths, table: 400 };
    nested.removeAttribute('data-stacked');
    await flush();
    expect(table().hasAttribute('data-stacked')).toBe(true);

    // The outer check toggles its own attribute twice; those records start no further check, so nothing loops.
    await flush();
    const checks = stackedWhenMeasured.length;
    table().removeAttribute('data-stacked');
    table().setAttribute('data-stacked', '');
    await flush();
    expect(stackedWhenMeasured).toHaveLength(checks);
  });

  it('reports scrolls from the same check, both ways', () => {
    widths = { table: 400, box: 328, scroll: 360, client: 328 };
    render(<Stacking />);
    expect(scrolls()).toBe('true');
    mutate({ scroll: 328 });
    expect(scrolls()).toBe('false');
    resize({ scroll: 340 });
    expect(scrolls()).toBe('true');
  });

  it('only reports scrolls when stacking is off', () => {
    widths = { table: 400, box: 328, scroll: 400, client: 328 };
    render(<Stacking stack={false} />);
    expect(table().hasAttribute('data-stacked')).toBe(false);
    expect(scrolls()).toBe('true');
  });

  it('skips a table that is not rendered', () => {
    widths = { table: 400, box: 328, scroll: 0, client: 0 };
    // jsdom has no checkVisibility; a browser answers false for a table inside a closed <details>.
    Object.defineProperty(HTMLTableElement.prototype, 'checkVisibility', { configurable: true, value: () => false });
    try {
      render(<Stacking />);
      expect(table().hasAttribute('data-stacked')).toBe(false);
      expect(stackedWhenMeasured).toEqual([]);
    } finally {
      Reflect.deleteProperty(HTMLTableElement.prototype, 'checkVisibility');
    }
  });

  it('disconnects both observers on unmount', () => {
    const { unmount } = render(<Stacking />);
    unmount();
    expect(resizes.every((observer) => !observer.connected)).toBe(true);
    expect(mutations.every((observer) => !observer.connected)).toBe(true);
  });
});
