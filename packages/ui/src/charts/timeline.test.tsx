// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Timeline, type TimelineProps } from './timeline';

// Below 48rem the drawing is hidden, and with it its name: the sentence that names it is shown as text
// there (docs/DESIGN.md §8), the same string, so a phone reads where the plan is. jsdom applies no media
// query, so the test reads the classes that do: the paragraph hides from md, the drawing shows from md.

afterEach(cleanup);

const label = 'Plan from 1 Jan 2025 to 31 Dec 2030. Today, 29 Oct 2026, is in the buy phase.';
const props: TimelineProps = {
  phases: [
    { kind: 'buy', label: 'Buying', detail: '1 Jan 2025 to 1 Dec 2027', from: 0, to: 0.5 },
    { kind: 'hold', label: 'Holding', detail: '1 Dec 2027 to 31 Dec 2030', from: 0.5, to: 1 },
  ],
  today: 0.3,
  elapsed: 0.3,
  todayLabel: 'Today, 29 Oct 2026',
  axis: { start: 'Jan 2025', end: 'Dec 2030' },
  milestones: [
    { id: 'first', date: '1 Jan 2025', label: 'First buy', when: 'past' },
    { id: 'today', date: '29 Oct 2026', label: 'Today', when: 'today' },
  ],
  label,
  table: { summary: 'Show as a table', columns: ['Date', 'Milestone'], rows: [['1 Jan 2025', 'First buy']] },
};

describe('Timeline', () => {
  it('at 360 px shows its sentence as text, the one string the drawing is named by from md', () => {
    render(<Timeline {...props} />);
    const sentence = screen.getByText(label, { selector: 'p' });
    const classes = sentence.className.split(' ');
    expect(classes).toEqual(expect.arrayContaining(['md:hidden', 'text-14', 'text-ink-2']));
    expect(classes).not.toContain('hidden');
    expect(sentence.hidden).toBe(false);
    const drawing = screen.getByRole('img', { hidden: true });
    expect(drawing.getAttribute('aria-label')).toBe(label);
    expect(drawing.className.split(' ')).toEqual(expect.arrayContaining(['hidden', 'md:flex']));
  });
});
