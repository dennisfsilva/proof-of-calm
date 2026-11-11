import { describe, expect, it } from 'vitest';
import type { ReviewDraft } from './body.ts';
import { htmlProblems } from './render-check.ts';

const URL1 = 'https://www.revenue.ie/en/page.aspx?a=1&b=2#2';
const domains = ['revenue.ie'];
const WJ = String.fromCodePoint(0x2060);
const draft: ReviewDraft = {
  date: '2027-01-01',
  model: 'm',
  countries: ['IE'],
  changes: [
    {
      item: 'IE',
      field: 'f',
      old: 'a',
      new: 'b',
      quote: 'q',
      eventDate: '2027-01-01',
      url: URL1,
      accessed: '2027-01-01',
      confidence: 'high',
      substantive: false,
      reason: 'r @x',
    },
  ],
  verified: [],
  unreachable: [],
  pending: [],
  queue: [],
  notes: ['a | b'],
};

/** What GitHub's renderer returns for renderBody's output of the draft above (its shape, 2026-11-11). */
const GOOD = `<h2 dir="auto">Changes</h2>
<markdown-accessiblity-table><table role="table"><thead><tr><th>Item</th><th>Field</th><th>Old</th><th>New</th>
<th>Quote</th><th>Event date</th><th>Source</th><th>Accessed</th><th>Confidence</th><th>Substantive</th><th>Reason</th>
</tr></thead><tbody><tr><td>IE</td><td>f</td><td>a</td><td>b</td><td>q</td><td>2027-01-01</td>
<td><a href="https://www.revenue.ie/en/page.aspx?a=1&amp;b=2#2" rel="nofollow">www${WJ}.revenue.ie</a></td>
<td>2027-01-01</td><td>high</td><td>no</td><td>r @${WJ}x</td></tr></tbody></table></markdown-accessiblity-table>
<h2 dir="auto">Notes for the owner</h2>
<ul dir="auto"><li>a | b</li></ul>
<h2 dir="auto">Run metadata</h2>
<ul dir="auto"><li>Model: m</li><li>Countries: IE</li><li>Date: 2027-01-01</li></ul>`;

describe('htmlProblems', () => {
  it('htmlProblems flags a user-mention, an issue-link, an extra href and a swallowed cell', () => {
    expect(htmlProblems(GOOD, draft, domains)).toEqual([]);

    const mention = GOOD.replace(
      `r @${WJ}x`,
      'r <a class="user-mention notranslate" href="https://github.com/x">@x</a>',
    );
    expect(htmlProblems(mention, draft, domains)).toContain('user-mention link "@x"');

    const issue = GOOD.replace(
      '<td>q</td>',
      '<td><a class="issue-link js-issue-link" href="https://github.com/o/r/issues/1">#1</a></td>',
    );
    expect(htmlProblems(issue, draft, domains)).toEqual(
      expect.arrayContaining(['issue-link link "#1"', 'cell not found as written: "q"']),
    );

    const extra = GOOD.replace('<li>a | b</li>', '<li>a | b <a href="https://evil.example/">revenue.ie</a></li>');
    expect(htmlProblems(extra, draft, domains)).toEqual(
      expect.arrayContaining([
        'href not in the draft: https://evil.example/',
        'link text "revenue.ie" is not its host evil.example',
      ]),
    );

    const swallowed = GOOD.replace('<li>a | b</li>', '<li>a </li>');
    expect(htmlProblems(swallowed, draft, domains)).toEqual(['cell not found as written: "a | b"']);

    const math = GOOD.replace('<li>a | b</li>', '<li><math-renderer>a | b</math-renderer></li>');
    expect(htmlProblems(math, draft, domains)).toEqual(['element <math-renderer>']);

    const unlinked = GOOD.replace(new RegExp(`<a href=[^>]*>www${WJ}\\.revenue\\.ie</a>`), 'www.revenue.ie');
    expect(htmlProblems(unlinked, draft, domains)).toEqual([`draft URL not linked: ${URL1}`]);
  });
});
