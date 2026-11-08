import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SegmentedControl } from './segmented-control';

const ranges = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
] as const;

const meta = {
  title: 'Components/Segmented control',
  component: SegmentedControl,
  args: { 'aria-label': 'Chart range', options: ranges, defaultValue: '30d' },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChartRange: Story = {
  play: async ({ canvas }) => {
    const ninety = canvas.getByRole('button', { name: '90D' });
    await userEvent.click(ninety);
    await expect(ninety).toHaveAttribute('aria-pressed', 'true');
    // Pressing the pressed option again keeps it: exactly one is always selected.
    await userEvent.click(ninety);
    await expect(ninety).toHaveAttribute('aria-pressed', 'true');
    for (const option of canvas.getAllByRole('button')) {
      const { width, height } = option.getBoundingClientRect();
      await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
    }
  },
};

export const Currency: Story = {
  args: {
    'aria-label': 'Display currency',
    options: [
      { value: 'EUR', label: 'EUR' },
      { value: 'USD', label: 'USD' },
    ],
    defaultValue: 'EUR',
  },
};

export const Disabled: Story = { args: { disabled: true } };

const ROUNDING = 0.5;

/** The tops of the lines an element's text takes, one per line. */
function lineTops(element: Element) {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  const tops = [...range.getClientRects()].map((rect) => Math.round(rect.top));
  return [...new Set(tops)];
}

const kinds = [
  { value: 'lump', label: 'Starting amount' },
  { value: 'extra', label: 'Extra buy' },
  { value: 'sell', label: 'Sale' },
] as const;

// The entry sheet's choice of kinds (docs/DESIGN.md §8): stretched, the group spans its column and every label
// reads on one line; in a column narrower than that line, a label wraps inside its option, which stays a 44 px
// target and never overflows, and the group never scrolls.
export const Stretched: Story = {
  args: { 'aria-label': 'Type of transaction', options: kinds, defaultValue: 'lump', stretch: true },
  render: (args) => (
    <div className="flex flex-col gap-stack-md">
      <div className="max-w-md" data-testid="wide">
        <SegmentedControl {...args} />
      </div>
      <div className="w-56" data-testid="narrow">
        <SegmentedControl {...args} aria-label="Type of transaction, narrow" />
      </div>
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    await canvasElement.ownerDocument.fonts.ready;
    const wide = canvas.getByTestId('wide');
    const group = within(wide).getByRole('group');
    await expect(group.getBoundingClientRect().width).toBeGreaterThanOrEqual(
      wide.getBoundingClientRect().width - ROUNDING,
    );
    for (const option of within(wide).getAllByRole('button')) {
      const { width, height } = option.getBoundingClientRect();
      await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
      await expect(lineTops(option)).toHaveLength(1);
    }
    const narrow = canvas.getByTestId('narrow');
    const squeezed = within(narrow).getByRole('group');
    await expect(squeezed.scrollWidth).toBeLessThanOrEqual(squeezed.clientWidth);
    const options = within(narrow).getAllByRole('button');
    await expect(Math.max(...options.map((option) => lineTops(option).length))).toBeGreaterThanOrEqual(2);
    for (const option of options) {
      const { width, height } = option.getBoundingClientRect();
      await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
      await expect(option.scrollWidth).toBeLessThanOrEqual(option.clientWidth);
    }
  },
};

// A focused, pressed last option (the Log sheet's "Sale" on android-small and zoom-125): the group is padded
// by the focus ring's extent (docs/DESIGN.md §6), so the ring stays inside the group's border.
export const FocusRingInsideTheGroup: Story = {
  args: { 'aria-label': 'Type of transaction', options: kinds, defaultValue: 'sell', stretch: true },
  render: (args) => (
    <div className="max-w-md">
      <SegmentedControl {...args} />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const root = getComputedStyle(document.documentElement);
    const px = (value: string) => Number(value.trim().replace('px', ''));
    const ring = px(root.getPropertyValue('--focus-offset')) + px(root.getPropertyValue('--focus-width'));
    await expect(ring).toBeGreaterThan(0);
    const sale = canvas.getByRole('button', { name: 'Sale' });
    await expect(sale).toHaveAttribute('aria-pressed', 'true');
    await userEvent.tab();
    await userEvent.keyboard('{End}');
    await expect(sale).toHaveFocus();
    await expect(sale.matches(':focus-visible')).toBe(true);
    const group = canvas.getByRole('group');
    const style = getComputedStyle(group);
    const own = sale.getBoundingClientRect();
    const box = group.getBoundingClientRect();
    // The inner border edge, where the group's border starts (a hundredth of a pixel for subpixel layout).
    const EPSILON = 0.01;
    await expect(own.top - ring).toBeGreaterThanOrEqual(box.top + px(style.borderTopWidth) - EPSILON);
    await expect(own.right + ring).toBeLessThanOrEqual(box.right - px(style.borderRightWidth) + EPSILON);
    await expect(own.bottom + ring).toBeLessThanOrEqual(box.bottom - px(style.borderBottomWidth) + EPSILON);
    await expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
  },
};
