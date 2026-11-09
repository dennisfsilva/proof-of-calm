// The red-day port (docs/ARCHITECTURE.md "Inside packages/app"; docs/DOMAIN.md §3.11): the Red day page's one way to
// its figures, which it reads as plain models, so the lazy Learn chunk imports no value of core or content
// (features/learn/lazy-chunk.test.ts). This stub is all Today's entry carries: the maths, the catalogue, the cycles
// file and its parser load with `./red-day-model` on the first question.
import type { HistorySource } from '../ports';
import type { RedDayPort } from './red-day-types';

export function createRedDay(history: HistorySource): RedDayPort {
  const maths = () => import('./red-day-model');
  return {
    model: async (input) => (await maths()).redDayModel(history, input),
    pastFalls: async (coins) => (await maths()).pastFalls(coins),
  };
}
