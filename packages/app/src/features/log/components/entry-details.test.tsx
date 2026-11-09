// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import log from '../../../messages/en/log.json';
import { EntryDetails } from './entry-details';

// The session-16 carry-over (#10): on zoom-125 opening "Venue and note" turned only the chevron, the panel opening
// below the sheet's fold. Once the panel has opened to its height, it scrolls into view; jsdom lays nothing out, so
// with no scroller found the panel's own `scrollIntoView` is the scroll.

const scroll = vi.fn();
beforeEach(() => {
  scroll.mockClear();
  Element.prototype.scrollIntoView = scroll;
});
afterEach(cleanup);

function Details() {
  const [open, setOpen] = useState(false);
  return (
    <EntryDetails
      venue=""
      note=""
      venueError={null}
      noteError={null}
      venueShown={false}
      open={open}
      onOpenChange={setOpen}
      onChange={() => undefined}
    />
  );
}

const mount = () =>
  render(
    <I18nProvider messages={{ log }}>
      <Details />
    </I18nProvider>,
  );
const panelOf = (trigger: HTMLElement) => document.getElementById(trigger.getAttribute('aria-controls') ?? '');

describe('EntryDetails', () => {
  it('scrolls the panel into view once it has opened to its height', () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Venue and note' });
    fireEvent.click(trigger);
    const panel = panelOf(trigger);
    if (panel === null) throw new Error('no panel');
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.transitionEnd(panel);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(panel);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('scrolls nothing for a field transition inside the panel, nor as the panel closes', () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Venue and note' });
    fireEvent.click(trigger);
    const panel = panelOf(trigger);
    if (panel === null) throw new Error('no panel');
    fireEvent.transitionEnd(screen.getByLabelText('Note (optional)'));
    fireEvent.click(trigger);
    fireEvent.transitionEnd(panel);
    expect(scroll).not.toHaveBeenCalled();
  });
});
