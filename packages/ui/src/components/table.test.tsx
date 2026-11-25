// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Table, TableBody, TableCaption, TableCell, TableRow } from './table';

// A table wider than its wrapper scrolls inside it (docs/DESIGN.md §8): only then is the wrapper a named
// region with a tab stop, so a keyboard user can scroll it; a table that fits adds neither. jsdom lays
// nothing out, so the widths are stubbed and a stand-in ResizeObserver reports them when asked, each time as a new
// size of the probe, as a box that resizes would; the mount's check runs in the first such report.

let widths = { scroll: 0, client: 0 };
let size = 0;
type Report = (entries: { target: Element; borderBoxSize: { inlineSize: number; blockSize: number }[] }[]) => void;
const observers: { report: Report; targets: Element[] }[] = [];

class StubResizeObserver {
  readonly #entry: (typeof observers)[number];
  constructor(report: Report) {
    this.#entry = { report, targets: [] };
    observers.push(this.#entry);
  }
  observe(target: Element) {
    this.#entry.targets.push(target);
  }
  unobserve(target: Element) {
    this.#entry.targets = this.#entry.targets.filter((observed) => observed !== target);
  }
  disconnect() {
    observers.splice(observers.indexOf(this.#entry), 1);
  }
}

const flush = () => act(async () => await Promise.resolve());

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => widths.scroll);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => widths.client);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderTable(label?: string, caption = true) {
  const result = render(
    <Table {...(label === undefined ? {} : { label })}>
      {caption ? <TableCaption>Holdings</TableCaption> : null}
      <TableBody>
        <TableRow>
          <TableCell>BTC</TableCell>
          <TableCell numeric>1329,00 €</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
  await reportWidths(widths.scroll, widths.client);
  return result;
}

const wrapper = () => document.querySelector<HTMLElement>('[data-slot="table-container"]');

async function reportWidths(scroll: number, client: number) {
  widths = { scroll, client };
  size += 1;
  act(() => {
    for (const { report, targets } of observers) {
      report(targets.map((target) => ({ target, borderBoxSize: [{ inlineSize: size, blockSize: 0 }] })));
    }
  });
  await flush();
}

describe('Table', () => {
  it('adds no region or tab stop to a table that fits', async () => {
    widths = { scroll: 350, client: 350 };
    await renderTable();
    expect(screen.queryByRole('region')).toBeNull();
    expect(wrapper()?.hasAttribute('tabindex')).toBe(false);
  });

  it('makes the wrapper of a table that overflows a region named by the caption, with a tab stop', async () => {
    widths = { scroll: 381, client: 350 };
    await renderTable();
    const region = screen.getByRole('region', { name: 'Holdings' });
    expect(region).toBe(wrapper());
    expect(region.getAttribute('tabindex')).toBe('0');
  });

  it('names the region by its label when one is given, and drops it once the table fits again', async () => {
    widths = { scroll: 381, client: 350 };
    await renderTable('Holdings, scrolls sideways');
    expect(screen.getByRole('region', { name: 'Holdings, scrolls sideways' })).toBeDefined();
    await reportWidths(350, 350);
    expect(screen.queryByRole('region')).toBeNull();
    expect(wrapper()?.hasAttribute('tabindex')).toBe(false);
  });

  it('keeps the focused region and its tab stop when the table fits again, and drops them on blur', async () => {
    widths = { scroll: 381, client: 350 };
    await renderTable();
    const region = screen.getByRole('region', { name: 'Holdings' });
    act(() => region.focus());
    await reportWidths(350, 350);
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('region', { name: 'Holdings' })).toBe(region);
    expect(document.activeElement).toBe(region);
    act(() => region.blur());
    expect(screen.queryByRole('region')).toBeNull();
    expect(wrapper()?.hasAttribute('tabindex')).toBe(false);
  });

  it('names the region by its label when the table has no caption', async () => {
    widths = { scroll: 381, client: 350 };
    await renderTable('Log', false);
    const region = screen.getByRole('region', { name: 'Log' });
    expect(region.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('points aria-labelledby at the caption only while one is mounted', async () => {
    widths = { scroll: 381, client: 350 };
    await renderTable();
    const id = wrapper()?.getAttribute('aria-labelledby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? '')?.textContent).toBe('Holdings');
  });

  it('drops aria-labelledby when the caption unmounts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    widths = { scroll: 381, client: 350 };
    const { rerender } = await renderTable();
    rerender(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>BTC</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(wrapper()?.hasAttribute('aria-labelledby')).toBe(false);
    expect(wrapper()?.getAttribute('tabindex')).toBe('0');
  });

  it('keeps an unnamed overflowing table keyboard-scrollable without a region, and reports the missing label', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    widths = { scroll: 381, client: 350 };
    await renderTable(undefined, false);
    expect(wrapper()?.getAttribute('tabindex')).toBe('0');
    expect(wrapper()?.hasAttribute('role')).toBe(false);
    expect(wrapper()?.hasAttribute('aria-labelledby')).toBe(false);
    expect(screen.queryByRole('region')).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('label');
  });
});
