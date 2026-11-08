import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Settings: Story = {
  render: () => (
    <Tabs defaultValue="plan">
      <TabsList aria-label="Settings">
        <TabsTrigger value="plan">Plan</TabsTrigger>
        <TabsTrigger value="country">Country</TabsTrigger>
        <TabsTrigger value="reminders">Reminders</TabsTrigger>
        <TabsTrigger value="data">Data</TabsTrigger>
      </TabsList>
      <TabsContent value="plan">250 € a month on the 5th, from November 2026 to October 2029.</TabsContent>
      <TabsContent value="country">Portugal: gains are not taxed after 365 days.</TabsContent>
      <TabsContent value="reminders">A calendar event on each buy day.</TabsContent>
      <TabsContent value="data">Last backup on 3 October 2026.</TabsContent>
    </Tabs>
  ),
  play: async ({ canvas }) => {
    const country = canvas.getByRole('tab', { name: 'Country' });
    await expect(country.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await userEvent.click(country);
    await expect(country).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByText('Portugal: gains are not taxed after 365 days.')).toBeVisible();
  },
};

// Settings' four labels, in the screen's order. The list never scrolls:
// the tabs share its width and a long label wraps, at 360 px and at 125 % text, and a focused tab's
// whole ring stays inside the list's box, so nothing clips it.
const LABELS = ['Plan', 'Coins & split', 'Hold & sell', 'Currency & data'] as const;
// Subpixel layout leaves rounding in the boxes; anything past it is a real overflow.
const ROUNDING = 0.01;

function SettingsTabs({ count }: { count: number }) {
  const labels = LABELS.slice(0, count);
  return (
    <Tabs defaultValue={labels[0]}>
      <TabsList aria-label="Settings">
        {labels.map((label) => (
          <TabsTrigger key={label} value={label}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {labels.map((label) => (
        <TabsContent key={label} value={label}>
          The {label} tab.
        </TabsContent>
      ))}
    </Tabs>
  );
}

function px(value: string) {
  return Number(value.replace('px', ''));
}

async function fitsTheList({ canvasElement }: { canvasElement: HTMLElement }) {
  const canvas = within(canvasElement);
  const list = canvas.getByRole('tablist');
  const box = list.getBoundingClientRect();
  await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);

  const tabs = canvas.getAllByRole('tab');
  for (const tab of tabs) {
    const own = tab.getBoundingClientRect();
    await expect(own.height).toBeGreaterThanOrEqual(44);
    await expect(own.left).toBeGreaterThanOrEqual(box.left - ROUNDING);
    await expect(own.right).toBeLessThanOrEqual(box.right + ROUNDING);
    await expect(tab.scrollWidth).toBeLessThanOrEqual(tab.clientWidth);
  }

  // The selected tab takes the tab stop; the arrows move focus through the rest.
  await userEvent.tab();
  for (const [index, tab] of tabs.entries()) {
    if (index > 0) await userEvent.keyboard('{ArrowRight}');
    await expect(tab).toHaveFocus();
    await expect(tab.matches(':focus-visible')).toBe(true);
    const style = getComputedStyle(tab);
    const ring = px(style.outlineWidth) + px(style.outlineOffset);
    await expect(ring).toBeGreaterThan(0);
    const own = tab.getBoundingClientRect();
    await expect(own.left - ring).toBeGreaterThanOrEqual(box.left - ROUNDING);
    await expect(own.right + ring).toBeLessThanOrEqual(box.right + ROUNDING);
    await expect(own.top - ring).toBeGreaterThanOrEqual(box.top - ROUNDING);
    await expect(own.bottom + ring).toBeLessThanOrEqual(box.bottom + ROUNDING);
  }
}

export const ThreeTabs: Story = {
  render: () => <SettingsTabs count={3} />,
  play: fitsTheList,
};

export const FourTabs: Story = {
  render: () => <SettingsTabs count={4} />,
  play: fitsTheList,
};

export const ThreeTabsLargeText: Story = {
  globals: { textZoom: '125' },
  render: () => <SettingsTabs count={3} />,
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe('125%');
    await fitsTheList(context);
  },
};

export const FourTabsLargeText: Story = {
  globals: { textZoom: '125' },
  render: () => <SettingsTabs count={4} />,
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe('125%');
    await fitsTheList(context);
  },
};
