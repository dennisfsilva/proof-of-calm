import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function EndBuying({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <Dialog {...(defaultOpen === undefined ? {} : { defaultOpen })}>
      <DialogTrigger render={<Button variant="secondary" />}>End buying</DialogTrigger>
      <DialogContent closeLabel="Close">
        <DialogHeader>
          <DialogTitle>End buying now?</DialogTitle>
          <DialogDescription>
            The plan moves to Hold. Your 14 purchases stay in the log, and you can start buying again later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>Keep buying</DialogClose>
          <DialogClose render={<Button />}>End buying</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Closed: Story = { render: () => <EndBuying /> };

export const Open: Story = {
  render: () => <EndBuying defaultOpen />,
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const dialog = document.querySelector('[role="dialog"]');
    await expect(dialog).toHaveAccessibleName('End buying now?');
    // The footer keeps the DOM order on screen (WCAG 2.4.3): the safe action first, stacked top to bottom on a
    // phone and left to right from 640 px.
    const footer = [...document.querySelectorAll('[data-slot="dialog-footer"] button')];
    await expect(footer.map((button) => button.textContent)).toEqual(['Keep buying', 'End buying']);
    const [first, second] = footer.map((button) => button.getBoundingClientRect()) as [DOMRect, DOMRect];
    const stacked = !window.matchMedia('(width >= 40rem)').matches;
    await expect(stacked ? first.bottom <= second.top : first.right <= second.left).toBe(true);
  },
};
