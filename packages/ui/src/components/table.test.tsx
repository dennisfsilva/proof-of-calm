// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Table, TableBody, TableCaption, TableCell, TableRow } from './table';

// A table wider than its wrapper scrolls inside it (docs/DESIGN.md §8): only then is the wrapper a named
// region with a tab stop, so a keyboard user can scroll it; a table that fits adds neither. jsdom lays
// nothing out, so the widths are stubbed and a stand-in ResizeObserver reports them when asked.

let widths = { scroll: 0, client: 0 };
const observers: (() => void)[] = [];

class StubResizeObserver {
  readonly #callback: () => void;
  constructor(callback: () => void) {
    this.#callback = callback;
    observers.push(callback);
  }
  observe() {
    this.#callback();
  }
  disconnect() {
    observers.splice(observers.indexOf(this.#callback), 1);
  }
}

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

function renderTable(label?: string, caption = true) {
  return render(
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
}

const wrapper = () => document.querySelector<HTMLElement>('[data-slot="table-container"]');

function reportWidths(scroll: number, client: number) {
  widths = { scroll, client };
  act(() => {
    for (const report of observers) report();
  });
}

describe('Table', () => {
  it('adds no region or tab stop to a table that fits', () => {
    widths = { scroll: 350, client: 350 };
    renderTable();
    expect(screen.queryByRole('region')).toBeNull();
    expect(wrapper()?.hasAttribute('tabindex')).toBe(false);
  });

  it('makes the wrapper of a table that overflows a region named by the caption, with a tab stop', () => {
    widths = { scroll: 381, client: 350 };
    renderTable();
    const region = screen.getByRole('region', { name: 'Holdings' });
    expect(region).toBe(wrapper());
    expect(region.getAttribute('tabindex')).toBe('0');
  });

  it('names the region by its label when one is given, and drops it once the table fits again', () => {
    widths = { scroll: 381, client: 350 };
    renderTable('Holdings, scrolls sideways');
    expect(screen.getByRole('region', { name: 'Holdings, scrolls sideways' })).toBeDefined();
    reportWidths(350, 350);
    expect(screen.queryByRole('region')).toBeNull();
    expect(wrapper()?.hasAttribute('tabindex')).toBe(false);
  });

  it('keeps the focused region and its tab stop when the table fits again, and drops them on blur', () => {
    widths = { scroll: 381, client: 350 };
    renderTable();
    const region = screen.getByRole('region', { name: 'Holdings' });
    act(() => region.focus());
    reportWidths(350, 350);
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('region', { name: 'Holdings' })).toBe(region);
    expect(document.activeElement).toBe(region);
    act(() => region.blur());
    expect(screen.queryByRole('region')).toBeNull();
    expect(wrapper()?.hasAttribute('tabindex')).toBe(false);
  });

  it('names the region by its label when the table has no caption', () => {
    widths = { scroll: 381, client: 350 };
    renderTable('Log', false);
    const region = screen.getByRole('region', { name: 'Log' });
    expect(region.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('points aria-labelledby at the caption only while one is mounted', () => {
    widths = { scroll: 381, client: 350 };
    renderTable();
    const id = wrapper()?.getAttribute('aria-labelledby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? '')?.textContent).toBe('Holdings');
  });

  it('drops aria-labelledby when the caption unmounts', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    widths = { scroll: 381, client: 350 };
    const { rerender } = renderTable();
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

  it('keeps an unnamed overflowing table keyboard-scrollable without a region, and reports the missing label', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    widths = { scroll: 381, client: 350 };
    renderTable(undefined, false);
    expect(wrapper()?.getAttribute('tabindex')).toBe('0');
    expect(wrapper()?.hasAttribute('role')).toBe(false);
    expect(wrapper()?.hasAttribute('aria-labelledby')).toBe(false);
    expect(screen.queryByRole('region')).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('label');
  });
});
