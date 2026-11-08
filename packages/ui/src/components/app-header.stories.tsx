import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookOpenIcon, ChartPieIcon, CircleDotIcon, ListIcon } from 'lucide-react';
import { expect, userEvent } from 'storybook/test';
import { AppHeader } from './app-header';

const meta = {
  title: 'Components/App header',
  component: AppHeader,
  parameters: { layout: 'fullscreen' },
  args: {
    brand: { href: '#today', label: 'Proof of Calm' },
    navigation: {
      label: 'Main',
      items: [
        { href: '#today', label: 'Today', icon: CircleDotIcon },
        { href: '#portfolio', label: 'Portfolio', icon: ChartPieIcon, current: true },
        { href: '#log', label: 'Log', icon: ListIcon },
        { href: '#learn', label: 'Learn', icon: BookOpenIcon },
      ],
    },
    settings: { href: '#settings', label: 'Settings' },
  },
} satisfies Meta<typeof AppHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

const wide = () => window.matchMedia('(width >= 48rem)').matches;

export const OnPortfolio: Story = {
  play: async ({ canvas }) => {
    const settings = canvas.getByRole('link', { name: 'Settings' });
    const { width, height } = settings.getBoundingClientRect();
    await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
    await expect(settings).not.toHaveAttribute('aria-current');
    await expect(getComputedStyle(settings, '::after').backgroundColor).toBe('rgba(0, 0, 0, 0)');
    await expect(canvas.getByRole('link', { name: 'Proof of Calm' })).toHaveTextContent('Proof of Calm');

    if (wide()) {
      await expect(canvas.getByRole('link', { name: 'Portfolio' })).toHaveAttribute('aria-current', 'page');
    } else {
      // The destinations live in the tab bar on phones; the header keeps the wordmark and the gear.
      await expect(canvas.queryByRole('navigation', { name: 'Main' })).toBeNull();
    }

    // Keyboard: the wordmark, the destinations from 48rem, then the gear, each with the focus ring.
    const tabs = wide() ? 6 : 2;
    for (let index = 0; index < tabs; index += 1) await userEvent.tab();
    await expect(settings).toHaveFocus();
    await expect(settings.matches(':focus-visible')).toBe(true);
    await expect(getComputedStyle(settings).outlineStyle).toBe('solid');
  },
};

export const OnSettings: Story = {
  args: {
    navigation: {
      label: 'Main',
      items: [
        { href: '#today', label: 'Today', icon: CircleDotIcon },
        { href: '#portfolio', label: 'Portfolio', icon: ChartPieIcon },
        { href: '#log', label: 'Log', icon: ListIcon },
        { href: '#learn', label: 'Learn', icon: BookOpenIcon },
      ],
    },
    settings: { href: '#settings', label: 'Settings', current: true },
  },
  play: async ({ canvas }) => {
    // The current gear is marked like every destination: aria-current and the 2 px ink bar, not a
    // background colour alone (docs/DESIGN.md §2 and §7).
    const settings = canvas.getByRole('link', { name: 'Settings' });
    await expect(settings).toHaveAttribute('aria-current', 'page');
    const bar = getComputedStyle(settings, '::after');
    await expect(bar.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    await expect(bar.height).toBe('2px');
  },
};
