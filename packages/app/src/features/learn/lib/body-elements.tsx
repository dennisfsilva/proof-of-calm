import type { ComponentProps } from 'react';
import { useTranslations } from 'use-intl';

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
};

export type BodyElements = typeof MODULE_ELEMENTS;
