import { exportBackup, type Instant } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { DataSection } from './data-section';

// A GBP backup chosen with no plan over the fixture's entries, their plan row set aside in EUR (ADR-0053 Readings,
// 2026-11-26): the dialog that asks before the file's plan shows them in GBP, "Do not import" focused and the
// order Do not import, Import in GBP; the test projects of vitest.config.ts render it at 360 and 1280 px, light
// and dark, with axe.

const AT = '2026-10-20T10:00:00.000Z' as Instant;
const fixture = fixtureSnapshot();

function gbpBackup(): File {
  if (fixture.plan === null) throw new Error('the fixture has a plan');
  const backup = exportBackup({ ...fixture.plan, payCurrency: 'GBP', displayCurrency: 'GBP' }, [], AT);
  return new File([JSON.stringify(backup)], 'proof-of-calm-backup-2026-10-20.json', { type: 'application/json' });
}

const meta = {
  title: 'Features/Settings/KeptImportDialog',
  component: DataSection,
  parameters: {
    path: '/settings',
    nowMs: fixtureNowMs('buy'),
    snapshot: {
      ...fixture,
      plan: null,
      quarantined: 1,
      setAside: { plans: [{ id: 'plan', at: AT, currency: 'EUR' }], entries: [] },
    },
  },
} satisfies Meta<typeof DataSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AsksFirst: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.upload(await canvas.findByLabelText('Choose a file'), gbpBackup());
    await userEvent.click(await canvas.findByRole('button', { name: 'Import this backup' }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog');
    await expect(dialog).toHaveAccessibleName(/^Show \d+ saved entries in GBP\?$/);
    const [cancel, confirm] = ['Do not import', 'Import in GBP'].map((name) =>
      within(dialog).getByRole('button', { name }),
    ) as [HTMLElement, HTMLElement];
    await expect(within(dialog).getAllByRole('button')).toEqual([cancel, confirm]);
    // The dialog fades in (Base UI's starting style); visibility settles once the transition ends.
    await waitFor(() => expect(confirm).toBeVisible());
    await expect(cancel).toHaveFocus();
  },
};
