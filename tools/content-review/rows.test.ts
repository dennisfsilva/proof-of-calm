import { describe, expect, it } from 'vitest';
import type { Change, ReviewDraft } from './body.ts';
import { leafChanges, rowProblems } from './rows.ts';

const IE = 'packages/content/jurisdictions/ie.json';
const MODULE = 'packages/content/learn/what-is-dca.mdx';

const row = (item: string, field: string): Change => ({
  item,
  field,
  old: 'a',
  new: 'b',
  quote: 'q',
  eventDate: '2027-01-01',
  url: 'https://www.revenue.ie/',
  accessed: '2027-01-01',
  confidence: 'high',
  substantive: false,
  reason: 'r',
});

const draft = (changes: Change[], reviewed: string[] = []): ReviewDraft => ({
  date: '2027-01-01',
  model: 'm',
  countries: ['IE'],
  changes,
  reviewed: reviewed.map((item) => ({ item, read: 2, of: 2, confidence: 'high', reason: 'both sources read' })),
  verified: [],
  unreachable: [],
  pending: [],
  queue: [],
  notes: [],
});

describe('leafChanges', () => {
  it('leafChanges lists a changed, added and removed leaf by path', () => {
    const before = { card: { allowances: ['EUR 1,270', 'none'], rate: 33 }, gone: true, same: null };
    const after = { card: { allowances: ['EUR 1,500', 'none', 'new'], rate: 33 }, same: null, list: [] };
    expect(leafChanges(before, after)).toEqual(['card.allowances[0]', 'gone', 'card.allowances[2]', 'list']);
    expect(leafChanges(undefined, [{ key: 'k', reviewedBy: 'agent-draft' }])).toEqual(['[0].key', '[0].reviewedBy']);
    expect(leafChanges({ a: 1 }, { a: 1 })).toEqual([]);
  });
});

describe('rowProblems', () => {
  it('rowProblems refuses an uncovered leaf, a row for a non-change and a bookkeeping-only file with no reviewed row', () => {
    const changed = [
      { file: IE, leaves: ['card.allowances[0]', 'rules.rate'] },
      { file: 'packages/content/facts/education.json', leaves: ['[0].sources[0].accessed', '[0].reviewedBy'] },
      { file: MODULE },
    ];
    const rows = [row('jurisdictions/ie.json', 'card.allowances[0]'), row('jurisdictions/ie.json', 'card.summary60')];
    expect(rowProblems(draft(rows), changed)).toEqual([
      `${IE}: "rules.rate" changed, and no changes[] row names it`,
      'packages/content/facts/education.json: only bookkeeping changed, and no reviewed[] row names it',
      `${MODULE}: changed, and no changes[] row names it`,
      'changes[1]: a row for a non-change, "jurisdictions/ie.json" "card.summary60"',
    ]);
    const covered = [...rows.slice(0, 1), row('jurisdictions/ie.json', 'rules.rate'), row('learn/what-is-dca.mdx', '')];
    expect(rowProblems(draft(covered, ['facts/education.json']), changed)).toEqual([]);
  });

  it('a changed file with a change row but no reviewed row is refused', () => {
    const changed = [
      { file: IE, leaves: ['card.allowances[0]', 'status.reviewedBy'] },
      { file: MODULE, before: 'a\n', after: 'b\n' },
      { file: 'packages/content/rules/ie.json', leaves: ['holdingRules[0].days'] },
    ];
    const rows = [row('jurisdictions/ie.json', 'card.allowances[0]'), row('learn/what-is-dca.mdx', '')];
    expect(rowProblems(draft(rows), changed)).toEqual([
      `${IE}: changed, and no reviewed[] row names it`,
      `${MODULE}: changed, and no reviewed[] row names it`,
    ]);
    expect(rowProblems(draft(rows, ['jurisdictions/ie.json']), changed)).toEqual([
      `${MODULE}: changed, and no reviewed[] row names it`,
    ]);
    expect(rowProblems(draft(rows, ['jurisdictions/ie.json', 'learn/what-is-dca.mdx']), changed)).toEqual([]);
  });

  it('rowProblems skips rules/*.json and accepts bookkeeping leaves', () => {
    const changed = [
      { file: 'packages/content/rules/ie.json', leaves: ['holdingRules[0].days'] },
      { file: IE, leaves: ['sources[1].accessed', 'status.reviewedBy', 'status.confidence', 'rules.rate'] },
    ];
    expect(rowProblems(draft([row('jurisdictions/ie.json', 'rules.rate')]), changed)).toEqual([]);
    expect(rowProblems(draft([], ['jurisdictions/ie.json']), [{ file: IE, leaves: ['status.reviewedBy'] }])).toEqual(
      [],
    );
  });

  it('rowProblems refuses a change to lastReviewed or nextReviewDue', () => {
    const changed = [{ file: IE, leaves: ['status.lastReviewed', 'status.nextReviewDue', 'status.reviewedBy'] }];
    const owner = 'the agent never sets lastReviewed or nextReviewDue; the owner sets lastReviewed in the flip';
    expect(rowProblems(draft([], ['jurisdictions/ie.json']), changed)).toEqual([
      `${IE}: "status.lastReviewed" changed; ${owner} (docs/CONTENT-OPS.md §8)`,
      `${IE}: "status.nextReviewDue" changed; ${owner} (docs/CONTENT-OPS.md §8)`,
    ]);
  });

  const front = (lines: string[], body = 'The body.\n') =>
    ['---', 'slug: what-is-dca', ...lines, 'reviewedBy: owner', '---', '', body].join('\n');
  const dates = ['lastReviewed: 2026-10-01', 'nextReviewDue: 2027-10-01'];

  it('rowProblems refuses a module whose lines with lastReviewed or nextReviewDue change', () => {
    const owner = 'the agent never sets lastReviewed or nextReviewDue; the owner sets lastReviewed in the flip';
    const refused = `${MODULE}: a line with lastReviewed or nextReviewDue changed; ${owner} (docs/CONTENT-OPS.md §8)`;
    const rows = draft([row('learn/what-is-dca.mdx', 'reviewedBy')]);
    const afters = [
      front(['lastReviewed: 2027-01-01', dates[1] as string]),
      front([...dates, 'nextReviewDue: 2028-01-01']),
      front([dates[0] as string]),
      front(['lastReviewed : 2026-10-01', dates[1] as string]),
      front(dates, 'The body names lastReviewed now.\n'),
    ];
    for (const after of afters)
      expect(rowProblems(rows, [{ file: MODULE, before: front(dates), after }])).toEqual([refused]);
    expect(rowProblems(rows, [{ file: MODULE, after: front(dates) }])).toEqual([refused]);
  });

  it('rowProblems accepts a module whose review-date lines are unchanged', () => {
    const rows = draft([row('learn/what-is-dca.mdx', 'reviewedBy')]);
    const after = front(dates, 'Another body.\n').replace('reviewedBy: owner', 'reviewedBy: agent-draft');
    expect(rowProblems(rows, [{ file: MODULE, before: front(dates), after }])).toEqual([]);
    expect(rowProblems(draft([]), [{ file: MODULE, before: front(dates), after }])).toEqual([
      `${MODULE}: changed, and no changes[] row names it`,
    ]);
  });
});
