import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classConflicts, findClassConflicts, SPACING_ALIASES, TEXT_SIZES } from './class-conflicts';

const theme = readFileSync(fileURLToPath(new URL('../styles/theme.css', import.meta.url)), 'utf8');
const declared = (namespace: string) =>
  [...theme.matchAll(new RegExp(`^\\s*--${namespace}-([a-z0-9-]+):`, 'gm'))]
    .map((match) => match[1] ?? '')
    .filter((name) => !name.includes('--'));

describe('classConflicts', () => {
  it('lets a font size sit beside a text colour and reports the earlier of two sizes', () => {
    expect(classConflicts('text-13 text-ink-2')).toEqual([]);
    expect(classConflicts('text-13 text-ink-2 text-16')).toEqual(['text-13']);
  });

  it('knows our spacing names against the numeric scale', () => {
    expect(classConflicts('p-inset p-2')).toEqual(['p-inset']);
    expect(classConflicts('px-4 px-gutter')).toEqual(['px-4']);
    expect(classConflicts('min-h-target min-h-row')).toEqual(['min-h-target']);
  });

  it('knows our easing, tracking, shadow and measure names', () => {
    expect(classConflicts('ease-enter ease-exit')).toEqual(['ease-enter']);
    expect(classConflicts('tracking-heading tracking-normal')).toEqual(['tracking-heading']);
    expect(classConflicts('shadow-overlay shadow-none')).toEqual(['shadow-overlay']);
    expect(classConflicts('max-w-reading max-w-table')).toEqual(['max-w-reading']);
  });

  it('leaves variants, repeated classes and classes it does not know alone', () => {
    expect(classConflicts('px-4 md:px-6 px-4 lucide lucide-check')).toEqual([]);
    expect(classConflicts('  ')).toEqual([]);
  });

  it('knows every type size and spacing alias that theme.css defines', () => {
    expect(declared('text')).toEqual([...TEXT_SIZES]);
    expect(declared('spacing')).toEqual([...SPACING_ALIASES]);
  });
});

describe('findClassConflicts', () => {
  it('names each element whose classes conflict, with the losing classes', () => {
    const element = (tagName: string, className: string | null) => ({ tagName, getAttribute: () => className });
    const root = {
      querySelectorAll: () => [
        element('DIV', 'px-4 px-gutter text-13'),
        element('SPAN', 'text-13 text-ink-2'),
        element('svg', null),
      ],
    } as unknown as ParentNode;
    expect(findClassConflicts(root)).toEqual(['<div class="px-4 px-gutter text-13">: px-4']);
  });
});
