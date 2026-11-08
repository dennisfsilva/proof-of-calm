import type { StripSegment } from '@proofofcalm/core';
import type { ReactNode } from 'react';
import { BACKDROP_STROKE, type Backdrop } from '#lib/backdrop';
import { clamp } from '#lib/chart-geometry';
import { ChartDot } from './chart-mark';

// One row of the timeline's drawing (charts/timeline.tsx): a phase's bar or a reference on the whole
// plan's axis, in a viewBox one unit wide stretched to the row. The bars speak the strip's language
// (docs/DESIGN.md §8): buy and sell thick, hold thin, the way out dashed, the past drawn over in a thin
// ink line; points on a bar are filled once done and rings until then. A reference (the cycle plan's
// halving and expected peak, docs/DOMAIN.md §5) is a ring at a point or a thin ink-3 line over a range,
// as the strip draws the peak. Today's accent line crosses every row.

type TimelinePhase = {
  /** The core's phase kinds, so a new one fails the build here as in the strip. */
  readonly kind: StripSegment['kind'];
  /** The phase's name ("Buy", "Sell in three parts"). */
  readonly label: string;
  /** Its dates ("5 Jan 2026 to 5 Dec 2028"). */
  readonly detail: string;
  /** Where it starts and ends, as fractions of the plan (0 to 1). */
  readonly from: number;
  readonly to: number;
  /** A hold without a sell window has no end: drawn dashed to the edge. */
  readonly openEnded?: boolean;
  /** Points on the phase, such as the holding date or the sell parts; done ones are filled. */
  readonly marks?: readonly { readonly at: number; readonly done: boolean }[];
};

/** A date the plan refers to without acting on it: the halving (a point), the expected peak (a range). */
type TimelineReference = {
  readonly id: string;
  /** Its name ("Halving", "Expected peak"). */
  readonly label: string;
  /** Its dates ("Around Apr 2028", "Sep to Oct 2029"). */
  readonly detail: string;
  /** Where it sits, as a fraction of the plan (0 to 1); with `to`, where its range starts. */
  readonly from: number;
  readonly to?: number;
};

const MIDDLE = 6;
const HEIGHT = 12;

type TrackProps = {
  /** Where today's line crosses, or null for none. */
  today: number | null;
  /** The first row carries the dot at the top of today's line. */
  first: boolean;
  children: ReactNode;
};

/** The row's frame: the axis under everything and today's line over it. */
function TimelineTrack({ today, first, children }: TrackProps) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 1 ${HEIGHT}`}
      preserveAspectRatio="none"
      className="absolute inset-0 size-full overflow-visible"
    >
      <line
        x1={0}
        x2={1}
        y1={MIDDLE}
        y2={MIDDLE}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className="stroke-line"
      />
      {children}
      {today !== null && (
        <g data-slot="timeline-today" className="stroke-accent">
          <line x1={today} x2={today} y1={0} y2={HEIGHT} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {first && <ChartDot x={today} y={0} size={8} className="stroke-accent" />}
        </g>
      )}
    </svg>
  );
}

const BAR: Record<TimelinePhase['kind'], { width: number; className: string; dashed: boolean }> = {
  buy: { width: 8, className: 'stroke-line-2', dashed: false },
  hold: { width: 2, className: 'stroke-line-2', dashed: false },
  sell: { width: 8, className: 'stroke-ink-2', dashed: false },
  exit: { width: 2, className: 'stroke-line-2', dashed: true },
};

type TimelineBarProps = {
  phase: TimelinePhase;
  today: number | null;
  /** How much of the plan is behind. */
  elapsed: number;
  first: boolean;
  on: Backdrop;
};

function TimelineBar({ phase, today, elapsed, first, on }: TimelineBarProps) {
  const bar = BAR[phase.kind];
  const passed = clamp(elapsed, phase.from, phase.to);
  const backdrop = BACKDROP_STROKE[on];
  return (
    <TimelineTrack today={today} first={first}>
      <line
        data-slot="timeline-bar"
        x1={phase.from}
        x2={phase.to}
        y1={MIDDLE}
        y2={MIDDLE}
        strokeWidth={bar.width}
        strokeDasharray={bar.dashed || phase.openEnded ? '4 4' : undefined}
        vectorEffect="non-scaling-stroke"
        className={bar.className}
      />
      {passed > phase.from && (
        <line
          x1={phase.from}
          x2={passed}
          y1={MIDDLE}
          y2={MIDDLE}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          className="stroke-ink"
        />
      )}
      {phase.marks?.map((mark, index) => (
        // Two parts can share a month when the window is short (docs/DOMAIN.md §3.8), so the index keys.
        <g key={index} data-slot="timeline-mark" data-done={mark.done || undefined}>
          <ChartDot x={mark.at} y={MIDDLE} size={12} className={backdrop} />
          <ChartDot x={mark.at} y={MIDDLE} size={8} className={mark.done ? 'stroke-ink' : 'stroke-ink-2'} />
          {!mark.done && <ChartDot x={mark.at} y={MIDDLE} size={4} className={backdrop} />}
        </g>
      ))}
    </TimelineTrack>
  );
}

type TimelineReferenceBarProps = {
  reference: TimelineReference;
  today: number | null;
  on: Backdrop;
};

function TimelineReferenceBar({ reference, today, on }: TimelineReferenceBarProps) {
  const backdrop = BACKDROP_STROKE[on];
  return (
    <TimelineTrack today={today} first={false}>
      {reference.to === undefined ? (
        <g data-slot="timeline-reference-point">
          <ChartDot x={reference.from} y={MIDDLE} size={12} className={backdrop} />
          <ChartDot x={reference.from} y={MIDDLE} size={8} className="stroke-ink-3" />
          <ChartDot x={reference.from} y={MIDDLE} size={4} className={backdrop} />
        </g>
      ) : (
        <line
          data-slot="timeline-reference-range"
          x1={reference.from}
          x2={reference.to}
          y1={MIDDLE}
          y2={MIDDLE}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          className="stroke-ink-3"
        />
      )}
    </TimelineTrack>
  );
}

export {
  TimelineBar,
  type TimelineBarProps,
  type TimelinePhase,
  type TimelineReference,
  TimelineReferenceBar,
  type TimelineReferenceBarProps,
};
