import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { useSnapshot } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import { EntrySheet, type EntrySheetProps } from './entry-sheet';

// The entry sheet over the fixture plan on 20 Oct 2026, editing the starting amount of 5 Apr 2026 (0.0125 BTC and
// 0.12 ETH); 0.06 ETH was sold on 20 Sep 2026.
const lump = fixtureSnapshot().entries.filter((entry) => entry.kind === 'lump');

const meta = {
  title: 'Features/Log/EntrySheet',
  component: EntrySheet,
  args: { kind: 'lump', editing: lump, open: true, onOpenChange: fn(), onDone: fn() },
  parameters: {
    services: () => createTestServices({ snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') }),
  },
} satisfies Meta<typeof EntrySheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EditStartingAmount: Story = {
  play: async () => {
    const sheet = within(await within(document.body).findByRole('dialog', { name: 'Edit the entry' }));
    await expect(await sheet.findByLabelText('ETH received (units)')).toHaveValue('0.12');
  },
};

// A CSS length in pixels, as a computed style or a custom property gives it.
const px = (value: string) => Number(value.trim().replace('px', ''));

// How far the focus ring reaches outside its box: the computed --focus-offset plus --focus-width.
function ringExtent() {
  const root = getComputedStyle(document.documentElement);
  return px(root.getPropertyValue('--focus-width')) + px(root.getPropertyValue('--focus-offset'));
}

// A refused save (session 21's evaluator): 0.0005 ETH on 5 Apr leaves 0.0595 ETH bought before the 20 Sep sale of
// 0.06. Enter on Save puts the alert line above Save; the sheet then scrolls, so the focused Save with its whole ring
// and the alert line stay in the sheet's scroll area and on the screen (WCAG 2.4.11, docs/DESIGN.md §6).
async function refusedSaveInView({ canvasElement }: StoryContext) {
  const dialog = await within(document.body).findByRole('dialog', { name: 'Edit the entry' });
  const sheet = within(dialog);
  const units = await sheet.findByLabelText('ETH received (units)');
  await userEvent.clear(units);
  await userEvent.type(units, '0.0005');
  const save = sheet.getByRole('button', { name: 'Save' });
  save.focus();
  await userEvent.keyboard('{Enter}');
  const alert = await sheet.findByRole('alert');
  await expect(alert).toHaveTextContent(/your ETH sale on/);
  await expect(save).toHaveFocus();
  const extent = ringExtent();
  await expect(extent).toBeGreaterThan(0);
  const view = canvasElement.ownerDocument.defaultView ?? window;
  await waitFor(async () => {
    const frame = dialog.getBoundingClientRect();
    // The scroll area is the sheet's padding box: what the border and a scroll bar leave of it.
    const top = Math.max(frame.top + dialog.clientTop, 0);
    const bottom = Math.min(frame.top + dialog.clientTop + dialog.clientHeight, view.innerHeight);
    const ring = save.getBoundingClientRect();
    await expect(ring.top - extent).toBeGreaterThanOrEqual(top);
    await expect(ring.bottom + extent).toBeLessThanOrEqual(bottom);
    const line = alert.getBoundingClientRect();
    await expect(line.top).toBeGreaterThanOrEqual(top);
    await expect(line.bottom).toBeLessThanOrEqual(bottom);
  });
  await expect(alert).toBeVisible();
}

/** android-small (360 × 780), where Save sat 702.7 px down before Enter and left the screen after it. */
export const RefusedSaveInView: Story = {
  globals: { viewport: { value: 'android-small', isRotated: false } },
  play: refusedSaveInView,
};

// The same refused save by Enter in the date field (the evaluator of issue 201: the sheet is too short to show the
// field and the line together). The line sits below the fields, so the focus moves to the alert line, and the sheet scrolls
// by the least that shows it whole with its focus ring (docs/DESIGN.md §6).
async function refusedSaveFromField({ canvasElement }: StoryContext) {
  const dialog = await within(document.body).findByRole('dialog', { name: 'Edit the entry' });
  const sheet = within(dialog);
  const units = await sheet.findByLabelText('ETH received (units)');
  await userEvent.clear(units);
  await userEvent.type(units, '0.0005');
  const date = sheet.getByLabelText('Date');
  date.focus();
  await userEvent.keyboard('{Enter}');
  const alert = await sheet.findByRole('alert');
  await expect(alert).toHaveTextContent(/your ETH sale on/);
  await waitFor(() => expect(alert).toHaveFocus());
  const extent = ringExtent();
  await expect(extent).toBeGreaterThan(0);
  const view = canvasElement.ownerDocument.defaultView ?? window;
  await waitFor(async () => {
    const frame = dialog.getBoundingClientRect();
    const top = Math.max(frame.top + dialog.clientTop, 0);
    const bottom = Math.min(frame.top + dialog.clientTop + dialog.clientHeight, view.innerHeight);
    const ring = alert.getBoundingClientRect();
    await expect(ring.top - extent).toBeGreaterThanOrEqual(top);
    await expect(ring.bottom + extent).toBeLessThanOrEqual(bottom);
  });
  await expect(alert).toHaveFocus();
}

/** android-small, Enter in the date field. */
export const RefusedSaveFromField: Story = {
  globals: { viewport: { value: 'android-small', isRotated: false } },
  play: refusedSaveFromField,
};

/** zoom-125, Enter in the date field. */
export const RefusedSaveFromFieldLargeText: Story = {
  globals: { viewport: { value: 'zoom-125', isRotated: false }, textZoom: '125' },
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe('125%');
    await refusedSaveFromField(context);
  },
};

/** zoom-125 (390 × 844 with the 20 px root of 125 % text). */
export const RefusedSaveInViewLargeText: Story = {
  globals: { viewport: { value: 'zoom-125', isRotated: false }, textZoom: '125' },
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe('125%');
    await refusedSaveInView(context);
  },
};

/** The tops of the lines an element's text takes, one per line. */
function lineTops(element: Element) {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  return [...new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))];
}

// The choice of kinds of a new transaction (docs/CONTENT-STYLE.md §3, Record on the Log) while coins are held: the
// options in order with the opened kind pressed, each label on one line, each option a 44 px target whose whole
// focus ring lies inside the sheet's padding box, which clips a scrolling popup (docs/DESIGN.md §6).
async function kindsFit({ canvasElement }: StoryContext, title: string, names: readonly string[]) {
  await canvasElement.ownerDocument.fonts.ready;
  const dialog = await within(document.body).findByRole('dialog', { name: title });
  const group = within(dialog).getByRole('group', { name: 'Type of transaction' });
  const options = within(group).getAllByRole('button');
  await expect(options.map((option) => option.textContent)).toEqual(names);
  await expect(options.map((option) => option.getAttribute('aria-pressed'))).toEqual(
    names.map((_, index) => String(index === 0)),
  );
  const extent = ringExtent();
  await expect(extent).toBeGreaterThan(0);
  const frame = dialog.getBoundingClientRect();
  const left = frame.left + dialog.clientLeft;
  const top = frame.top + dialog.clientTop;
  for (const option of options) {
    await expect(lineTops(option)).toHaveLength(1);
    const own = option.getBoundingClientRect();
    await expect(Math.min(own.width, own.height)).toBeGreaterThanOrEqual(44);
    await expect(own.left - extent).toBeGreaterThanOrEqual(left);
    await expect(own.right + extent).toBeLessThanOrEqual(left + dialog.clientWidth);
    await expect(own.top - extent).toBeGreaterThanOrEqual(top);
    await expect(own.bottom + extent).toBeLessThanOrEqual(top + dialog.clientHeight);
  }
  return within(dialog);
}

const STARTING = ['Starting amount', 'Extra buy', 'Sale'];

// The sheet opens once the plan has loaded, as the Log's Record does: whether coins are held is read as it opens.
function Loaded(args: EntrySheetProps) {
  const loaded = useSnapshot((snapshot) => snapshot.plan !== null);
  return loaded ? <EntrySheet {...args} /> : null;
}

/** The project viewports (360 and 1280) at 100 % text; a choice keeps the focus on the pressed option. */
export const Kinds: Story = {
  args: { kind: 'lump', editing: [], offerKinds: true },
  render: (args) => <Loaded {...args} />,
  play: async (context) => {
    const sheet = await kindsFit(context, 'Log the starting amount', STARTING);
    const extra = sheet.getByRole('button', { name: 'Extra buy' });
    await userEvent.click(extra);
    await within(document.body).findByRole('dialog', { name: 'Log an extra buy' });
    await expect(extra).toHaveAttribute('aria-pressed', 'true');
    await expect(extra).toHaveFocus();
  },
};

/** zoom-125 (390 px with 125 % text). */
export const KindsLargeText: Story = {
  args: { kind: 'lump', editing: [], offerKinds: true },
  render: (args) => <Loaded {...args} />,
  globals: { viewport: { value: 'zoom-125', isRotated: false }, textZoom: '125' },
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe('125%');
    await kindsFit(context, 'Log the starting amount', STARTING);
  },
};

/** The monthly loop at 360 and 1280 px with 125 % text, the bar the Tabs meet (docs/DESIGN.md §8). */
export const MonthlyKindsLargeTextNarrow: Story = {
  args: { kind: 'dca', editing: [], offerKinds: true },
  render: (args) => <Loaded {...args} />,
  globals: { textZoom: '125' },
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe('125%');
    await kindsFit(context, 'Log the monthly buy', ['Monthly buy', 'Extra buy', 'Sale']);
  },
};
