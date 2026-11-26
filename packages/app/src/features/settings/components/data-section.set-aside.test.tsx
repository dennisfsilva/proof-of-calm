// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters/memory-store';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { mount, NOW } from './data-section.testing';

// Settings → Currency & data → Your data: how many saved items were set aside as unreadable, while any is
// (ADR-0019 Readings, 2026-11-26); it ends only with Delete everything.

afterEach(cleanup);

const LINE = /saved items? could not be read/;

describe('DataSection: the set-aside count', () => {
  it('shows nothing while nothing is set aside', async () => {
    await mount(fixtureSnapshot());
    expect(screen.queryByText(LINE)).toBeNull();
  });

  it('says how many saved items were set aside and that exports leave them out, after the export lines', async () => {
    await mount({
      ...fixtureSnapshot(),
      quarantined: 3,
      setAside: { plans: [], entries: [{ id: 'gone', at: NOW }] },
    });
    const line = screen.getByText(LINE);
    expect(line.textContent).toBe(
      '3 saved items could not be read, so Proof of Calm set them aside. They stay on this device as they were saved, and exports leave them out.',
    );
    expect(line.className.split(' ')).toContain('text-ink-2');
  });

  it('shows the count after Nothing to export yet while no plan shows', async () => {
    await mount({ ...EMPTY_SNAPSHOT, quarantined: 1, setAside: { plans: [{ id: 'plan', at: NOW }], entries: [] } });
    const none = screen.getByText('Nothing to export yet. Set up a plan or import a file.');
    expect(none.nextElementSibling?.textContent).toBe(
      '1 saved item could not be read, so Proof of Calm set it aside. It stays on this device as it was saved, and exports leave it out.',
    );
  });
});
