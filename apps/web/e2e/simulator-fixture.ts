// A synthetic dataset file for the simulator's spec (packages/data/README.md, The dataset): made-up closes on
// made-up days, never an exchange's figure (ADR-0036, Reading of 2026-11-27: tests use synthetic values only).

/** The served path of BTC's file, as the screen asks for it. */
export const SIMULATOR_PATH = '/data/prices/BTC-EUR.json';

/** Three days of BTC in EUR with two sources each; the first day is the one the data-from line names. */
export const SIMULATOR_DATASET = {
  coin: 'BTC',
  currency: 'EUR',
  days: [
    { date: '2024-03-04', close: '1000', sources: 2 },
    { date: '2024-03-05', close: '1010.5', sources: 2 },
    { date: '2024-03-06', close: '990.25', sources: 2 },
  ],
} as const;

/** The data-from line for the fixture's first day, in the English screen's date format. */
export const SIMULATOR_DATA_FROM = 'Data from 4 Mar 2024, the first day with closes from two exchanges.';
