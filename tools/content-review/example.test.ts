// The example draft the skill points to (.claude/skills/review-content/draft-example.json) in a shape the
// code accepts: it parses, its change rows name leaves that exist in the real data files, rows.ts accepts
// them, and every link is on its item's list. A leaf's existence is checked, never its value, so the
// owner's own review PR, which changes that value, keeps this test green.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allowedDomains, itemDomains, parseDraft, type ReviewDraft, sourceLink } from './body.ts';
import { leafChanges, rowProblems } from './rows.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const parsed = parseDraft(read('.claude/skills/review-content/draft-example.json'));
const draft = parsed.draft as ReviewDraft;
const allow: unknown = JSON.parse(read('packages/content/sources.allow.json'));
const items = () => [...new Set([...draft.changes, ...draft.reviewed].map(({ item }) => item))];

describe('draft-example.json', () => {
  it('draft-example.json parses with no problem', () => {
    expect(parsed.problems).toEqual([]);
    expect(draft.changes.length).toBeGreaterThan(0);
    expect(draft.reviewed.length).toBeGreaterThan(0);
    expect(draft.unreachable.length).toBeGreaterThan(0);
  });

  it("each change row's field is a leaf that exists in its real data file", () => {
    for (const { item, field } of draft.changes) {
      const data: unknown = JSON.parse(read(`packages/content/${item}`));
      expect(leafChanges(undefined, data), `${item} ${field}`).toContain(field);
    }
  });

  it("rowProblems accepts the example's rows against their own leaves", () => {
    const changed = items().map((item) => ({
      file: `packages/content/${item}`,
      leaves: [
        ...draft.changes.filter((change) => change.item === item).map(({ field }) => field),
        'status.confidence',
      ],
    }));
    expect(rowProblems(draft, changed)).toEqual([]);
  });

  it("every link in the example is on its item's list", () => {
    const any = allowedDomains(allow);
    const links = [
      ...[...draft.changes, ...draft.pending].map(({ item, url }) => ({ url, domains: itemDomains(item, allow) })),
      ...draft.verified.flatMap(({ urls }) => urls.map((url) => ({ url, domains: any }))),
      ...draft.unreachable.map(({ url }) => ({ url, domains: any })),
    ];
    expect(links.length).toBeGreaterThan(0);
    expect(links.map(({ url, domains }) => sourceLink(url, domains).problem).filter(Boolean)).toEqual([]);
  });
});
