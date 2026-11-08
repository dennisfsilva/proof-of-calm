import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { date, money } from '../../test/builders';
import { epochDay, fromEpochDay, monthKey } from '../dates/calendar';
import { leadAction, type Phase, type PhaseKind } from './phase';
import { type Action, type ActionStatus, primaryAction } from './statuses';

const START = epochDay(date('2024-01-01'));
const statuses: ActionStatus[] = ['done', 'skipped', 'paused', 'late', 'due', 'upcoming'];
const kinds: PhaseKind[] = ['before', 'buy', 'hold', 'sell', 'exit', 'done'];

const action: fc.Arbitrary<Action> = fc
  .tuple(fc.boolean(), fc.integer({ min: START, max: START + 3650 }), fc.constantFrom(...statuses))
  .map(([lump, day, status]) => {
    const due = fromEpochDay(day);
    return {
      kind: lump ? 'lump' : 'dca',
      slot: lump ? null : monthKey(due),
      due,
      status,
      plannedAmount: money('100'),
      loggedAmount: money('0'),
    };
  });
const actions = fc.array(action, { maxLength: 8 });
const phases: fc.Arbitrary<Phase> = fc.constantFrom(...kinds).map((kind) => ({ kind, openEnded: false, pause: null }));

describe('leadAction (docs/DOMAIN.md §3.3)', () => {
  it('is the primary action before and during the buying phase, and none after it', () => {
    fc.assert(
      fc.property(actions, phases, (list, current) => {
        const buying = current.kind === 'before' || current.kind === 'buy';
        expect(leadAction(list, current)).toEqual(buying ? primaryAction(list) : null);
      }),
    );
  });
});
