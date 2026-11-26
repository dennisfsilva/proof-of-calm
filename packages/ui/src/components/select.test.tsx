// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Fragment } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './select';

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

  // The open listbox is named by the Select's label (axe's aria-input-field-name, #271); without a label it takes no
  // reference to a missing element.
  it('names the open listbox by its label', async () => {
    render(
      <Select<string> defaultValue="pt">
        <SelectLabel>Country</SelectLabel>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pt">Portugal</SelectItem>
        </SelectContent>
      </Select>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Country' }));
    expect(await screen.findByRole('listbox', { name: 'Country' })).toBeTruthy();
  });

  it('leaves the listbox without a reference when no label is rendered', async () => {
    render(
      <Select<string> defaultValue="pt">
        <SelectTrigger aria-label="Country">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pt">Portugal</SelectItem>
        </SelectContent>
      </Select>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Country' }));
    expect((await screen.findByRole('listbox')).hasAttribute('aria-labelledby')).toBe(false);
  });

  // Base UI's aligned layout reads the positioner's margins and minimum height (docs/DESIGN.md §7): the bar's height
  // only when the list would reach the bar, as a margin it does not need lifts the list off its trigger, and a floor of
  // up to seven options.
  const floor = 'isolate z-50 data-[side=none]:min-h-[calc(var(--select-floor)*var(--target))]';
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

  it('leaves the margins to Base UI on a page without the tab bar', async () => {
    render(country);
    const element = await positioner();
    expect(element?.className).toBe(floor);
    expect(element?.style.getPropertyValue('--select-floor')).toBe('2');
  });

  it('counts the options through arrays, Fragments and groups for a floor of at most seven', async () => {
    render(
      <Select<string> defaultValue="pt">
        <SelectLabel>Country</SelectLabel>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="pt">Portugal</SelectItem>
            <Fragment key="south">
              <SelectItem value="es">Spain</SelectItem>
              <SelectItem value="fr">France</SelectItem>
              <SelectItem value="it">Italy</SelectItem>
            </Fragment>
          </SelectGroup>
          {['ie', 'at', 'be', 'nl'].map((code) => (
            <SelectItem key={code} value={code}>
              {code}
            </SelectItem>
          ))}
          <SelectItem value="de">Germany</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect((await positioner())?.style.getPropertyValue('--select-floor')).toBe('7');
  });

  it("gives the open list the tab bar's margin when it would reach the bar", async () => {
    render(
      <>
        {country}
        <div
          data-slot="tab-bar"
          ref={(bar) => {
            if (bar) Object.defineProperty(bar, 'offsetHeight', { value: 70 });
          }}
        />
      </>,
    );
    expect((await positioner())?.className).toBe(`${floor} data-[side=none]:my-(--bottom-bar)`);
  });
});
