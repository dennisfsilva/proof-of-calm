import { describe, expect, it } from 'vitest';
import allowList from '../sources.allow.json' with { type: 'json' };
import { type ContentFile, readAfterReview, validateContent } from './validate.ts';

// A content review reads each source again before the owner signs it off (docs/CONTENT-OPS.md §8). While an entry
// is an agent's draft its `accessed` may pass its `lastReviewed`, and the owner's sign-off sets the review day. The
// draft is still refused, as `agent-draft`; an owner's drawdown row read after the review is refused as
// `accessed-after-review`, an owner's fact by facts.test.ts.
const { $comment: _, ...allow } = allowList;
const options = { today: '2026-10-17', allow };
const file = (path: string, json: unknown): ContentFile => ({ path, json });
const codes = (files: ContentFile[]) =>
  validateContent(files, options).map((problem) => `${problem.code}: ${problem.detail}`);
const DRAFT = 'agent-draft: the owner sets reviewedBy to owner after the review';

const catalogue = file('packages/content/coins.json', [
  { id: 'BTC', name: 'Bitcoin', geckoId: 'bitcoin', decimals: 8 },
]);
const cycles = (reviewedBy: string) =>
  file('packages/content/cycles/drawdowns.json', {
    lastReviewed: '2026-10-16',
    reviewedBy,
    drawdowns: [
      {
        coin: 'BTC',
        high: '2021-11-10',
        low: '2022-11-21',
        fall: '78',
        source: 'https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400',
        publisher: 'Bitstamp',
        accessed: '2026-10-17',
        confidence: 'high',
      },
    ],
  });
const fact = (reviewedBy: string) => ({
  key: 'q.red-day-frequency',
  value: 'A seven-day fall of 10 % or more on 5.7 % of days, 2021-10-16 to 2026-10-16.',
  unit: '% of days',
  date: '2026-10-16',
  source: 'https://www.bitstamp.net/api/',
  publisher: 'Bitstamp',
  accessed: '2026-10-17',
  confidence: 'high',
  lastReviewed: '2026-10-16',
  reviewedBy,
});

describe('a source read after its review (docs/CONTENT-OPS.md §8)', () => {
  it("refuses an owner's drawdown file read after its review, and lets an agent's draft through as a draft", () => {
    expect(codes([catalogue, cycles('owner')])).toEqual([
      'accessed-after-review: drawdowns.0 accessed 2026-10-17, last reviewed 2026-10-16',
    ]);
    expect(codes([catalogue, cycles('agent-draft')])).toEqual([DRAFT]);
  });

  // The facts' own check is facts.test.ts's, on the shipped files, by the same rule.
  it("refuses an owner's fact read after its review, and lets an agent's draft through as a draft", () => {
    expect(readAfterReview(fact('owner').accessed, fact('owner'))).toBe(true);
    expect(readAfterReview(fact('agent-draft').accessed, fact('agent-draft'))).toBe(false);
    expect(readAfterReview('2026-10-16', fact('owner'))).toBe(false);
    expect(codes([file('packages/content/facts/education.json', [fact('agent-draft')])])).toEqual([DRAFT]);
  });
});
