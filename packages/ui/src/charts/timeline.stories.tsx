import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Timeline, type TimelineMilestone, type TimelinePhase, type TimelineProps } from './timeline';

// A plan buying monthly from 5 January 2026 to 5 December 2028 in Portugal (tax-free 365 days after
// the last buy), selling in 2030 in three parts and out by 30 June 2031: the strip story's plan. The
// fractions are days since the first buy over the plan's 2003 days, as the core's strip() returns them.
const phases: readonly TimelinePhase[] = [
  { kind: 'buy', label: 'Buy', detail: '5 Jan 2026 to 5 Dec 2028', from: 0, to: 0.531702 },
  {
    kind: 'hold',
    label: 'Hold',
    detail: 'Tax-free from 5 Dec 2029',
    from: 0.531702,
    to: 0.727409,
    marks: [{ at: 0.713929, done: false }],
  },
  {
    kind: 'sell',
    label: 'Sell in three parts',
    detail: 'Jan, Mar and Dec 2030',
    from: 0.727409,
    to: 0.909136,
    marks: [
      { at: 0.727409, done: false },
      { at: 0.756865, done: false },
      { at: 0.894159, done: false },
    ],
  },
  { kind: 'exit', label: 'Out by', detail: '30 Jun 2031', from: 0.909136, to: 1 },
];

const milestones = (today: string, parts = 0): TimelineMilestone[] => {
  const all: Omit<TimelineMilestone, 'when'>[] = [
    { id: 'first', date: '5 Jan 2026', label: 'First buy' },
    { id: 'last', date: '5 Dec 2028', label: 'Last buy' },
    { id: 'free', date: '5 Dec 2029', label: 'Tax-free from' },
    { id: 'part1', date: 'Jan 2030', label: 'Part 1: sell a third' },
    { id: 'part2', date: 'Mar 2030', label: 'Part 2: sell a third' },
    { id: 'part3', date: 'Dec 2030', label: 'Part 3: sell the rest' },
    { id: 'out', date: '30 Jun 2031', label: 'Out by' },
  ];
  const index = all.findIndex((milestone) => milestone.id === today);
  const past = index === -1 ? 0 : index + 1;
  return [
    ...all.slice(0, past).map((milestone) => ({ ...milestone, when: 'past' as const })),
    { id: 'today', date: parts > 0 ? '1 May 2030' : '17 Oct 2026', label: 'Today', when: 'today' as const },
    ...all.slice(past).map((milestone) => ({ ...milestone, when: 'future' as const })),
  ];
};

// The table view (ADR-0022): the milestones' dates and words, the same values as the drawing.
const table = (rows: readonly TimelineMilestone[]): TimelineProps['table'] => ({
  summary: 'Show as a table',
  columns: ['Date', 'Milestone'],
  rows: rows.map((milestone) => [milestone.date, milestone.label]),
});

const meta = {
  title: 'Charts/Timeline',
  component: Timeline,
  args: {
    phases,
    today: 0.142287,
    elapsed: 0.142287,
    todayLabel: 'Today, 17 October 2026',
    axis: { start: 'Jan 2026', end: 'Jun 2031' },
    milestones: milestones('first'),
    table: table(milestones('first')),
    description:
      'Buy monthly from 5 January 2026 to 5 December 2028, hold until tax-free on 5 December 2029, sell in three parts in January, March and December 2030, out by 30 June 2031.',
    label:
      'Plan from January 2026 to June 2031: buy until December 2028, tax-free from December 2029, sell in three parts during 2030, out by 30 June 2031. Today, 17 October 2026, is in Buy.',
  },
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Where the drawing shows instead of the list (48rem, docs/DESIGN.md §8). */
const wide = () => window.matchMedia('(width >= 48rem)').matches;

export const InBuy: Story = {
  play: async ({ canvas, canvasElement, args }) => {
    const list = within(canvasElement).getByRole('list', { hidden: true });
    const today = list.querySelector('[aria-current="date"]');
    await expect(today).toHaveTextContent('Today');
    await expect(list.querySelectorAll('li')).toHaveLength(args.milestones.length);

    // Every width has the table view built from the same values (ADR-0022).
    const details = canvasElement.querySelector('[data-slot="chart-table"]');
    await expect(details).not.toBeNull();
    await expect(details?.querySelectorAll('tbody tr')).toHaveLength(args.table.rows.length);

    if (wide()) {
      // The drawing: one row per phase, today's accent line through each, named and described; the
      // table is its text alternative, so the list is not displayed.
      const drawing = canvas.getByRole('img', { name: args.label });
      await expect(drawing).toBeVisible();
      await expect(drawing).toHaveAccessibleDescription(args.description ?? '');
      await expect(drawing.querySelectorAll('[data-slot="timeline-row"]')).toHaveLength(args.phases.length);
      await expect(drawing.querySelectorAll('[data-slot="timeline-today"]')).toHaveLength(args.phases.length);
      await expect(getComputedStyle(list).display).toBe('none');
      await expect(canvas.getByText(args.label, { selector: 'p' })).not.toBeVisible();
    } else {
      // The drawing and its name are hidden, so the same sentence is shown as text above the list.
      await expect(canvas.queryByRole('img')).toBeNull();
      await expect(canvas.getByText(args.label, { selector: 'p' })).toBeVisible();
      await expect(list).toBeVisible();
    }
  },
};

export const InSell: Story = {
  args: {
    phases: phases.map((phase) => {
      if (phase.kind === 'hold') return { ...phase, marks: [{ at: 0.713929, done: true }] };
      if (phase.kind !== 'sell') return phase;
      return {
        ...phase,
        detail: 'Jan, Mar and Dec 2030; part 1 sold',
        marks: [
          { at: 0.727409, done: true },
          { at: 0.756865, done: false },
          { at: 0.894159, done: false },
        ],
      };
    }),
    today: 0.801298,
    elapsed: 0.801298,
    todayLabel: 'Today, 1 May 2030',
    milestones: milestones('part2', 1),
    table: table(milestones('part2', 1)),
    label:
      'Plan from January 2026 to June 2031. Today, 1 May 2030, is in Sell; part 1 is sold, parts 2 and 3 are to come.',
  },
  play: async ({ canvas, args }) => {
    if (!wide()) return;
    const drawing = canvas.getByRole('img', { name: args.label });
    await expect(drawing.querySelectorAll('[data-slot="timeline-mark"][data-done]')).toHaveLength(2);
  },
};

const openEnded: readonly TimelineMilestone[] = [
  { id: 'first', date: '5 Jan 2026', label: 'First buy', when: 'past' },
  { id: 'today', date: '17 Oct 2026', label: 'Today', when: 'today' },
  { id: 'last', date: '5 Dec 2027', label: 'Last buy', detail: 'in 14 months', when: 'future' },
  { id: 'free', date: '5 Dec 2028', label: 'Tax-free from', detail: 'in 2 years', when: 'future' },
];

export const OpenEndedHold: Story = {
  args: {
    phases: [
      { kind: 'buy', label: 'Buy', detail: '5 Jan 2026 to 5 Dec 2027', from: 0, to: 0.5 },
      {
        kind: 'hold',
        label: 'Hold',
        detail: 'No end set; tax-free from 5 Dec 2028',
        from: 0.5,
        to: 1,
        openEnded: true,
        marks: [{ at: 0.75, done: false }],
      },
    ],
    today: 0.2,
    elapsed: 0.2,
    axis: { start: 'Jan 2026', end: 'No end set' },
    milestones: openEnded,
    table: table(openEnded),
    description: undefined,
    label: 'Plan buying from January 2026 to December 2027, then holding with no end set. Today is in Buy.',
  },
};

const beforeFirstBuy: readonly TimelineMilestone[] = [
  { id: 'today', date: '17 Oct 2026', label: 'Today', when: 'today' },
  { id: 'first', date: '5 Jan 2027', label: 'First buy', detail: 'in 3 months', when: 'future' },
  { id: 'last', date: '5 Dec 2029', label: 'Last buy', when: 'future' },
  { id: 'out', date: '30 Jun 2032', label: 'Out by', when: 'future' },
];

export const BeforeTheFirstBuy: Story = {
  args: {
    today: null,
    elapsed: 0,
    milestones: beforeFirstBuy,
    table: table(beforeFirstBuy),
    description: undefined,
    label: 'Plan from January 2027 to June 2032; the first buy is on 5 January 2027.',
  },
  play: async ({ canvas, args }) => {
    if (!wide()) return;
    const drawing = canvas.getByRole('img', { name: args.label });
    await expect(drawing.querySelectorAll('[data-slot="timeline-today"]')).toHaveLength(0);
  },
};

// The cycle plan (docs/DOMAIN.md §5): buys from 1 June 2026 to 1 June 2028, the sell window from 1 June
// to 31 October 2029, out by 31 December 2029, with its references: the halving on 15 April 2028 and the
// expected peak from 1 September to 31 October 2029. Fractions are days since the first buy over 1309.
const cycleMilestones: readonly TimelineMilestone[] = [
  { id: 'first', date: '1 Jun 2026', label: 'First buy', when: 'past' },
  { id: 'today', date: '17 Oct 2026', label: 'Today', when: 'today' },
  { id: 'halving', date: 'Apr 2028', label: 'Halving (approximate)', when: 'future' },
  { id: 'last', date: '1 Jun 2028', label: 'Last buy', when: 'future' },
  { id: 'open', date: '1 Jun 2029', label: 'Sell window opens', when: 'future' },
  { id: 'peak', date: 'Sep 2029', label: 'Expected peak begins', when: 'future' },
  { id: 'close', date: '31 Oct 2029', label: 'Sell window closes', when: 'future' },
  { id: 'out', date: '31 Dec 2029', label: 'Out by', when: 'future' },
];

export const CyclePlanReferences: Story = {
  args: {
    phases: [
      { kind: 'buy', label: 'Buy', detail: '1 Jun 2026 to 1 Jun 2028', from: 0, to: 0.558442 },
      { kind: 'hold', label: 'Hold', detail: 'Until 1 Jun 2029', from: 0.558442, to: 0.837281 },
      { kind: 'sell', label: 'Sell', detail: '1 Jun to 31 Oct 2029', from: 0.837281, to: 0.953399 },
      { kind: 'exit', label: 'Out by', detail: '31 Dec 2029', from: 0.953399, to: 1 },
    ],
    references: [
      { id: 'halving', label: 'Halving', detail: 'Around Apr 2028', from: 0.524828 },
      { id: 'peak', label: 'Expected peak', detail: 'Sep to Oct 2029', from: 0.907563, to: 0.953399 },
    ],
    today: 0.106952,
    elapsed: 0.106952,
    axis: { start: 'Jun 2026', end: 'Dec 2029' },
    milestones: cycleMilestones,
    table: table(cycleMilestones),
    description: 'The halving is expected around April 2028 and the peak from September to October 2029.',
    label:
      'Cycle plan from June 2026 to December 2029: buy until June 2028, sell from June to October 2029, out by 31 December 2029. Today, 17 October 2026, is in Buy.',
  },
  play: async ({ canvas, args }) => {
    if (!wide()) return;
    // Each reference has its row, its name and dates in HTML, today's line crossing it too: a point is
    // a ring, a range a thin ink-3 line, as the strip draws the peak.
    const drawing = canvas.getByRole('img', { name: args.label });
    const references = drawing.querySelectorAll('[data-slot="timeline-reference"]');
    await expect(references).toHaveLength(2);
    await expect(references[0]).toHaveTextContent('Halving');
    await expect(references[0]?.querySelectorAll('[data-slot="timeline-reference-point"]')).toHaveLength(1);
    await expect(references[1]?.querySelectorAll('[data-slot="timeline-reference-range"]')).toHaveLength(1);
    const rows = args.phases.length + (args.references?.length ?? 0);
    await expect(drawing.querySelectorAll('[data-slot="timeline-today"]')).toHaveLength(rows);
  },
};

/** On the page's background rather than a card: every ring, drawn or listed, is cut out in it. */
export const OnBackground: Story = {
  args: { on: 'background' },
  render: (args) => (
    <div data-testid="backdrop" className="bg-background p-inset">
      <Timeline {...args} />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const backdrop = getComputedStyle(canvas.getByTestId('backdrop')).backgroundColor;
    const future = canvasElement.querySelector(
      '[data-slot="timeline-list"] [data-when="future"] [data-slot="timeline-marker"]',
    );
    if (future === null) throw new Error('no coming milestone');
    await expect(getComputedStyle(future).backgroundColor).toBe(backdrop);
  },
};
