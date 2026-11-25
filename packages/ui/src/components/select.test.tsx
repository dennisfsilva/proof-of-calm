// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './select';

// The hashed CSP refuses an inline <style> (docs/SECURITY.md §4). Base UI's Select popup renders one for
// its `base-ui-disable-scrollbar` class unless a CSPProvider turns style elements off; the Select carries
// that provider, and globals.css holds the rule instead.

afterEach(cleanup);

describe('Select', () => {
  it('opens its popup without inserting an inline style element', async () => {
    render(
      <Select<string> defaultValue="pt">
        <SelectLabel>Country</SelectLabel>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pt">Portugal</SelectItem>
          <SelectItem value="de">Germany</SelectItem>
        </SelectContent>
      </Select>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Country' }));
    expect(await screen.findByRole('option', { name: 'Germany' })).toBeTruthy();
    const styles = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '');
    expect(styles.filter((text) => text.includes('base-ui-disable-scrollbar'))).toEqual([]);
  });

  // Base UI's aligned layout reads the positioner's bottom margin (docs/DESIGN.md §7): the bar's height only when the
  // list would reach the bar, as a margin it does not need lifts the list off its trigger.
  const positioner = async () => {
    await userEvent.click(screen.getByRole('combobox', { name: 'Country' }));
    await screen.findByRole('option', { name: 'Germany' });
    return document.querySelector('[data-slot="select-content"]')?.parentElement;
  };
  const country = (
    <Select<string> defaultValue="pt">
      <SelectLabel>Country</SelectLabel>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pt">Portugal</SelectItem>
        <SelectItem value="de">Germany</SelectItem>
      </SelectContent>
    </Select>
  );

  it('leaves the bottom margin to Base UI on a page without the tab bar', async () => {
    render(country);
    expect((await positioner())?.className).toBe('isolate z-50');
  });

  it("gives the open list the tab bar's margin when it would reach the bar", async () => {
    render(
      <>
        {country}
        <div data-slot="tab-bar" ref={(bar) => bar && Object.defineProperty(bar, 'offsetHeight', { value: 70 })} />
      </>,
    );
    expect((await positioner())?.className).toBe('isolate z-50 mb-(--bottom-bar)');
  });
});
