import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlusIcon } from 'lucide-react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

function AddPurchase({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <TooltipProvider>
      <div className="flex justify-center pt-stack-xl">
        <Tooltip {...(defaultOpen === undefined ? {} : { defaultOpen })}>
          <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Add a purchase" />}>
            <PlusIcon aria-hidden strokeWidth={1.75} />
          </TooltipTrigger>
          <TooltipContent>Add a purchase</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

const tooltip = (element: HTMLElement) => element.ownerDocument.querySelector('[data-slot="tooltip-content"]');

export const IconButton: Story = {
  render: () => <AddPurchase />,
  play: async ({ canvas, canvasElement }) => {
    const button = canvas.getByRole('button', { name: 'Add a purchase' });
    await expect(tooltip(canvasElement)).toBeNull();

    // Keyboard focus opens it, as hovering does; it says what the button's name says.
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await expect(button.matches(':focus-visible')).toBe(true);
    await waitFor(() => expect(tooltip(canvasElement)).toHaveTextContent('Add a purchase'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(tooltip(canvasElement)).toBeNull());
  },
};

export const Open: Story = {
  render: () => <AddPurchase defaultOpen />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(tooltip(canvasElement)).toBeVisible());
  },
};
