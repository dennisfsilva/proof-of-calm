import type { CalendarDate, Ratio, Strip } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressStrip } from './progress-strip';

// A plan buying from 5 January 2026 to 5 December 2028, selling in 2030 and out by 30 June 2031, on
// 17 October 2026 (the shape the core's strip() returns, docs/DOMAIN.md §3.10).
const ratio = (value: string) => value as Ratio;
const withWindow: Strip = {
  start: '2026-01-05' as CalendarDate,
  end: '2031-06-30' as CalendarDate,
  segments: [
    { kind: 'buy', from: ratio('0'), to: ratio('0.531702'), openEnded: false },
    { kind: 'hold', from: ratio('0.531702'), to: ratio('0.727409'), openEnded: false },
    { kind: 'sell', from: ratio('0.727409'), to: ratio('0.909136'), openEnded: false },
    { kind: 'exit', from: ratio('0.909136'), to: ratio('1'), openEnded: false },
  ],
  peak: { from: ratio('0.756865'), to: ratio('0.863205') },
  today: ratio('0.142287'),
  elapsed: ratio('0.142287'),
};

const phases = [
  { kind: 'buy', label: 'Buy', range: 'Jan 2026 to Dec 2028' },
  { kind: 'hold', label: 'Hold', range: 'to Dec 2029' },
  { kind: 'sell', label: 'Sell', range: 'Jan 2030 to Dec 2030' },
] as const;

const table = {
  summary: 'Show the dates as a table',
  columns: ['Phase', 'From', 'To'],
  rows: [
    ['Buy', '5 January 2026', '5 December 2028'],
    ['Hold', '5 December 2028', '1 January 2030'],
    ['Sell', '1 January 2030', '31 December 2030'],
    ['Out by', '31 December 2030', '30 June 2031'],
  ],
};

const meta = {
  title: 'Charts/Progress strip',
  component: ProgressStrip,
  args: {
    strip: withWindow,
    phases,
    table,
    label: 'Plan from January 2026 to June 2031. Today, 17 October 2026, is in Buy, 14 % of the way.',
    description: 'Buy until December 2028, hold through 2029, sell during 2030, out by 30 June 2031.',
  },
} satisfies Meta<typeof ProgressStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InBuy: Story = {};

export const InSell: Story = {
  args: {
    strip: { ...withWindow, today: ratio('0.801298'), elapsed: ratio('0.801298') },
    label: 'Plan from January 2026 to June 2031. Today, 1 May 2030, is in Sell, 80 % of the way.',
  },
};

export const OpenEndedHold: Story = {
  args: {
    strip: {
      start: '2026-01-05' as CalendarDate,
      end: '2029-11-05' as CalendarDate,
      segments: [
        { kind: 'buy', from: ratio('0'), to: ratio('0.5'), openEnded: false },
        { kind: 'hold', from: ratio('0.5'), to: ratio('1'), openEnded: true },
      ],
      peak: null,
      today: ratio('0.2'),
      elapsed: ratio('0.2'),
    },
    phases: [
      { kind: 'buy', label: 'Buy', range: 'Jan 2026 to Dec 2027' },
      { kind: 'hold', label: 'Hold', range: 'from Dec 2027' },
    ],
    label: 'Plan buying from January 2026 to December 2027, then holding with no end set. Today is in Buy.',
  },
};
