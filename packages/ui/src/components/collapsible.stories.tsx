import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';
import { Field, FieldDescription, FieldLabel } from './field';
import { Input } from './input';
import { Textarea } from './textarea';

const meta = {
  title: 'Components/Collapsible',
  component: Collapsible,
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

function More({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <Collapsible className="max-w-reading" {...(defaultOpen === undefined ? {} : { defaultOpen })}>
      <CollapsibleTrigger>More</CollapsibleTrigger>
      <CollapsibleContent>
        <Field className="pt-stack-sm">
          <FieldLabel>Where you bought</FieldLabel>
          <Input defaultValue="Bitstamp" />
          <FieldDescription>Portugal matches lots per platform, so the venue is kept with each buy.</FieldDescription>
        </Field>
      </CollapsibleContent>
    </Collapsible>
  );
}

export const LogFormMore: Story = {
  render: () => <More />,
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: 'More' });
    await expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByLabelText('Where you bought')).toBeNull();

    // The padding keeps the focus ring off the letters; the negative margin keeps the label on the
    // root's left edge, so the padding moves nothing in the closed layout.
    await expect(getComputedStyle(trigger).paddingLeft).toBe('8px');
    await expect(getComputedStyle(trigger).paddingRight).toBe('8px');
    const root = trigger.closest('[data-slot="collapsible"]');
    await expect(root).not.toBeNull();
    const label = within(trigger).getByText('More');
    await expect(label.getBoundingClientRect().left).toBeCloseTo(root?.getBoundingClientRect().left ?? Number.NaN);

    // Keyboard: Tab reaches the trigger with the focus ring; Enter opens, Space closes.
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await expect(trigger.matches(':focus-visible')).toBe(true);
    await expect(getComputedStyle(trigger).outlineStyle).toBe('solid');
    await userEvent.keyboard('{Enter}');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(canvas.getByLabelText('Where you bought')).toBeVisible());
    await userEvent.keyboard(' ');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(canvas.queryByLabelText('Where you bought')).toBeNull());
  },
};

export const Open: Story = {
  render: () => <More defaultOpen />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByLabelText('Where you bought')).toBeVisible();
  },
};

/** The focus ring's extent outside its box (docs/DESIGN.md §6), read from the tokens. */
function ringReach(document: Document) {
  const root = getComputedStyle(document.documentElement);
  const px = (value: string) => Number(value.trim().replace('px', ''));
  return px(root.getPropertyValue('--focus-offset')) + px(root.getPropertyValue('--focus-width'));
}

// The Log form's "Venue and note": the panel clips at its padding box for the height animation, so it is
// padded by the ring's extent, and a matching negative margin keeps its fields on the root's edges. Every
// caller's column sits inside a padded parent (the sheet's inset, the page's gutter), as this one does, so
// the margin stays inside that padding and the page never scrolls sideways.
export const FocusRingsInsideThePanel: Story = {
  render: () => (
    <div className="px-inset">
      <Collapsible className="max-w-reading" defaultOpen>
        <CollapsibleTrigger>Venue and note</CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-stack-md pt-stack-sm">
            <Field>
              <FieldLabel>Venue</FieldLabel>
              <Input defaultValue="Bitstamp" />
            </Field>
            <Field>
              <FieldLabel>Note</FieldLabel>
              <Textarea />
            </Field>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const ring = ringReach(document);
    await expect(ring).toBeGreaterThan(0);
    const venue = await canvas.findByLabelText('Venue');
    const note = canvas.getByLabelText('Note');
    const panel = venue.closest<HTMLElement>('[data-slot="collapsible-content"]');
    const root = venue.closest<HTMLElement>('[data-slot="collapsible"]');
    if (panel === null || root === null) throw new Error('no panel');
    await expect(getComputedStyle(panel).overflow).toBe('hidden');
    for (const field of [venue, note]) {
      field.focus();
      await expect(field).toHaveFocus();
      const own = field.getBoundingClientRect();
      const box = panel.getBoundingClientRect();
      await expect(own.left - ring).toBeGreaterThanOrEqual(box.left);
      await expect(own.right + ring).toBeLessThanOrEqual(box.right);
      await expect(own.top - ring).toBeGreaterThanOrEqual(box.top);
      await expect(own.bottom + ring).toBeLessThanOrEqual(box.bottom);
      // The padding moves nothing: the fields keep the root's edges.
      const edges = root.getBoundingClientRect();
      await expect(own.left).toBeCloseTo(edges.left);
      await expect(own.right).toBeCloseTo(edges.right);
    }
    // The last field's ring ends inside the root, so the panel's layout is the same height as before.
    await expect(note.getBoundingClientRect().bottom).toBeCloseTo(root.getBoundingClientRect().bottom);
    await expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
  },
};

// The panel's negative margin reaches up under the trigger when the root has no gap (its default): the
// trigger stacks above the open panel, so a tap just above its bottom edge still lands on it and closes
// the panel, and the trigger keeps its whole 44 px target (docs/DESIGN.md §6).
export const TriggerKeepsItsTargetOverTheOpenPanel: Story = {
  render: () => <More defaultOpen />,
  play: async ({ canvas, canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const trigger = canvas.getByRole('button', { name: 'More' });
    const panel = (await canvas.findByLabelText('Where you bought')).closest('[data-slot="collapsible-content"]');
    await expect(panel).not.toBeNull();
    await expect(getComputedStyle(trigger.parentElement ?? trigger).rowGap).toBe('normal');
    const box = trigger.getBoundingClientRect();
    const x = box.left + box.width / 2;
    for (const above of [1, 3]) {
      const hit = document.elementFromPoint(x, box.bottom - above);
      await expect(hit !== null && trigger.contains(hit)).toBe(true);
    }
    const hit = document.elementFromPoint(x, box.bottom - 1);
    if (!(hit instanceof Element)) throw new Error('nothing at the point');
    await userEvent.click(hit);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(canvas.queryByLabelText('Where you bought')).toBeNull());
  },
};

const twoLineLabel = 'Show how the plan works, what it costs and what can go wrong along the way';

// A label that wraps at phone width (the template step's "Show how it works and what can go wrong"
// on android-small and zoom-125): its lines start at the left edge of the step's column instead of
// centred under the button's default, and the browser balances them so no word stands alone.
export const TwoLineLabel: Story = {
  render: () => (
    <Collapsible className="max-w-reading">
      <CollapsibleTrigger>{twoLineLabel}</CollapsibleTrigger>
      <CollapsibleContent>
        <p className="pt-stack-sm text-16 text-ink-2">The plan buys the same amount every month.</p>
      </CollapsibleContent>
    </Collapsible>
  ),
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: twoLineLabel });
    const label = within(trigger).getByText(twoLineLabel);
    await expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(getComputedStyle(trigger).textAlign).toBe('left');
    await expect(getComputedStyle(label).textWrap).toBe('balance');
    if (window.innerWidth < 640) {
      // At phone width the label takes two lines (a range over its text has one rect per line box; the
      // span itself is a flex item, so it reports one), and the chevron stays beside them, not under.
      const lines = document.createRange();
      lines.selectNodeContents(label);
      await expect(lines.getClientRects().length).toBeGreaterThanOrEqual(2);
      const chevron = trigger.querySelector('svg');
      await expect(chevron).not.toBeNull();
      await expect(chevron?.getBoundingClientRect().left).toBeGreaterThanOrEqual(label.getBoundingClientRect().right);
    }
  },
};
