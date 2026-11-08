import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookOpenIcon, ChartPieIcon, CircleDotIcon, ListIcon } from 'lucide-react';
import { expect, userEvent } from 'storybook/test';
import { AppHeader } from './app-header';
import { type LinkProps, type NavItem, TabBar, TopNav } from './navigation';

// The app plugs its router in through `link`; here a stand-in marks what it rendered, so the stories
// prove every destination goes through it.
function StoryLink(props: LinkProps) {
  return <a data-router="story" {...props} />;
}

const items: readonly NavItem[] = [
  { href: '#today', label: 'Today', icon: CircleDotIcon, current: true },
  { href: '#portfolio', label: 'Portfolio', icon: ChartPieIcon },
  { href: '#log', label: 'Log', icon: ListIcon },
  { href: '#learn', label: 'Learn', icon: BookOpenIcon },
];

/** True where the top navigation shows instead of the tab bar (48rem, docs/DESIGN.md §7). */
const wide = () => window.matchMedia('(width >= 48rem)').matches;

/** The space between each pair of neighbouring links, in whole pixels: 8 at least (docs/DESIGN.md §6). */
const gaps = (links: readonly Element[]) =>
  links.slice(1).map((link, index) => {
    const before = links[index]?.getBoundingClientRect().right ?? 0;
    return Math.round(link.getBoundingClientRect().left - before);
  });

const meta = {
  title: 'Components/Navigation',
  component: TabBar,
  args: { label: 'Main', items, link: StoryLink },
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PhoneTabBar: Story = {
  play: async ({ canvasElement }) => {
    const nav = canvasElement.querySelector('nav');
    if (nav === null) throw new Error('no tab bar');
    if (wide()) {
      await expect(nav).not.toBeVisible();
      return;
    }
    const links = [...nav.querySelectorAll('a')];
    await expect(links.map((link) => link.textContent)).toEqual(['Today', 'Portfolio', 'Log', 'Learn']);
    for (const link of links) {
      await expect(link).toHaveAttribute('data-router', 'story');
      const { width, height } = link.getBoundingClientRect();
      await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
    }
    for (const gap of gaps(links)) await expect(gap).toBeGreaterThanOrEqual(8);
    // The current destination is told by aria-current, its weight and its bar, not by colour alone.
    const [today, portfolio] = links;
    await expect(today).toHaveAttribute('aria-current', 'page');
    await expect(portfolio).not.toHaveAttribute('aria-current');
    await expect(getComputedStyle(today as Element).fontWeight).toBe('600');
    await expect(getComputedStyle(portfolio as Element).fontWeight).toBe('400');
    await expect(getComputedStyle(today as Element, '::before').backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    await expect(getComputedStyle(portfolio as Element, '::before').backgroundColor).toBe('rgba(0, 0, 0, 0)');

    // Fixed to the bottom of the screen, with a spacer of its height in the page's flow.
    await expect(getComputedStyle(nav).position).toBe('fixed');
    await expect(Math.round(nav.getBoundingClientRect().bottom)).toBe(window.innerHeight);
    const spacer = canvasElement.querySelector('[data-slot="tab-bar"]');
    await expect(spacer?.getBoundingClientRect().height).toBeCloseTo(nav.getBoundingClientRect().height, 0);

    // Keyboard: each destination takes the focus ring in turn.
    await userEvent.tab();
    await expect(today).toHaveFocus();
    await expect(today?.matches(':focus-visible')).toBe(true);
    await expect(getComputedStyle(today as Element).outlineStyle).toBe('solid');
    await userEvent.tab();
    await expect(portfolio).toHaveFocus();
  },
};

export const DesktopTopNav: Story = {
  render: (args) => <TopNav {...args} />,
  play: async ({ canvasElement }) => {
    const nav = canvasElement.querySelector('nav');
    if (nav === null) throw new Error('no top navigation');
    if (!wide()) {
      await expect(nav).not.toBeVisible();
      return;
    }
    const links = [...nav.querySelectorAll('a')];
    await expect(links).toHaveLength(4);
    for (const link of links) await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    for (const gap of gaps(links)) await expect(gap).toBeGreaterThanOrEqual(8);
    const [today, portfolio] = links;
    await expect(today).toHaveAttribute('aria-current', 'page');
    await expect(getComputedStyle(today as Element).fontWeight).toBe('600');
    await expect(getComputedStyle(portfolio as Element).fontWeight).toBe('400');
    await expect(getComputedStyle(today as Element, '::after').backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  },
};

const paragraphs = Array.from({ length: 14 }, (_, index) => `Entry ${index + 1}: bought 250 € of BTC and ETH.`);

/** A page in the app's frame: the header, the content, the tab bar last. */
export const AppFrame: Story = {
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        brand={{ href: '#today', label: 'Proof of Calm' }}
        navigation={{ label: args.label, items: args.items }}
        settings={{ href: '#settings', label: 'Settings' }}
        link={StoryLink}
      />
      <main className="mx-auto flex w-full max-w-reading flex-1 flex-col gap-stack-md px-gutter py-stack-lg">
        <h1 className="text-28">Log</h1>
        {paragraphs.map((text) => (
          <p key={text} className="text-16">
            {text}
          </p>
        ))}
        <p data-testid="last">The end of the page stays above the tab bar.</p>
      </main>
      <TabBar {...args} />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    const settings = canvas.getByRole('link', { name: 'Settings' });
    const { width, height } = settings.getBoundingClientRect();
    await expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
    await expect(settings).toHaveAttribute('data-router', 'story');
    await expect(canvas.getByRole('link', { name: 'Proof of Calm' })).toHaveAttribute('href', '#today');
    // One navigation landmark at any width: the other is not displayed.
    await expect(canvas.getAllByRole('navigation', { name: 'Main' })).toHaveLength(1);

    if (!wide()) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const nav = canvasElement.ownerDocument.querySelector('[data-slot="tab-bar"] nav');
      const last = canvas.getByTestId('last').getBoundingClientRect();
      await expect(last.bottom).toBeLessThanOrEqual(nav?.getBoundingClientRect().top ?? 0);
      window.scrollTo(0, 0);
    }
  },
};
