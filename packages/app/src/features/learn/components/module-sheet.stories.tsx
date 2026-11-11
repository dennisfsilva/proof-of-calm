import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { Suspense, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ModuleSheet } from './module-sheet';

// One module in its sheet, the fixture through the real pipeline; the test projects of vitest.config.ts render
// it at 360 and 1280 px, light and dark, with axe.

const IDEA = "The fixture's one idea, for the tests and the stories.";

/** Whether a heading's box lies inside the popup's visible scroll area, by the browser's own layout. */
function insideScrollArea(element: HTMLElement) {
  const area = element.closest<HTMLElement>('[role="dialog"]')?.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  return area !== undefined && box.top >= area.top && box.bottom <= area.bottom;
}

const meta = {
  title: 'Features/Learn/ModuleSheet',
  component: ModuleSheet,
  args: { slug: 'start-here', open: true, onOpenChange: () => undefined },
  render: function Render(args) {
    const [open, setOpen] = useState(args.open);
    return (
      <Suspense fallback={null}>
        <ModuleSheet {...args} open={open} onOpenChange={setOpen} />
      </Suspense>
    );
  },
} satisfies Meta<typeof ModuleSheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const StartHere: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole('dialog', { name: IDEA });
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getByText("The fixture's caveat, in its box.")).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
  },
};

// The section reached by the focus alone: a popup short enough that the heading starts below its fold, so the
// browser has to scroll the popup, the one thing a jsdom test cannot show.
export const OnASection: Story = {
  args: { section: 'a-section' },
  decorators: [
    (Story) => (
      <>
        <style>{'[role="dialog"] { max-height: 10rem; }'}</style>
        <Story />
      </>
    ),
  ],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const heading = await page.findByRole('heading', { level: 2, name: 'A section' });
    await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(heading));
    await waitFor(() => expect(insideScrollArea(heading)).toBe(true));
    await expect(heading.closest('[role="dialog"]')?.scrollTop).toBeGreaterThan(0);
  },
};

/** How far the element's whole box stands inside the window; negative when any of it is out. */
function insideWindow(element: HTMLElement) {
  const { top, bottom } = element.getBoundingClientRect();
  return Math.min(top, (element.ownerDocument.defaultView?.innerHeight ?? 0) - bottom);
}

/** The room between the bottom of one element and the top of the one below it; negative when they overlap. */
function roomBetween(above: HTMLElement, below: HTMLElement) {
  return below.getBoundingClientRect().top - above.getBoundingClientRect().bottom;
}

/** The element's distance from the top right of the popup's border box: 8 px and the 1 px border, as `top-2 right-2`. */
function fromCorner(element: HTMLElement) {
  const popup = element.closest('[role="dialog"]')?.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  return popup === undefined ? [] : [box.top - popup.top, popup.right - box.right];
}

/** The fixture is short: these rules give it a real module's length above and below its section. */
const longModule: Decorator = (Story) => (
  <>
    <style>{'[role="dialog"] article { gap: 200dvh; padding-bottom: 200dvh; }'}</style>
    <Story />
  </>
);

// `Close` over a long module, by the browser's own layout, which a jsdom test cannot show, at the popup's own height.
// The section opens by the focus alone; then the heading's scroll margin has to hold it clear of `Close` where the
// browser sets a heading at the top; and at rest, at the top of the module, `Close` sits at the popup's top right.
export const CloseOverALongModule: Story = {
  args: { section: 'a-section' },
  decorators: [longModule],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const heading = await page.findByRole('heading', { level: 2, name: 'A section' });
    const popup = heading.closest<HTMLElement>('[role="dialog"]');
    if (popup === null) throw new Error('the heading stands in the popup');
    const close = within(popup).getByRole('button', { name: 'Close' });

    await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(heading));
    await waitFor(() => expect(popup.scrollTop).toBeGreaterThan(0));
    await waitFor(() => expect(insideWindow(close)).toBeGreaterThanOrEqual(0));
    await expect(roomBetween(close, heading)).toBeGreaterThanOrEqual(0);

    heading.scrollIntoView({ block: 'start' });
    await waitFor(() => expect(roomBetween(close, heading)).toBeLessThan(16));
    await expect(roomBetween(close, heading)).toBeGreaterThanOrEqual(0);
    await expect(fromCorner(close)).toEqual([9, 9]);

    popup.scrollTop = 0;
    await waitFor(() => expect(popup.scrollTop).toBe(0));
    await expect(fromCorner(close)).toEqual([9, 9]);
    const { width, height } = close.getBoundingClientRect();
    await expect([width, height]).toEqual([44, 44]);
    const top = popup.getBoundingClientRect().top;
    await expect(popup.querySelector('article')?.getBoundingClientRect().top).toBe(top + 25);
  },
};

// The reader's place as the focus moves onto `Close`. It is sticky, so a browser that counts it as not fully visible
// scrolls the module to reveal it, and it does not move: only the place is lost. The fixture has nothing to tab to
// between the two, so Shift+Tab reaches it directly.
export const FocusOnCloseKeepsThePlace: Story = {
  args: { section: 'a-section' },
  decorators: [longModule],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const heading = await page.findByRole('heading', { level: 2, name: 'A section' });
    const popup = heading.closest<HTMLElement>('[role="dialog"]');
    if (popup === null) throw new Error('the heading stands in the popup');
    const close = within(popup).getByRole('button', { name: 'Close' });

    await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(heading));
    await waitFor(() => expect(popup.scrollTop).toBeGreaterThan(0));
    const place = popup.scrollTop;

    await userEvent.tab({ shift: true });
    await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(close));
    await expect(popup.scrollTop).toBe(place);
    await expect(insideScrollArea(heading)).toBe(true);
    await expect(roomBetween(close, heading)).toBeGreaterThanOrEqual(0);
  },
};

/** The focus ring's extent outside the box, `--focus-offset` and `--focus-width` (docs/DESIGN.md §6). */
const RING = 4;

/** Whether two boxes share any area. */
function intersects(a: DOMRect, b: DOMRect) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// A link Tab reaches in the module's body, scrolled under `Close` first: the browser's own reveal has to stop it with
// its whole ring clear of the button (docs/DESIGN.md §6), by the link's scroll margin, since the popup's padding is
// only the ring's extent. From `Close` the next stop is the fixture's Risk link.
export const TabToALinkUnderClose: Story = {
  args: { section: 'a-section' },
  decorators: [longModule],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const heading = await page.findByRole('heading', { level: 2, name: 'A section' });
    const popup = heading.closest<HTMLElement>('[role="dialog"]');
    if (popup === null) throw new Error('the heading stands in the popup');
    const close = within(popup).getByRole('button', { name: 'Close' });
    const link = within(popup).getByRole('link', { name: 'Risk disclosure' });
    await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(heading));

    close.focus();
    popup.scrollTop += link.getBoundingClientRect().top - popup.getBoundingClientRect().top - 20;
    await waitFor(() =>
      expect(link.getBoundingClientRect().top - popup.getBoundingClientRect().top).toBeCloseTo(20, 0),
    );
    await expect(roomBetween(close, link)).toBeLessThan(0);

    await userEvent.tab();
    await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(link));
    await waitFor(() => expect(roomBetween(close, link)).toBeGreaterThanOrEqual(RING));
    const button = close.getBoundingClientRect();
    await expect([...link.getClientRects()].filter((fragment) => intersects(fragment, button))).toEqual([]);
  },
};

// The caveat scrolled up to `Close` at 125 % text zoom, a 20 px root as the e2e zoom-125 project sets it: the module
// keeps a column clear of the button, so the button never stands over the text that passes under it.
export const CaveatClearOfCloseAtZoom: Story = {
  decorators: [
    longModule,
    (Story) => (
      <>
        <style>{':root { font-size: 20px; }'}</style>
        <Story />
      </>
    ),
  ],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const popup = await page.findByRole('dialog', { name: IDEA });
    const close = within(popup).getByRole('button', { name: 'Close' });
    const caveat = within(popup).getByText("The fixture's caveat, in its box.");
    await expect(close.getBoundingClientRect().width).toBe(55);

    popup.scrollTop += caveat.getBoundingClientRect().top - close.getBoundingClientRect().top;
    await waitFor(() =>
      expect(caveat.getBoundingClientRect().top - close.getBoundingClientRect().top).toBeCloseTo(0, 0),
    );
    await expect(intersects(caveat.getBoundingClientRect(), close.getBoundingClientRect())).toBe(false);
  },
};
