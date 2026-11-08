import type { ComponentProps, ReactNode } from 'react';
import { cn } from '#lib/utils';

// The parts the value charts share (ADR-0022, docs/DESIGN.md §4): the plot beside its value extremes
// and above its range ends, all text in HTML so it never stretches with the SVG, and the legend that
// names every series or mark. LineChart and CoinChart are drawn from them.

type ChartAxis = {
  /** The value extremes and the range ends, formatted by the shell. */
  readonly top: string;
  readonly bottom: string;
  readonly start: string;
  readonly end: string;
};

/** The plot with the value extremes to its right and the range ends under it. */
function ChartFrame({ axis, children }: { axis: ChartAxis; children: ReactNode }) {
  return (
    <>
      <div className="flex gap-2">
        {children}
        <div aria-hidden className="flex flex-col justify-between text-right">
          <span className="nums text-12 text-ink-2">{axis.top}</span>
          <span className="nums text-12 text-ink-2">{axis.bottom}</span>
        </div>
      </div>
      <div aria-hidden className="flex justify-between">
        <span className="nums text-12 text-ink-2">{axis.start}</span>
        <span className="nums text-12 text-ink-2">{axis.end}</span>
      </div>
    </>
  );
}

function ChartLegend({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('flex flex-wrap gap-x-stack-md gap-y-stack-xs', className)} {...props} />;
}

/** One legend entry: a swatch drawn like the mark it names, then the words. */
function ChartLegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2 text-13 text-ink-2">
      {swatch}
      {children}
    </li>
  );
}

export { type ChartAxis, ChartFrame, ChartLegend, ChartLegendItem };
