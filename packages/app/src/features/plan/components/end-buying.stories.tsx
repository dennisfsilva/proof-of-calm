import type { CalendarDate } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { Snapshot } from '../../../lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { EndBuying } from './end-buying';

// End buying over the fixture plan on 20 October 2026: the button while buying lasts, the dialog that opens on
// `Keep the plan as it is`, and a plan whose buying ended on 10 October 2026; the test projects render each at
// 360 and 1280 px, light and dark, with axe.

const ended = (): Snapshot => {
  const snapshot = fixtureSnapshot();
  const day = '2026-10-10' as CalendarDate;
  return { ...snapshot, plan: snapshot.plan && { ...snapshot.plan, lastBuy: day, endedBuyingOn: day } };
};

const meta = {
  title: 'Features/Plan/EndBuying',
  component: EndBuying,
  parameters: { path: '/plan', snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') },
} satisfies Meta<typeof EndBuying>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Buying: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'End buying' })).toBeVisible();
  },
};

// DOM, visual and Tab order are one (WCAG 2.4.3): `Keep the plan as it is`, then `End buying today`, stacked on a
// phone and in a row from 640 px. Shift+Tab from the first wraps to the last, as every modal's focus trap does.
export const AsksFirst: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'End buying' }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog');
    await expect(dialog).toHaveAccessibleName('End buying');
    await expect(dialog).toHaveAccessibleDescription(/^No buy days after today, 20\sOct\s2026\. Your \d+ entries/u);
    const [keep, confirm] = ['Keep the plan as it is', 'End buying today'].map((name) =>
      within(dialog).getByRole('button', { name }),
    ) as [HTMLElement, HTMLElement];
    await expect(within(dialog).getAllByRole('button')).toEqual([keep, confirm]);
    // The dialog fades in (Base UI's starting style); visibility settles once the transition ends.
    await waitFor(() => expect(confirm).toBeVisible());
    await expect(keep).toHaveFocus();
    // A wrap lands on Base UI's focus guard first; its onFocus moves the focus on in the next animation frame.
    await userEvent.tab({ shift: true });
    await waitFor(() => expect(confirm).toHaveFocus());
    await userEvent.tab();
    await waitFor(() => expect(keep).toHaveFocus());
  },
};

export const Ended: Story = {
  parameters: { snapshot: ended() },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^Buying ended on 10\sOct\s2026\.$/u)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'End buying' })).toBeNull();
  },
};
