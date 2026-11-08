import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { Button } from './button';
import { Input } from './input';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

const meta = {
  title: 'Components/Sheet',
  component: Sheet,
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function WhyHold({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <Sheet {...(defaultOpen === undefined ? {} : { defaultOpen })}>
      <SheetTrigger render={<Button variant="link" size="inline" />}>Why?</SheetTrigger>
      <SheetContent closeLabel="Close">
        <SheetHeader>
          <SheetTitle>Why hold for a year</SheetTitle>
          <SheetDescription>Four minutes to read · reviewed 1 October 2026</SheetDescription>
        </SheetHeader>
        <p>
          In Portugal, gains on crypto held for 365 days or more are not taxed for residents. Each purchase starts its
          own clock, so the plan shows a date for every one.
        </p>
        <SheetFooter>
          <SheetClose render={<Button variant="secondary" />}>Done</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export const Closed: Story = { render: () => <WhyHold /> };

export const Open: Story = {
  render: () => <WhyHold defaultOpen />,
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    await waitFor(() => expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull());
    const sheet = document.querySelector('[data-slot="sheet-content"]');
    const view = document.documentElement.clientWidth;
    const box = sheet?.getBoundingClientRect();
    // Bottom on phones, a side panel from 640 px; never wider than the screen.
    await expect(box?.right ?? 0).toBeLessThanOrEqual(view);
    if (view < 640) await expect(box?.width ?? 0).toBeGreaterThan(view * 0.9);
  },
};

const FIELDS = Array.from({ length: 16 }, (_, index) => `Amount ${index + 1}`);

/**
 * A form taller than the screen: each field scrolled into view stops with its whole focus ring inside the
 * popup's padding box, which clips it (docs/DESIGN.md §6, the sheet's scroll padding).
 */
export const FocusRingInsideTheScroller: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetContent closeLabel="Close">
        <SheetHeader>
          <SheetTitle>Log the monthly buy</SheetTitle>
        </SheetHeader>
        {FIELDS.map((name) => (
          <Input key={name} aria-label={name} inputMode="decimal" />
        ))}
      </SheetContent>
    </Sheet>
  ),
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    await waitFor(() => expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull());
    const sheet = document.querySelector<HTMLElement>('[data-slot="sheet-content"]');
    if (sheet === null) throw new Error('no sheet');
    await expect(sheet.scrollHeight).toBeGreaterThan(sheet.clientHeight);
    const root = getComputedStyle(document.documentElement);
    const px = (value: string) => Number(value.trim().replace('px', ''));
    const ring = px(root.getPropertyValue('--focus-offset')) + px(root.getPropertyValue('--focus-width'));
    const style = getComputedStyle(sheet);
    for (const name of [FIELDS.at(-1), FIELDS[0], FIELDS[8]]) {
      const field = document.querySelector<HTMLElement>(`[aria-label="${name}"]`);
      if (field === null) throw new Error(`no field ${name}`);
      field.focus({ preventScroll: true });
      field.scrollIntoView({ block: 'nearest' });
      const own = field.getBoundingClientRect();
      const outer = sheet.getBoundingClientRect();
      // The padding box, where the popup clips: inside its border.
      await expect(own.top - ring).toBeGreaterThanOrEqual(outer.top + px(style.borderTopWidth));
      await expect(own.bottom + ring).toBeLessThanOrEqual(outer.bottom - px(style.borderBottomWidth));
    }
  },
};
