// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyAppearance } from './apply';

describe('applyAppearance (ADR-0045 §3, docs/DESIGN.md §6)', () => {
  it('sets data-theme and data-motion for an explicit theme and reduced motion', () => {
    const root = document.createElement('html');
    applyAppearance(root, { theme: 'dark', motion: 'reduce' });
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-motion')).toBe('reduce');
    applyAppearance(root, { theme: 'light', motion: 'reduce' });
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('removes both attributes when the system preference is in charge', () => {
    const root = document.createElement('html');
    root.setAttribute('data-theme', 'dark');
    root.setAttribute('data-motion', 'reduce');
    applyAppearance(root, { theme: 'system', motion: 'system' });
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(root.hasAttribute('data-motion')).toBe(false);
  });
});
