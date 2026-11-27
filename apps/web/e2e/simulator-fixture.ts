import { addDays, type CalendarDate } from '@proofofcalm/core';

// Synthetic dataset files for the simulator's spec (packages/data/README.md, The dataset): made-up closes on
// made-up days, never an exchange's figure (ADR-0036, Reading of 2026-11-27: tests use synthetic values only).
// BTC and SOL begin and end on different days, so the window is the days both have, and their paths differ, so
// a changed split changes the multiple.

/** The served path of a coin's file, as the screen asks for it. */
export const simulatorPath = (coin: string) => `/data/prices/${coin}-EUR.json`;

/** BTC's path, the file the screen asks for first. */
export const SIMULATOR_PATH = simulatorPath('BTC');

/** `count` days of `coin` in EUR from `first`, two sources each, the close of day `index` given by `close`. */
function dataset(coin: string, first: string, count: number, close: (index: number) => number) {
  return {
    coin,
    currency: 'EUR',
    days: Array.from({ length: count }, (_, index) => ({
      date: addDays(first as CalendarDate, index),
      close: String(Math.round(close(index))),
      sources: 2,
    })),
  };
}

/** BTC from 4 Mar 2024 for 500 days: a rise, a fall to below the start, and a partial recovery. */
export const SIMULATOR_DATASET = dataset('BTC', '2024-03-04', 500, (index) =>
  index < 200 ? 1000 + index * 3 : index < 350 ? 1600 - (index - 200) * 5 : 850 + (index - 350) * 2,
);

/** SOL from 1 Jun 2024 for 400 days: a steady climb, so it rises where BTC falls. */
export const SIMULATOR_SOL = dataset('SOL', '2024-06-01', 400, (index) => 100 + index / 2);

/** ETH from 4 Mar 2024 for 500 days, for the fill from the fixture plan's BTC and ETH. */
export const SIMULATOR_ETH = dataset('ETH', '2024-03-04', 500, (index) => 200 + (index % 50));

/** The data-from line for BTC's first day, in the English screen's date format. */
export const SIMULATOR_DATA_FROM = 'Data from 4 Mar 2024, the first day with closes from two exchanges.';
