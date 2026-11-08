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
});
