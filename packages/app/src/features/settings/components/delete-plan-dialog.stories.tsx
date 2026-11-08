import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { DataSection } from './data-section';

// "Delete everything" opened from the data section over the fixture plan: the dialog with the count, "Export a
// copy first" and the safe button focused; the test projects of vitest.config.ts render it at 360 and
// 1280 px, light and dark, with axe.

const meta = {
  title: 'Features/Settings/DeletePlanDialog',
  component: DataSection,
  parameters: { path: '/settings', snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') },
} satisfies Meta<typeof DataSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AsksFirst: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Delete everything' }));
    const document = within(canvasElement.ownerDocument.body);
    const dialog = await document.findByRole('dialog');
    await expect(dialog).toHaveAccessibleName(/^Delete this plan and its \d+ entries\?$/);
    await expect(within(dialog).getByRole('button', { name: 'Export a copy first' })).toBeInTheDocument();
    await expect(within(dialog).queryByRole('link')).toBeNull();
    // The dialog fades in (Base UI's starting style); visibility settles once the transition ends.
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete everything' })).toBeVisible());
    await expect(within(dialog).getByRole('button', { name: 'Keep this plan' })).toHaveFocus();
  },
};

// DOM, visual and Tab order are one (WCAG 2.4.3): Keep, Export, Delete, stacked top to bottom on a phone and
// left to right from 640 px. Shift+Tab from Keep wraps to Delete and Tab from Delete back to Keep, as every
// modal's focus trap does (WAI-ARIA APG).
export const OneOrder: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Delete everything' }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog');
    const [keep, exportCopy, remove] = ['Keep this plan', 'Export a copy first', 'Delete everything'].map((name) =>
      within(dialog).getByRole('button', { name }),
    ) as [HTMLElement, HTMLElement, HTMLElement];
    await expect(within(dialog).getAllByRole('button')).toEqual([keep, exportCopy, remove]);
    await waitFor(() => expect(remove).toBeVisible());
    const boxes = [keep, exportCopy, remove].map((button) => button.getBoundingClientRect());
    const stacked = !window.matchMedia('(width >= 40rem)').matches;
    const along = boxes.map((box) => (stacked ? box.top : box.left));
    await expect(along).toEqual([...along].sort((a, b) => a - b));
    await expect(new Set(along).size).toBe(3);
    await expect(keep).toHaveFocus();
    await userEvent.tab();
    await expect(exportCopy).toHaveFocus();
    await userEvent.tab();
    await expect(remove).toHaveFocus();
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await expect(keep).toHaveFocus();
    // A wrapping Tab lands on a focus guard; Base UI moves the focus on one animation frame later, so these wait.
    await userEvent.tab({ shift: true });
    await waitFor(() => expect(remove).toHaveFocus());
    await userEvent.tab();
    await waitFor(() => expect(keep).toHaveFocus());
  },
};
