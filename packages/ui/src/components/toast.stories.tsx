import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from './button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from './sheet';
import { createToastManager, Toaster } from './toast';

// The toasts the app shows (docs/CONTENT-STYLE.md): a deletion with Undo, a recorded purchase with Edit,
// and the update prompt with Reload. Each stays until it is answered or closed here (timeout 0), so the
// stories can be looked at; the undo window's 8 s are the component test's (toast.test.tsx).
function Toasts({ closeLabel }: { closeLabel: string }) {
  const [toasts] = useState(createToastManager);
  return (
    <Toaster closeLabel={closeLabel} toastManager={toasts}>
      <div className="flex flex-wrap gap-target-gap">
        <Button
          variant="destructive"
          onClick={() =>
            toasts.add({
              title: 'Entry deleted',
              description: 'Bought 70 € of BTC on 5 October 2026.',
              timeout: 0,
              actionProps: { children: 'Undo', onClick: () => {} },
            })
          }
        >
          Delete entry
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toasts.add({
              title: 'Recorded: 100 € of BTC on 16 October 2026.',
              timeout: 0,
              actionProps: { children: 'Edit', onClick: () => {} },
            })
          }
        >
          Bought as planned
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toasts.add({
              title: 'A new version is ready.',
              timeout: 0,
              actionProps: { children: 'Reload', onClick: () => {} },
            })
          }
        >
          Show the update prompt
        </Button>
      </div>
    </Toaster>
  );
}

const meta = {
  title: 'Components/Toast',
  component: Toasts,
  args: { closeLabel: 'Dismiss' },
} satisfies Meta<typeof Toasts>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A button's height in the toast once the card has settled. The card's entry transition (translate and
 * opacity) is awaited first, and the height is rounded to the device pixel the layout snaps to: CI once
 * measured Undo at 43.99994 px on storybook:android-small:dark, a subpixel reading of a 44 px button.
 */
async function targetHeight(element: HTMLElement): Promise<number> {
  const card = element.closest<HTMLElement>('[data-slot="toast"]');
  if (card === null) throw new Error('The button is not inside a toast card.');
  await Promise.all(card.getAnimations({ subtree: true }).map((animation) => animation.finished));
  const { height } = element.getBoundingClientRect();
  return Math.round(height * devicePixelRatio) / devicePixelRatio;
}

/** The deletion: announced in the polite live region, never taking focus; F6 reaches Undo. */
export const WithUndo: Story = {
  play: async ({ canvas }) => {
    const remove = canvas.getByRole('button', { name: 'Delete entry' });
    await userEvent.click(remove);
    const region = canvas.getByRole('status');
    await waitFor(() => expect(region).toHaveTextContent('Entry deleted'));
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(remove).toHaveFocus();
    const undo = canvas.getByRole('button', { name: 'Undo' });
    const close = canvas.getByRole('button', { name: 'Dismiss' });
    // The 44 px touch target (docs/DESIGN.md §6), measured as it settles: see targetHeight.
    await expect(await targetHeight(undo)).toBeGreaterThanOrEqual(44);
    await expect(await targetHeight(close)).toBeGreaterThanOrEqual(44);
    await userEvent.keyboard('{F6}');
    await expect(undo).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(remove).toHaveFocus();
    await expect(canvas.queryByRole('button', { name: 'Undo' })).toBeNull();
    await userEvent.click(remove);
  },
};

/** One toast at a time: the recorded purchase replaces the deletion. */
export const ReplacesTheOneOnScreen: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Delete entry' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Bought as planned' }));
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Edit' })).toBeVisible());
    await expect(canvas.queryByRole('button', { name: 'Undo' })).toBeNull();
    await expect(canvas.getByRole('status')).toHaveTextContent('Recorded: 100 € of BTC on 16 October 2026.');
  },
};

const SHORT_WINDOW_MS = 1000;

/** A deletion with a short window, and a sheet that opens over it. */
function UnderASheet({ closeLabel }: { closeLabel: string }) {
  const [toasts] = useState(createToastManager);
  const remove = () =>
    toasts.add({
      title: 'Entry deleted',
      description: 'Bought 70 € of BTC on 5 October 2026.',
      timeout: SHORT_WINDOW_MS,
      actionProps: { children: 'Undo', onClick: () => {} },
    });
  return (
    <Toaster closeLabel={closeLabel} toastManager={toasts}>
      <div className="flex flex-wrap gap-target-gap">
        <Button variant="destructive" onClick={remove}>
          Delete entry
        </Button>
        <Sheet>
          <SheetTrigger render={<Button variant="secondary" />}>Edit entry</SheetTrigger>
          <SheetContent>
            <SheetTitle>Edit the entry</SheetTitle>
            <SheetClose render={<Button variant="secondary" />}>Done</SheetClose>
          </SheetContent>
        </Sheet>
      </div>
    </Toaster>
  );
}

/**
 * The toast stays under a sheet's scrim, out of reach, and its window waits there: it outlasts its window
 * while the sheet is open and closes by itself once the sheet has gone (docs/DESIGN.md §7).
 */
export const HeldUnderASheet: Story = {
  render: (args) => <UnderASheet {...args} />,
  play: async ({ canvas, canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const card = () => document.querySelector('[data-slot="toast"]:not([hidden])');
    await userEvent.click(canvas.getByRole('button', { name: 'Delete entry' }));
    await waitFor(() => expect(card()).not.toBeNull());
    await userEvent.click(canvas.getByRole('button', { name: 'Edit entry' }));
    await waitFor(() => expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, SHORT_WINDOW_MS * 1.5));
    await expect(card()).not.toBeNull();
    await userEvent.click(within(document.body).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(card()).toBeNull(), { timeout: SHORT_WINDOW_MS * 3 });
  },
};

/**
 * Delete everything's shape: the control goes with what it deletes, the focus moves to the heading, and the
 * Undo (`focus: 'caller'`) brings the control back and puts the focus on it, ring showing (docs/DESIGN.md §6).
 */
function RestoresTheControl({ closeLabel }: { closeLabel: string }) {
  const [toasts] = useState(createToastManager);
  const [deleted, setDeleted] = useState(false);
  const [restores, setRestores] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const control = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (deleted) heading.current?.focus();
  }, [deleted]);
  useEffect(() => {
    if (restores > 0) control.current?.focus({ focusVisible: true });
  }, [restores]);
  const remove = () => {
    setDeleted(true);
    toasts.add({
      title: 'Plan deleted.',
      timeout: 0,
      actionProps: {
        children: 'Undo',
        focus: 'caller',
        onClick: () => {
          setDeleted(false);
          setRestores((n) => n + 1);
        },
      },
    });
  };
  return (
    <Toaster closeLabel={closeLabel} toastManager={toasts}>
      <section aria-labelledby="toast-story-data" className="flex flex-col gap-stack-sm">
        <h2 ref={heading} id="toast-story-data" tabIndex={-1} className="font-semibold text-20">
          Your data
        </h2>
        {!deleted && (
          <Button ref={control} variant="destructive" className="self-start" onClick={remove}>
            Delete everything
          </Button>
        )}
      </section>
    </Toaster>
  );
}

/** The Undo by a click, by F6 and by Tab: each time the focus lands on the restored control, its ring showing. */
export const UndoFocusesTheRestoredControl: Story = {
  render: (args) => <RestoresTheControl {...args} />,
  play: async ({ canvas }) => {
    const heading = canvas.getByRole('heading', { level: 2, name: 'Your data' });
    const control = () => canvas.getByRole('button', { name: 'Delete everything' });
    const landsOnControl = async () => {
      await waitFor(() => expect(control()).toHaveFocus());
      await expect(control().matches(':focus-visible')).toBe(true);
    };
    for (const reach of ['click', 'F6', 'Tab'] as const) {
      await userEvent.click(control());
      await waitFor(() => expect(heading).toHaveFocus());
      const undo = canvas.getByRole('button', { name: 'Undo' });
      if (reach === 'click') {
        await userEvent.click(undo);
      } else {
        await userEvent.keyboard(reach === 'F6' ? '{F6}' : '{Tab}');
        await expect(undo).toHaveFocus();
        await userEvent.keyboard('{Enter}');
      }
      await landsOnControl();
    }
  },
};

/** The update prompt of ADR-0045 §5: a title and Reload, no description, until it is answered. */
export const UpdatePrompt: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show the update prompt' }));
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Reload' })).toBeVisible());
  },
};
