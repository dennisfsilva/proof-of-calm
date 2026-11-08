import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { VIEWPORTS } from '../../.storybook/viewports';

// Proves the test matrix is real: each project pins a width and a theme, and the page must show them.
const meta = {
  title: 'Checks/Environment',
  render: () => <p className="text-ink">The page follows the theme and the width of the project that runs it.</p>,
} satisfies Meta;

export default meta;

export const ThemeAndWidth: StoryObj<typeof meta> = {
  play: async ({ globals }) => {
    const theme = globals.theme === 'dark' ? 'dark' : 'light';
    await expect(document.documentElement.dataset.theme).toBe(theme);
    await expect(getComputedStyle(document.documentElement).colorScheme).toBe(theme);

    const viewport = globals.viewport?.value as keyof typeof VIEWPORTS | undefined;
    if (viewport !== undefined) {
      await expect(`${window.innerWidth}px`).toBe(VIEWPORTS[viewport].styles.width);
    }
  },
};
