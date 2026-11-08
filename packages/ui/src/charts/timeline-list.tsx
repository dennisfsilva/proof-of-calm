import { BACKDROP_BACKGROUND, type Backdrop } from '#lib/backdrop';
import { cn } from '#lib/utils';

// The timeline as a list (docs/DESIGN.md §8): what phones show instead of the drawing. A rail joins the
// milestones in date order; past ones carry a filled dot, coming ones a ring, and today the accent dot,
// its own words and aria-current="date", so neither colour nor position is the only cue. A coming
// milestone's ring is filled with the colour behind the list, as the drawing's rings are.

type TimelineMilestone = {
  readonly id: string;
  /** The date, formatted by the shell ("5 Dec 2028"). */
  readonly date: string;
  /** What happens ("Last buy", "Part 2: sell a third", "Today"). */
  readonly label: string;
  /** A second line, such as how far away it is ("in 2 years"). */
  readonly detail?: string;
  readonly when: 'past' | 'today' | 'future';
};

const MARKER: Record<TimelineMilestone['when'], string> = {
  past: 'size-2.5 rounded-full bg-ink-2',
  today: 'size-3.5 rounded-full bg-accent',
  future: 'size-2.5 rounded-full border-2 border-line-2',
};

const LABEL: Record<TimelineMilestone['when'], string> = {
  past: 'text-ink-2',
  today: 'font-semibold text-ink',
  future: 'text-ink',
};

type TimelineListProps = {
  milestones: readonly TimelineMilestone[];
  /** The colour behind the list, which fills the coming milestones' rings. */
  on?: Backdrop;
  className?: string;
};

function TimelineList({ milestones, on = 'surface', className }: TimelineListProps) {
  return (
    <ol data-slot="timeline-list" className={cn('flex flex-col', className)}>
      {milestones.map((milestone) => (
        <li
          key={milestone.id}
          data-when={milestone.when}
          aria-current={milestone.when === 'today' ? 'date' : undefined}
          className="relative flex gap-3 pb-stack-md before:absolute before:top-5 before:bottom-0 before:left-[calc(0.625rem-1px)] before:w-0.5 before:bg-line last:pb-0 last:before:hidden"
        >
          <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center">
            <span
              data-slot="timeline-marker"
              className={cn(MARKER[milestone.when], milestone.when === 'future' && BACKDROP_BACKGROUND[on])}
            />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="nums text-13 text-ink-2">{milestone.date}</span>
            <span className={cn('text-16', LABEL[milestone.when])}>{milestone.label}</span>
            {milestone.detail !== undefined && <span className="text-13 text-ink-2">{milestone.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export { TimelineList, type TimelineMilestone };
