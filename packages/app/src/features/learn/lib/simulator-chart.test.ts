import {
  addDays,
  type CalendarDate,
  dateScale,
  linearScale,
  linePath,
  type Money,
  type Percent,
  paddedDomain,
  type SimulationPoint,
  underwaterPath,
} from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { SIMULATOR_CHART_POINTS, simulatorGeometry } from './simulator-chart';

// The simulator chart's geometry (docs/EDUCATION.md §7, ADR-0022): the value and the money invested on one
// value axis, the falls under the running maximum shaded, and a table of month ends. Synthetic series only.

const SIZE = { width: 300, height: 100 };

const point = (date: string, invested: string, value: string): SimulationPoint => ({
  date: date as CalendarDate,
  invested: invested as Money,
  value: value as Money,
  drawdown: '0' as Percent,
});

/** `count` days from 2026-01-01, the money invested 100 throughout and the value given by `value(index)`. */
const days = (count: number, value: (index: number) => string) =>
  Array.from({ length: count }, (_, index) => point(addDays('2026-01-01' as CalendarDate, index), '100', value(index)));

const commands = (path: string) => path.match(/[ML]/g)?.length ?? 0;

describe('simulatorGeometry', () => {
  it('draws nothing for no points', () => {
    expect(simulatorGeometry([], SIZE)).toBeNull();
  });

  it('draws a flat series as level lines in the middle, with nothing shaded', () => {
    const geometry = simulatorGeometry(
      days(3, () => '100'),
      SIZE,
    );
    expect(geometry?.value).toBe('M0 50L150 50L300 50');
    expect(geometry?.invested).toBe('M0 50L150 50L300 50');
    expect(geometry?.underwater).toBe('');
    expect(geometry?.axis).toEqual({ low: '100', high: '100', start: '2026-01-01', end: '2026-01-03' });
  });

  it('places the value and the money invested on one padded axis over both', () => {
    const points = [
      point('2026-01-01', '100', '100'),
      point('2026-01-02', '200', '150'),
      point('2026-01-03', '200', '400'),
    ];
    const geometry = simulatorGeometry(points, SIZE);
    const x = dateScale(['2026-01-01' as CalendarDate, '2026-01-03' as CalendarDate], [0, 300]);
    const y = linearScale(paddedDomain(['100', '400'] as [Money, Money]), [100, 0]);
    expect(geometry?.value).toBe(linePath(points.map((p) => [x(p.date), y(p.value)])));
    expect(geometry?.invested).toBe(linePath(points.map((p) => [x(p.date), y(p.invested)])));
    expect(geometry?.axis).toEqual({ low: '100', high: '400', start: '2026-01-01', end: '2026-01-03' });
    expect(geometry?.gridlines.length).toBeGreaterThan(0);
    expect(geometry?.gridlines.every((line) => line >= 0 && line <= 100)).toBe(true);
  });

  it('shades each fall below the running maximum of the value line, one closed subpath each', () => {
    const values = ['100', '120', '90', '130', '110', '125'];
    const points = values.map((value, index) => point(addDays('2026-01-01' as CalendarDate, index), '100', value));
    const geometry = simulatorGeometry(points, SIZE);
    const x = dateScale(['2026-01-01' as CalendarDate, '2026-01-06' as CalendarDate], [0, 300]);
    const y = linearScale(paddedDomain(['90', '130'] as [Money, Money]), [100, 0]);
    expect(geometry?.underwater).toBe(
      underwaterPath(
        points.map((p) => [x(p.date), y(p.value)]),
        values as Money[],
      ),
    );
    expect(geometry?.underwater.match(/Z/g)).toHaveLength(2);
  });

  it('draws a long series downsampled, the first and the last day kept', () => {
    const geometry = simulatorGeometry(
      days(1000, (index) => String(100 + (index % 37))),
      SIZE,
    );
    expect(commands(geometry?.value ?? '')).toBe(SIMULATOR_CHART_POINTS + 1);
    expect(commands(geometry?.invested ?? '')).toBe(SIMULATOR_CHART_POINTS + 1);
    expect(geometry?.axis.start).toBe('2026-01-01');
    expect(geometry?.axis.end).toBe(addDays('2026-01-01' as CalendarDate, 999));
  });

  it('lists each month once in the table, at its last day simulated, from every day and not the drawn ones', () => {
    const points = [
      point('2026-01-30', '100', '101'),
      point('2026-01-31', '100', '102'),
      point('2026-02-01', '200', '190'),
      point('2026-02-28', '200', '210'),
      point('2026-03-01', '300', '305'),
    ];
    expect(simulatorGeometry(points, SIZE)?.months).toEqual([
      { month: '2026-01', value: '102', invested: '100' },
      { month: '2026-02', value: '210', invested: '200' },
      { month: '2026-03', value: '305', invested: '300' },
    ]);
    const long = simulatorGeometry(
      days(1000, () => '100'),
      SIZE,
    );
    // 1 Jan 2026 plus 999 days is 26 Sept 2028: 33 calendar months.
    expect(long?.months).toHaveLength(33);
    expect(long?.months.at(-1)?.month).toBe('2028-09');
  });
});
