import { useId } from 'react';
import type { Backdrop } from '#lib/backdrop';
import { cn } from '#lib/utils';
import { ChartTable, type ChartTableProps } from './chart-table';
import { TimelineBar, type TimelinePhase, type TimelineReference, TimelineReferenceBar } from './timeline-bar';
import { TimelineList, type TimelineMilestone } from './timeline-list';

// The Plan page's timeline (docs/DESIGN.md §8, ADR-0022, the prototype's drawTimeline): a drawing from
// 48rem, the list below it. The drawing gives each phase a row, its name and dates in HTML on the left
// and its bar on the right, every bar on one time axis, so no label is ever placed at a position (which
// would take a style attribute, docs/SECURITY.md §4) and none can collide; the plan's references (the
// halving, the expected peak) follow as rows of their own. Positions are fractions of the plan as
// numbers, as every chart takes finished geometry (docs/DOMAIN.md §3.14): the shell turns the core's
// strip Ratios into them, and places the marks and references that the strip does not carry. The phase
// kinds are the core's. As every chart (ADR-0022), the drawing is one role="img"
// named by the summary and described by the description (an HTML figure has no <desc>, so a hidden
// paragraph it points to), with the table view under it at every width. Below 48rem, where the drawing
// and its name are hidden, the same summary is shown as a sentence above the list.

type TimelineProps = {
  phases: readonly TimelinePhase[];
  /** The plan's references, drawn as rows after the phases; the shell lists them as milestones too. */
  references?: readonly TimelineReference[];
  /** Where today sits (0 to 1); null before the first buy and after the end. */
  today: number | null;
  /** How much of the plan is behind (0 to 1): the strip's `elapsed` Ratio as a number. */
  elapsed: number;
  /** The key under the drawing ("Today, 17 October 2026"). */
  todayLabel: string;
  /** The plan's first and last dates under the bars. */
  axis: { readonly start: string; readonly end: string };
  /** Every milestone in date order, today included: the list phones show. */
  milestones: readonly TimelineMilestone[];
  /** Summarises the plan and where today is, for the drawing's role="img". */
  label: string;
  /** The drawing's longer description. */
  description?: string | undefined;
  /** The table view, built from the same values. */
  table: ChartTableProps;
  /** The colour behind the timeline, which rings the points in the drawing and the list. */
  on?: Backdrop;
  className?: string;
};

function Timeline(props: TimelineProps) {
  const { phases, references = [], today, elapsed, todayLabel, axis, milestones, label, on = 'surface' } = props;
  const descriptionId = useId();
  return (
    <figure data-slot="timeline" className={cn('flex flex-col gap-stack-sm', props.className)}>
      <div
        role="img"
        aria-label={label}
        aria-describedby={props.description === undefined ? undefined : descriptionId}
        className="hidden flex-col gap-stack-sm md:flex"
      >
        <div className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-x-stack-md">
          {phases.map((phase, index) => (
            <div key={phase.kind} data-slot="timeline-row" className="contents">
              <TimelineRowLabel label={phase.label} detail={phase.detail} />
              <div className="relative">
                <TimelineBar phase={phase} today={today} elapsed={elapsed} first={index === 0} on={on} />
              </div>
            </div>
          ))}
          {references.map((reference) => (
            <div key={reference.id} data-slot="timeline-reference" className="contents">
              <TimelineRowLabel label={reference.label} detail={reference.detail} />
              <div className="relative">
                <TimelineReferenceBar reference={reference} today={today} on={on} />
              </div>
            </div>
          ))}
          <div />
          <div className="flex justify-between pt-1">
            <span className="nums text-12 text-ink-2">{axis.start}</span>
            <span className="nums text-12 text-ink-2">{axis.end}</span>
          </div>
        </div>
        {today !== null && (
          <p className="inline-flex items-center gap-2 text-13 text-ink-2">
            <span className="h-3 w-0.5 shrink-0 rounded-full bg-accent" />
            {todayLabel}
          </p>
        )}
      </div>
      {props.description !== undefined && (
        <p id={descriptionId} hidden>
          {props.description}
        </p>
      )}
      <p className="text-14 text-ink-2 md:hidden">{label}</p>
      <TimelineList milestones={milestones} on={on} className="md:hidden" />
      <ChartTable {...props.table} />
    </figure>
  );
}

function TimelineRowLabel({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex min-h-row flex-col justify-center py-1">
      <span className="font-semibold text-16 text-ink">{label}</span>
      <span className="nums text-13 text-ink-2">{detail}</span>
    </div>
  );
}

export { Timeline, type TimelineMilestone, type TimelinePhase, type TimelineProps, type TimelineReference };
