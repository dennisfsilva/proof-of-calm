import type { Decorator, Preview } from '@storybook/react-vite';
import { createElement, type ReactNode, useLayoutEffect } from 'react';
import { findClassConflicts } from '../src/lib/class-conflicts.ts';

// What every Storybook of the repository shares (`@proofofcalm/ui/storybook`): the seven viewports,
// the theme, motion and text-size globals with the decorator that applies them, and the class-conflict
// check. packages/ui's preview.tsx and viewports.ts re-export from here; packages/app's preview adds
// its navigation and message providers on top.

// The seven Playwright projects of docs/ENGINEERING.md §3 as Storybook viewports. zoom-125 and
// reduced-motion also need the text-zoom and motion globals, as the e2e fixtures do.
export const VIEWPORTS = {
  'android-small': { name: 'android-small (360 × 780)', styles: { width: '360px', height: '780px' }, type: 'mobile' },
  iphone: { name: 'iphone (390 × 844)', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  tablet: { name: 'tablet (768 × 1024)', styles: { width: '768px', height: '1024px' }, type: 'tablet' },
  desktop: { name: 'desktop (1280 × 800)', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
  'desktop-wide': {
    name: 'desktop-wide (1920 × 1080)',
    styles: { width: '1920px', height: '1080px' },
    type: 'desktop',
  },
  'zoom-125': { name: 'zoom-125 (390 × 844, text 125 %)', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  'reduced-motion': {
    name: 'reduced-motion (390 × 844)',
    styles: { width: '390px', height: '844px' },
    type: 'mobile',
  },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

/** The widths every story is tested at, in light and dark (docs/ENGINEERING.md §2). */
export const TESTED_VIEWPORTS = ['android-small', 'desktop'] as const satisfies readonly ViewportName[];

type Theme = 'light' | 'dark';
type Motion = 'full' | 'reduce';
type TextZoom = '100' | '125';

/**
 * Applies the globals the way the app does: data-theme and data-motion on <html> (docs/DESIGN.md §3
 * and §6), and the root font size the zoom-125 project injects (ADR-0024).
 */
function Frame({
  theme,
  motion,
  textZoom,
  children,
}: {
  theme: Theme;
  motion: Motion;
  textZoom: TextZoom;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.motion = motion;
    root.style.fontSize = textZoom === '125' ? '125%' : '';
  }, [theme, motion, textZoom]);
  return children;
}

export const withGlobals: Decorator = (Story, context) =>
  createElement(Frame, {
    theme: context.globals.theme === 'dark' ? 'dark' : 'light',
    motion: context.globals.motion === 'reduce' ? 'reduce' : 'full',
    textZoom: context.globals.textZoom === '125' ? '125' : '100',
    children: createElement(Story),
  });

// `cn` does not merge classes (ADR-0043): a story whose page holds two utilities for one property on
// an element fails its test, portals included.
export const failOnClassConflicts: NonNullable<Preview['afterEach']> = ({ canvasElement }) => {
  const conflicts = findClassConflicts(canvasElement.ownerDocument.body);
  if (conflicts.length > 0) throw new Error(`Conflicting utilities:\n${conflicts.join('\n')}`);
};

export const globalTypes: NonNullable<Preview['globalTypes']> = {
  theme: {
    description: 'Colour theme',
    toolbar: {
      title: 'Theme',
      icon: 'mirror',
      items: [
        { value: 'light', title: 'Light' },
        { value: 'dark', title: 'Dark' },
      ],
      dynamicTitle: true,
    },
  },
  motion: {
    description: 'Motion preference',
    toolbar: {
      title: 'Motion',
      icon: 'transfer',
      items: [
        { value: 'full', title: 'Full motion' },
        { value: 'reduce', title: 'Reduced motion' },
      ],
      dynamicTitle: true,
    },
  },
  textZoom: {
    description: 'Root font size',
    toolbar: {
      title: 'Text size',
      icon: 'zoom',
      items: [
        { value: '100', title: 'Text 100 %' },
        { value: '125', title: 'Text 125 %' },
      ],
      dynamicTitle: true,
    },
  },
};
