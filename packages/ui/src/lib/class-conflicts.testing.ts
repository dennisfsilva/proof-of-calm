import { extendTailwindMerge } from 'tailwind-merge';

// `cn` joins class names without resolving conflicts (ADR-0043), so two utilities for one property on
// an element are a bug. The story tests and the e2e matrix find them with this check, which never
// reaches a page. tailwind-merge reads conflicts from its own copy of the theme scales; ours replace
// Tailwind's (src/styles/theme.css), so it is told about them: without this, `text-13` would be taken
// for a colour next to `text-ink-2`. A test keeps these lists equal to theme.css.
export const TEXT_SIZES = ['12', '13', '14', '16', '18', '20', '24', '28', '32', '40'] as const;
export const SPACING_ALIASES = [
  'inset-sm',
  'inset',
  'inset-lg',
  'stack-xs',
  'stack-sm',
  'stack-md',
  'stack-lg',
  'stack-xl',
  'gutter',
  'target',
  'target-gap',
  'row',
  'chart-hit',
] as const;

const merge = extendTailwindMerge({
  override: { theme: { text: [...TEXT_SIZES] } },
  extend: {
    theme: {
      spacing: [...SPACING_ALIASES],
      tracking: ['heading'],
      ease: ['enter', 'exit'],
      shadow: ['overlay'],
      container: ['reading', 'table'],
    },
  },
});

/** The classes of `className` that a later utility for the same property overrides. */
export function classConflicts(className: string): string[] {
  const kept = new Set(merge(className).split(' '));
  return className.split(/\s+/).filter((name) => name !== '' && !kept.has(name));
}

/** Every element under `root` whose classes conflict, with the classes that lose. */
export function findClassConflicts(root: ParentNode): string[] {
  return [...root.querySelectorAll('[class]')].flatMap((element) => {
    const className = element.getAttribute('class') ?? '';
    const losing = classConflicts(className);
    return losing.length === 0 ? [] : [`<${element.tagName.toLowerCase()} class="${className}">: ${losing.join(' ')}`];
  });
}
