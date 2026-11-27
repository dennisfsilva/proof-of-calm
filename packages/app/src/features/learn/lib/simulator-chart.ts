import {
  type CalendarDate,
  dateScale,
  downsample,
  extent,
  linearScale,
  linePath,
  type Money,
  type MonthKey,
  monthKey,
  type Pixel,
  paddedDomain,
  type SimulationPoint,
  ticks,
  underwaterPath,
} from '@proofofcalm/core';

// The simulator chart's geometry (docs/EDUCATION.md §7, ADR-0022): the simulated value and the money invested on
// one padded value axis, at most SIMULATOR_CHART_POINTS + 1 days of the series, placed in viewBox units for
// SimulatorChart; the falls below the value's running maximum shaded over the same days; and the table view's rows,
// one per calendar month at its last day simulated, read from every day of the series.

/** Five years of daily closes become about one day every ten: plenty for a 300-unit line. */
export const SIMULATOR_CHART_POINTS = 180;
const GRIDLINES = 3;

/** A table row: a month and the value and the money invested at its last day simulated. */
export type SimulatorMonth = { readonly month: MonthKey; readonly value: Money; readonly invested: Money };

export type SimulatorGeometry = {
  readonly value: string;
  readonly invested: string;
  readonly underwater: string;
  readonly gridlines: readonly Pixel[];
  /** The lowest and the highest figure drawn, of either line, and the first and the last day. */
  readonly axis: {
    readonly low: Money;
    readonly high: Money;
    readonly start: CalendarDate;
    readonly end: CalendarDate;
  };
  readonly months: readonly SimulatorMonth[];
};

type ViewBox = { readonly width: number; readonly height: number };

function monthEnds(points: readonly SimulationPoint[]): SimulatorMonth[] {
  return points
    .filter((point, index) => {
      const next = points[index + 1];
      return next === undefined || monthKey(next.date) !== monthKey(point.date);
    })
    .map((point) => ({ month: monthKey(point.date), value: point.value, invested: point.invested }));
}

/** Null for a series with no day. */
export function simulatorGeometry(points: readonly SimulationPoint[], size: ViewBox): SimulatorGeometry | null {
  const drawn = downsample(points, SIMULATOR_CHART_POINTS);
  const span = extent(drawn.flatMap((point) => [point.value, point.invested]));
  const [first, last] = [drawn[0], drawn.at(-1)];
  if (span === null || first === undefined || last === undefined) return null;
  const domain = paddedDomain(span);
  const x = dateScale([first.date, last.date], [0, size.width]);
  const y = linearScale(domain, [size.height, 0]);
  const values = drawn.map((point) => [x(point.date), y(point.value)] as const);
  return {
    value: linePath(values),
    invested: linePath(drawn.map((point) => [x(point.date), y(point.invested)] as const)),
    underwater: underwaterPath(
      values,
      drawn.map((point) => point.value),
    ),
    gridlines: ticks(domain[0], domain[1], GRIDLINES).map(y),
    axis: { low: span[0], high: span[1], start: first.date, end: last.date },
    months: monthEnds(points),
  };
}
