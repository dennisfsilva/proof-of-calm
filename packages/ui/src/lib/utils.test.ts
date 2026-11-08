import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins class names in order and leaves falsy ones out', () => {
    expect(cn('text-13', false, undefined, null, ['text-ink-2', { 'px-gutter': true, hidden: false }])).toBe(
      'text-13 text-ink-2 px-gutter',
    );
  });

  it('keeps both of two conflicting utilities: finding them is the tests’ job, not the page’s', () => {
    expect(cn('px-4', 'px-gutter')).toBe('px-4 px-gutter');
  });
});
