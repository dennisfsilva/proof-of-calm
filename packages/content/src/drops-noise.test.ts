import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import facts from '../facts/education.json' with { type: 'json' };
import { parseModule } from './loaders/modules.ts';
import { moduleProblems } from './modules-validate.ts';
import { findBanned } from './style/banned.ts';

// docs/EDUCATION.md §5 and §6: Noise and When the market drops. Each passes the module gate on the day they
// were reviewed, quotes no past-performance sentence of its own, and holds the sentences counsel and the
// ban list settled (docs/CONTENT-STYLE.md §2).
const root = new URL('../', import.meta.url);
const context = { facts: new Map(facts.map((fact) => [fact.key, fact.lastReviewed])), today: '2026-11-09' };
const SLUGS = ['noise', 'when-the-market-drops'] as const;
const THREE_THINGS = 'A monthly buyer can do nothing, log the buy on the buy day, or re-read the plan.';
const ELEMENT = '<PastPerformance />';
// As in the Cycles module: a figure keeps its unit and a date stays whole (a no-break space between them).
const MONTH = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec';
const BREAKS = [
  new RegExp(`\\d{1,2}[ \\n](?:${MONTH})`, 'gu'),
  new RegExp(`(?:${MONTH})[ \\n]\\d{4}`, 'gu'),
  /[ \n]%/gu,
  /\d[ \n](?:months|years|days|points)/gu,
];

function read(slug: (typeof SLUGS)[number]) {
  const path = `packages/content/learn/${slug}.mdx`;
  const source = readFileSync(new URL(`learn/${slug}.mdx`, root), 'utf8');
  const parsed = parseModule(path, source);
  if (!parsed.ok) throw new Error(path);
  return { path, source, module: parsed.value };
}

describe('the Noise and When the market drops modules', () => {
  it.each(SLUGS)('%s passes the module gate, with no banned word', (slug) => {
    const { path, source, module } = read(slug);
    expect(moduleProblems({ path, source }, context)).toEqual([]);
    expect([module.title, module.idea, module.caveat].flatMap((text) => findBanned(text))).toEqual([]);
    expect(module.reviewedBy).toBe('owner');
    expect(module.lastReviewed).toBe('2026-11-09');
  });

  it.each(SLUGS)('%s keeps each figure with its unit and each date whole', (slug) => {
    const { body } = read(slug).module;
    expect(BREAKS.flatMap((rule) => body.match(rule) ?? [])).toEqual([]);
  });

  it('Noise names what the app leaves out without the banned word, then what it shows instead', () => {
    const { module } = read('noise');
    expect(module.facts).toContain('l.fear-greed');
    const body = module.body.replace(/[ \n]+/gu, ' ');
    // The serial comma of docs/CONTENT-STYLE.md §1 rule 9.
    expect(body).toContain('no news feed, no sentiment index, and no price notifications');
    expect(body).toMatch(/one line on Today, once per fall/u);
    expect(`${module.idea} ${module.caveat} ${module.body}`).not.toMatch(/alert/iu);
    // Each reading of 16 Oct 2026 with the index it comes from, as fact l gives them.
    expect(body).toMatch(/alternative\.me's index read 63, "Greed", and CoinMarketCap's 50, "Neutral"/u);
    // One idea a sentence (docs/CONTENT-STYLE.md §1 rule 4), and the index's scope in alternative.me's words.
    expect(body).toContain(
      'Each is built to bring a person back to the screen. A monthly plan exists so that no headline decides a purchase.',
    );
    expect(body).toContain('Crypto Fear & Greed Index covers bitcoin only');
    expect(body).toContain('surveys 15\u00a0%, dominance 10\u00a0%');
    expect(body).toContain(
      'Surveys are marked "currently paused", and alternative.me does not say where their 15\u00a0% goes.',
    );
    expect(body).toContain(
      'never from headlines. It counts a fall when the coins you hold lose 10\u00a0% or more in seven days or close 30\u00a0% or more below their 90-day high.',
    );
    // The fall page leaves the next buy day out in the hold phase, so the page is named by what it always holds.
    expect(body).toContain("links to a page with the figure and each coin's earlier falls.");
    expect(body).not.toMatch(/next buy day/u);
  });

  it("When the market drops holds counsel's three things, the frequency with its window, and one past-performance element", () => {
    const { module } = read('when-the-market-drops');
    // A line end reads as a space; the no-break spaces stay, so the window is matched as written.
    const body = module.body.replace(/[ \n]+/gu, ' ');
    expect(module.chart).toBe('none');
    expect(module.facts).toEqual(['q.red-day-frequency', 'o.dca-windows', 'r.app-user-losses']);
    expect(body).toContain(THREE_THINGS);
    expect(body).not.toMatch(/\b(?:only|actually)\b/iu);
    expect(body).toMatch(/16\u00a0Oct\u00a02021 to 16\u00a0Oct\u00a02026/u);
    expect(body).toContain('15.1\u00a0%');
    expect(body).toContain('118');
    expect(body).toContain('Bitstamp');
    expect(body).toContain('BIS');
    // The element sits once, directly under the first historic figure's source line, before the 118-plan figure.
    expect(body.split(ELEMENT)).toHaveLength(2);
    expect(body.indexOf(ELEMENT)).toBeGreaterThan(body.indexOf('15.1\u00a0%'));
    expect(body.indexOf(ELEMENT)).toBeLessThan(body.indexOf('118'));
    // docs/LEGAL.md §4: the line the element closes names the closes' source and their first and last dates.
    expect(body).toContain(
      "Bitstamp BTC/USD daily closes, 16\u00a0Oct\u00a02021 to 16\u00a0Oct\u00a02026, in Proof of Calm's own computation. <PastPerformance />",
    );
    // A negation does not lift a ban (docs/CONTENT-STYLE.md §2): no "suggest", even as "suggests no purchase".
    expect(body).not.toMatch(/suggest/iu);
  });

  it('When the market drops says each rule, frequency and case in a sentence of its own', () => {
    const body = read('when-the-market-drops').module.body.replace(/[ \n]+/gu, ' ');
    expect(body).toContain(
      'It counts one when the coins you hold, in the amounts you hold, fall 10\u00a0% or more in seven days. It also counts one when they close 30\u00a0% or more below their highest close of the last 90\u00a0days.',
    );
    expect(body).toContain(
      'about 6 episodes a year. A close 30\u00a0% or more below the 90-day high came on 11.8\u00a0% of days. Either one came on 15.1\u00a0% of days.',
    );
    expect(body).toContain("Learn's first row opens a page with the figure and each coin's earlier falls.");
    expect(body).not.toMatch(/next buy day/u);
    expect(body).toContain("With no fall under way, that page's address opens this module.");
  });

  it('When the market drops quotes the BIS paper as its revision gives it, from its own fact r', () => {
    const body = read('when-the-market-drops').module.body.replace(/[ \n]+/gu, ' ');
    const bis = facts.find((fact) => fact.key === 'r.app-user-losses');
    expect(bis?.publisher).toBe('BIS');
    expect(bis?.source).toBe('https://www.bis.org/publ/work1049.htm');
    // The quoted figures come from the July 2023 revision; October 2022 belongs to the one-purchase case only.
    expect(body).toContain('BIS Working Paper 1049 (Nov\u00a02022, revised Jul\u00a02023)');
    expect(body).toContain('covered crypto app downloads in 95 countries from Aug\u00a02015 to Jun\u00a02022.');
    expect(body).toContain('$100 of bitcoin in the month of download and every month after.');
    expect(body).toContain('At the time of writing, 81\u00a0% of these users would have lost money.');
    expect(body).toContain('The median investor would have lost 48\u00a0% of $900 invested.');
    expect(body).not.toMatch(/October/u);
    // The fact holds what the module quotes and no more; f keeps CoinGlass's figures and no BIS ones.
    for (const quoted of [
      'Nov 2022, revised Jul 2023',
      '95 countries',
      'Aug 2015 to Jun 2022',
      '$100',
      '81 %',
      '48 % of $900',
    ])
      expect(bis?.value).toContain(quoted);
    expect(bis?.value).not.toMatch(/73 %|October/u);
    expect(facts.find((fact) => fact.key === 'f.leverage')?.value).not.toMatch(/BIS|1049/u);
  });
});
