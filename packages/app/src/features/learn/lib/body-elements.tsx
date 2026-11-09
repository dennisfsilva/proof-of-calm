import type { LearnModuleMeta } from '@proofofcalm/content';
import type { Decimal } from '@proofofcalm/core';
import { Children, type ComponentProps, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import type { Formatters } from '../../../lib/format';

/** A section's id: the heading's words, lower case, joined by hyphens (`Why some people hold` to `why-some-people-hold`). */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

// The past-performance sentence and the Risk link as one element (docs/LEGAL.md §4), so a module cannot show the
// one without the other. The type is the body's, set here too because on a line of its own the element stands
// outside any paragraph. The Risk page is a site page, so a plain anchor, as beside the Portfolio chart's line. A
// module's text holds no link of its own (ADR-0048 Deviations).
function PastPerformance() {
  const t = useTranslations('learn');
  return (
    <span className="text-16">
      {t('module.pastPerformance')}{' '}
      <a href="/risk" className="text-ink underline underline-offset-4 hover:text-ink-2">
        {t('module.riskLink')}
      </a>
    </span>
  );
}

// A module body's Markdown elements on the tokens' type (docs/DESIGN.md §5): what the renderer passes
// through `components` (ADR-0048). Compiled modules take their elements from that prop alone. An h2 is a
// section a link can name: the id comes from its text, and it takes the focus the sheet moves to it.
export const MODULE_ELEMENTS = {
  h2: ({ children, ...props }: ComponentProps<'h2'>) => (
    <h2
      className="mt-stack-sm text-20"
      id={typeof children === 'string' ? headingId(children) : undefined}
      tabIndex={-1}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: (props: ComponentProps<'h3'>) => <h3 className="text-18" {...props} />,
  p: (props: ComponentProps<'p'>) => <p className="text-16" {...props} />,
  ul: (props: ComponentProps<'ul'>) => <ul className="flex list-disc flex-col gap-stack-xs ps-inset-lg" {...props} />,
  ol: (props: ComponentProps<'ol'>) => (
    <ol className="flex list-decimal flex-col gap-stack-xs ps-inset-lg" {...props} />
  ),
  li: (props: ComponentProps<'li'>) => <li className="text-16" {...props} />,
  strong: (props: ComponentProps<'strong'>) => <strong className="font-semibold" {...props} />,
  PastPerformance,
  // Unbound: `ModuleView` binds it to the module's chart, and only a module with a chart writes it.
  Chart: (): ReactNode => null,
};

export type BodyElements = typeof MODULE_ELEMENTS;

/**
 * What the page's percent formatter writes between a numeral and its sign: the joiner of the profiles' literals
 * (`percentJoiner` in packages/content) read from the formatter the chart's figures come from, so this lazy chunk
 * imports no value of content.
 */
export function pageJoiner(format: Pick<Formatters, 'percent'>): string {
  return format.percent('0' as Decimal, { decimals: 0 }).replace(/[0%]/g, '');
}

/** A module's `N %`, written with an ordinary space (docs/CONTENT-STYLE.md §4), with the joiner in its place. */
export const withJoiner = (text: string, joiner: string) => text.replace(/(\d) %/g, `$1${joiner}%`);

const joined = (children: ReactNode, joiner: string): ReactNode =>
  typeof children === 'string'
    ? withJoiner(children, joiner)
    : Children.map(children, (child) => (typeof child === 'string' ? withJoiner(child, joiner) : child));

/**
 * The elements of one module: with a chart, its formatted figures set the page's percent spacing, so the text's
 * strings take the joiner (docs/CONTENT-STYLE.md §4); without one, the text renders as written.
 */
export function moduleElements(chart: LearnModuleMeta['chart'], joiner: string): BodyElements {
  if (chart === 'none') return MODULE_ELEMENTS;
  const E = MODULE_ELEMENTS;
  return {
    ...E,
    h2: ({ children, ...props }) => <E.h2 {...props}>{joined(children, joiner)}</E.h2>,
    h3: ({ children, ...props }) => <E.h3 {...props}>{joined(children, joiner)}</E.h3>,
    p: ({ children, ...props }) => <E.p {...props}>{joined(children, joiner)}</E.p>,
    li: ({ children, ...props }) => <E.li {...props}>{joined(children, joiner)}</E.li>,
    strong: ({ children, ...props }) => <E.strong {...props}>{joined(children, joiner)}</E.strong>,
  };
}
