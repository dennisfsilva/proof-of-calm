// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StackProbe, useStack } from './stack';

// A table stacks while its side-by-side columns are wider than its box, measured afresh at every check and kept
// nowhere (docs/DESIGN.md §8). jsdom lays nothing out, so the widths are stubbed, and stand-in observers record
// what they watch. The stand-in ResizeObserver reports as a browser's does, once per frame (`frame`): a target's
// first size, then only a size that changed since it last reported it. The mount's check runs in that first
// observation; a check a mutation starts waits for a microtask, so each step awaits `flush`.

const NativeMutationObserver = globalThis.MutationObserver;

let widths = { table: 0, box: 0, scroll: 0, client: 0, ruler: 100, line: 20, inner: 0, innerBox: 0 };
/** Whether the table still carried `data-stacked` each time its width was read. */
let stackedWhenMeasured: boolean[] = [];
/** The order of the checks' steps: a table's width read (`measure`) and its attribute set (`stack`). */
let steps: string[] = [];

type Observed = { target: Node; options?: MutationObserverInit };
type Observation = { target: Element; borderBoxSize: { inlineSize: number; blockSize: number }[] };
const resizes: {
  callback: (entries: Observation[]) => void;
  targets: Element[];
  reported: Map<Element, string>;
  connected: boolean;
}[] = [];
const mutations: { callback: (records: MutationRecord[]) => void; observed: Observed[]; connected: boolean }[] = [];

class StubResizeObserver {
  readonly #entry: (typeof resizes)[number];
  constructor(callback: (entries: Observation[]) => void) {
    this.#entry = { callback, targets: [], reported: new Map(), connected: true };
    resizes.push(this.#entry);
  }
  observe(target: Element) {
    this.#entry.targets.push(target);
  }
  unobserve(target: Element) {
    this.#entry.targets = this.#entry.targets.filter((observed) => observed !== target);
    this.#entry.reported.delete(target);
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

const rect = (width: number, height = 0) => ({ width, height }) as DOMRect;
const inner = (element: Element) => element.closest('[data-testid="inner-scroller"]') !== null;
const tableName = (element: Element) => element.getAttribute('data-testid') ?? 'outer';

/** The size an element has now: the probe is as wide as its box and has no height, the ruler is one line. */
function sizeOf(element: Element) {
  if (element instanceof HTMLSpanElement) return { inlineSize: widths.ruler, blockSize: widths.line };
  return { inlineSize: inner(element) ? widths.innerBox : widths.box, blockSize: 0 };
}

beforeEach(() => {
  widths = { table: 0, box: 0, scroll: 0, client: 0, ruler: 100, line: 20, inner: 0, innerBox: 0 };
  stackedWhenMeasured = [];
  steps = [];
  resizes.length = 0;
  mutations.length = 0;
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('MutationObserver', StubMutationObserver);
  vi.spyOn(HTMLTableElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    stackedWhenMeasured.push(this.hasAttribute('data-stacked'));
    steps.push(`measure ${tableName(this)}`);
    return rect(this.getAttribute('data-testid') === 'inner-table' ? widths.inner : widths.table);
  });
  const setAttribute = HTMLElement.prototype.setAttribute;
  vi.spyOn(HTMLTableElement.prototype, 'setAttribute').mockImplementation(function (
    this: HTMLElement,
    name: string,
    value: string,
  ) {
    if (name === 'data-stacked') steps.push(`stack ${tableName(this)}`);
    setAttribute.call(this, name, value);
  });
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return rect(inner(this) ? widths.innerBox : widths.box);
  });
  vi.spyOn(HTMLSpanElement.prototype, 'getBoundingClientRect').mockImplementation(() =>
    rect(widths.ruler, widths.line),
  );
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

/** A chart's table view in a cell of a stacking table, as in Holdings, each with its own `useStack`. */
function Inner({ open }: { open: boolean }) {
  const { probe, table } = useStack(true);
  return (
    <details open={open} data-testid="inner-details">
      <summary>Daily closes</summary>
      <div data-testid="inner-scroller">
        <StackProbe ref={probe} />
        <table ref={table} data-testid="inner-table">
          <tbody>
            <tr>
              <td>28 de fevereiro de 2027</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Outer({ open }: { open: boolean }) {
  const { probe, table } = useStack(true);
  return (
    <div>
      <StackProbe ref={probe} />
      <table ref={table}>
        <tbody>
          <tr>
            <td>
              <Inner open={open} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const table = () => document.querySelector('table') as HTMLTableElement;
const byTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const scrolls = () => document.querySelector('[data-testid="scroller"]')?.getAttribute('data-scrolls');
const flush = () => act(async () => await Promise.resolve());

/** A frame's layout: each ResizeObserver reports, in one callback, the targets new to it or of another size. */
async function frame() {
  act(() => {
    for (const observer of resizes) {
      if (!observer.connected) continue;
      const entries = observer.targets
        .map((target) => ({ target, borderBoxSize: [sizeOf(target)] }))
        .filter(({ target, borderBoxSize }) => observer.reported.get(target) !== JSON.stringify(borderBoxSize));
      for (const { target, borderBoxSize } of entries) observer.reported.set(target, JSON.stringify(borderBoxSize));
      if (entries.length > 0) observer.callback(entries);
    }
  });
  await flush();
}

/** Renders and lets the first frame run, whose observations run the mount's checks. */
async function mount(ui: ReactElement) {
  const result = render(ui);
  await flush();
  await frame();
  return result;
}

/** The widths change, then a frame lays them out. */
async function resize(next: Partial<typeof widths>) {
  widths = { ...widths, ...next };
  await frame();
}

/** The widths change, then the table's MutationObserver reports a change. */
async function mutate(next: Partial<typeof widths>) {
  widths = { ...widths, ...next };
  act(() => {
    const record: Pick<MutationRecord, 'type' | 'target' | 'attributeName'> = {
      type: 'childList',
      target: table(),
      attributeName: null,
    };
    for (const observer of mutations) if (observer.connected) observer.callback([record as MutationRecord]);
  });
  await flush();
}

describe('useStack', () => {
  it('stacks a table wider than its box and keeps the columns of one that fits, at mount', async () => {
    widths = { ...widths, table: 400.5, box: 328 };
    await mount(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(true);
    cleanup();
    widths = { ...widths, table: 328, box: 328 };
    await mount(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(false);
  });

  it('compares in sub-pixels: a table a fraction of a pixel wider stacks', async () => {
    widths = { ...widths, table: 328.4, box: 328 };
    await mount(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(true);
  });

  it('removes the attribute before it measures, so each check sees the columns side by side', async () => {
    widths = { ...widths, table: 400, box: 328 };
    await mount(<Stacking />);
    await resize({ box: 320 });
    await mutate({});
    expect(stackedWhenMeasured).toHaveLength(3);
    expect(stackedWhenMeasured.every((stacked) => !stacked)).toBe(true);
  });

  it('measures a table once at mount, in its first observation, after the frame laid it out', async () => {
    widths = { ...widths, table: 400, box: 328 };
    render(<Stacking />);
    await flush();
    expect(stackedWhenMeasured).toEqual([]);
    await frame();
    expect(stackedWhenMeasured).toHaveLength(1);
    expect(table().hasAttribute('data-stacked')).toBe(true);
    await frame();
    expect(stackedWhenMeasured).toHaveLength(1);
  });

  it('starts no check for an observation of the sizes the last check saw', async () => {
    widths = { ...widths, table: 400, box: 328 };
    await mount(<Stacking />);
    // A row change and a new text size in one task: the mutation's check sees the new ruler before it reports.
    await mutate({ line: 25 });
    expect(stackedWhenMeasured).toHaveLength(2);
    await frame();
    expect(stackedWhenMeasured).toHaveLength(2);
    await resize({ line: 30 });
    expect(stackedWhenMeasured).toHaveLength(3);
  });

  it('checks at mount in a microtask where there is no ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    widths = { ...widths, table: 400, box: 328 };
    render(<Stacking />);
    await flush();
    expect(stackedWhenMeasured).toHaveLength(1);
    expect(table().hasAttribute('data-stacked')).toBe(true);
  });

  it('checks again on a probe or ruler resize, both ways, holding nothing between checks', async () => {
    widths = { ...widths, table: 328, box: 328 };
    await mount(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(false);
    await resize({ box: 300 });
    expect(table().hasAttribute('data-stacked')).toBe(true);
    await resize({ box: 328 });
    expect(table().hasAttribute('data-stacked')).toBe(false);
    // A larger text size: the ruler and the table grow, the box stays.
    await resize({ table: 420, ruler: 120 });
    expect(table().hasAttribute('data-stacked')).toBe(true);
    await resize({ table: 300, ruler: 90 });
    expect(table().hasAttribute('data-stacked')).toBe(false);
  });

  it('checks again on a row or text mutation, both ways', async () => {
    widths = { ...widths, table: 400, box: 328 };
    await mount(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(true);
    await mutate({ table: 320 });
    expect(table().hasAttribute('data-stacked')).toBe(false);
    await mutate({ table: 340 });
    expect(table().hasAttribute('data-stacked')).toBe(true);
  });

  it('batches the checks of one commit: every table measured before any stacks', async () => {
    // Measuring a table after another's attribute changed would lay the page out again for each table.
    widths = { ...widths, table: 400, box: 328, inner: 400, innerBox: 300 };
    vi.stubGlobal('MutationObserver', NativeMutationObserver);
    await mount(<Outer open />);
    const firstStack = steps.findIndex((step) => step.startsWith('stack'));
    expect(steps.slice(0, firstStack).sort()).toEqual(['measure inner-table', 'measure outer']);
    expect(steps.slice(firstStack, firstStack + 2).sort()).toEqual(['stack inner-table', 'stack outer']);
  });

  it('keeps the outcomes of a nested table and of one in a closed <details>', async () => {
    vi.stubGlobal('MutationObserver', NativeMutationObserver);
    // A browser answers false for a table inside a closed <details>; jsdom has no checkVisibility.
    Object.defineProperty(HTMLTableElement.prototype, 'checkVisibility', {
      configurable: true,
      value(this: HTMLElement) {
        return this.closest('details:not([open])') === null;
      },
    });
    try {
      widths = { ...widths, table: 400, box: 328, inner: 400, innerBox: 300 };
      await mount(<Outer open />);
      expect(table().hasAttribute('data-stacked')).toBe(true);
      expect(byTestId('inner-table').hasAttribute('data-stacked')).toBe(true);
      cleanup();
      steps = [];
      await mount(<Outer open={false} />);
      expect(table().hasAttribute('data-stacked')).toBe(true);
      expect(byTestId('inner-table').hasAttribute('data-stacked')).toBe(false);
      expect(steps).not.toContain('measure inner-table');
      // Opening it checks it then, and it stacks.
      (byTestId('inner-details') as HTMLDetailsElement).open = true;
      await flush();
      await flush();
      expect(byTestId('inner-table').hasAttribute('data-stacked')).toBe(true);
    } finally {
      Reflect.deleteProperty(HTMLTableElement.prototype, 'checkVisibility');
    }
  });

  it('measures nothing for a table unmounted before its check ran', async () => {
    widths = { ...widths, table: 400, box: 328 };
    const { unmount } = render(<Stacking />);
    unmount();
    await flush();
    await frame();
    expect(stackedWhenMeasured).toEqual([]);
  });

  it('watches the probe and its ruler, the rows and text, hidden, open and nested stacking inside, the details’ open', async () => {
    await mount(<Stacking />);
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
    widths = { ...widths, table: 400, box: 328 };
    await mount(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(true);
    const settle = async () => {
      await flush();
      await flush();
    };
    const row = table().querySelector('tr') as HTMLTableRowElement;
    const details = document.querySelector('details') as HTMLDetailsElement;
    const cell = table().querySelector('td') as HTMLTableCellElement;

    widths = { ...widths, table: 320 };
    row.hidden = true;
    await settle();
    expect(table().hasAttribute('data-stacked')).toBe(false);
    widths = { ...widths, table: 400 };
    row.hidden = false;
    await settle();
    expect(table().hasAttribute('data-stacked')).toBe(true);

    widths = { ...widths, table: 320 };
    details.open = false;
    await settle();
    expect(table().hasAttribute('data-stacked')).toBe(false);
    widths = { ...widths, table: 400 };
    details.open = true;
    await settle();
    expect(table().hasAttribute('data-stacked')).toBe(true);

    widths = { ...widths, table: 320 };
    (cell.firstChild as Text).data = '28 Feb 2027';
    await settle();
    expect(table().hasAttribute('data-stacked')).toBe(false);
    widths = { ...widths, table: 400 };
    row.after(row.cloneNode(true));
    await settle();
    expect(table().hasAttribute('data-stacked')).toBe(true);

    // Its own attribute is not watched: setting it starts no further check.
    const checks = stackedWhenMeasured.length;
    table().setAttribute('data-stacked', '');
    await settle();
    expect(stackedWhenMeasured).toHaveLength(checks);
  });

  it('checks again when a <details> inside the table opens or closes, and reports scrolls from it', async () => {
    // Portfolio's Holdings: a coin's daily closes open inside its detail row and widen the table past its box.
    vi.stubGlobal('MutationObserver', NativeMutationObserver);
    widths = { ...widths, table: 328, box: 328, scroll: 328, client: 328 };
    await mount(<Stacking stack={false} />);
    expect(scrolls()).toBe('false');
    const nested = document.querySelector('[data-testid="nested-details"]') as HTMLDetailsElement;

    widths = { ...widths, scroll: 442 };
    nested.open = true;
    await flush();
    await flush();
    expect(scrolls()).toBe('true');
    widths = { ...widths, scroll: 328 };
    nested.open = false;
    await flush();
    await flush();
    expect(scrolls()).toBe('false');
  });

  it('checks again when a table inside the table stacks or unstacks, and not on its own toggle', async () => {
    vi.stubGlobal('MutationObserver', NativeMutationObserver);
    widths = { ...widths, table: 400, box: 328 };
    await mount(<Stacking />);
    expect(table().hasAttribute('data-stacked')).toBe(true);
    const settle = async () => {
      await flush();
      await flush();
    };
    const nested = document.querySelector('[data-testid="nested-table"]') as HTMLTableElement;

    widths = { ...widths, table: 320 };
    nested.setAttribute('data-stacked', '');
    await settle();
    expect(table().hasAttribute('data-stacked')).toBe(false);
    widths = { ...widths, table: 400 };
    nested.removeAttribute('data-stacked');
    await settle();
    expect(table().hasAttribute('data-stacked')).toBe(true);

    // The outer check toggles its own attribute twice; those records start no further check, so nothing loops.
    await settle();
    const checks = stackedWhenMeasured.length;
    table().removeAttribute('data-stacked');
    table().setAttribute('data-stacked', '');
    await settle();
    expect(stackedWhenMeasured).toHaveLength(checks);
  });

  it('reports scrolls from the same check, both ways', async () => {
    widths = { ...widths, table: 400, box: 328, scroll: 360, client: 328 };
    await mount(<Stacking />);
    expect(scrolls()).toBe('true');
    await mutate({ scroll: 328 });
    expect(scrolls()).toBe('false');
    await resize({ box: 330, scroll: 340 });
    expect(scrolls()).toBe('true');
  });

  it('only reports scrolls when stacking is off', async () => {
    widths = { ...widths, table: 400, box: 328, scroll: 400, client: 328 };
    await mount(<Stacking stack={false} />);
    expect(table().hasAttribute('data-stacked')).toBe(false);
    expect(scrolls()).toBe('true');
  });

  it('skips a table that is not rendered', async () => {
    widths = { ...widths, table: 400, box: 328 };
    // jsdom has no checkVisibility; a browser answers false for a table inside a closed <details>.
    Object.defineProperty(HTMLTableElement.prototype, 'checkVisibility', { configurable: true, value: () => false });
    try {
      await mount(<Stacking />);
      expect(table().hasAttribute('data-stacked')).toBe(false);
      expect(stackedWhenMeasured).toEqual([]);
    } finally {
      Reflect.deleteProperty(HTMLTableElement.prototype, 'checkVisibility');
    }
  });

  it('disconnects both observers on unmount', async () => {
    const { unmount } = await mount(<Stacking />);
    unmount();
    expect(resizes.every((observer) => !observer.connected)).toBe(true);
    expect(mutations.every((observer) => !observer.connected)).toBe(true);
  });
});
