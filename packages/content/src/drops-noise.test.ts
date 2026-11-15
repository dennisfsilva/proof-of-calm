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
    // docs/CONTENT-STYLE.md §4: numerals in English prose, 2 to 9 included.
    expect(body).not.toMatch(/\b(?:two|three|four|five|six|seven|eight|nine)\b/iu);
    expect(body).toContain('The 2 indexes, 13 points apart on one day, also show how much the number depends');
    expect(body).toContain('surveys 15\u00a0%, dominance 10\u00a0%');
    expect(body).toContain(
      'Surveys are marked "currently paused", and alternative.me does not say where their 15\u00a0% goes.',
    );
    expect(body).toContain(
      'never from headlines. It counts a fall when the coins you hold lose 10\u00a0% or more in 7\u00a0days or close 30\u00a0% or more below their 90\u2011day high.',
    );
    // The fall page leaves the next buy day out in the hold phase, so the page is named by what it always holds.
    expect(body).toContain("links to a page with the figure and each coin's earlier falls.");
    expect(body).not.toMatch(/next buy day/u);
  });

  it("When the market drops holds counsel's three things, the frequency with its window, and one past-performance element", () => {
    const { module, source } = read('when-the-market-drops');
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
    // As in Cycles, the element ends its source line, so it renders inside that paragraph and its Risk link
    // counts as a link in running text (apps/web/e2e/matrix.spec.ts, the touch-target check); on a line of its
    // own it renders outside the paragraph.
    const paragraphs = source.replace(/\r\n/gu, '\n').split(/\n{2,}/u);
    expect(paragraphs.filter((paragraph) => paragraph.includes(ELEMENT))).toEqual([
      "Bitstamp BTC/USD daily closes, 16\u00a0Oct\u00a02021 to 16\u00a0Oct\u00a02026, in Proof of Calm's own computation. <PastPerformance />",
    ]);
    // A negation does not lift a ban (docs/CONTENT-STYLE.md §2): no "suggest", even as "suggests no purchase".
    expect(body).not.toMatch(/suggest/iu);
  });

  it('When the market drops says each rule, frequency and case in a sentence of its own', () => {
    const body = read('when-the-market-drops').module.body.replace(/[ \n]+/gu, ' ');
    expect(body).toContain(
      'It counts one when the coins you hold, in the amounts you hold, fall 10\u00a0% or more in 7\u00a0days. It also counts one when they close 30\u00a0% or more below their highest close of the last 90\u00a0days.',
    );
    // docs/CONTENT-STYLE.md §4: numerals in English prose, a numeral and its unit joined by U+2011.
    expect(body).not.toMatch(/\b(?:two|three|four|five|six|seven|eight|nine)\b/iu);
    expect(body).toContain('a 7\u2011day fall of 10\u00a0% or more came on 5.7\u00a0% of days');
    expect(body).toContain('Every 4\u2011year plan in this data');
    expect(body).toContain(
      'about 6 episodes a year. A close 30\u00a0% or more below the 90\u2011day high came on 11.8\u00a0% of days. Either one came on 15.1\u00a0% of days.',
    );
    // The public page shows the same body, so each sentence about an app screen names the app (CONTENT-STYLE §1
    // rule 10), and says only what the app does in every state: no line, row or page without prices that show a fall.
    expect(body).toContain(
      "In the app, Today then shows one line on one visit, and Learn's first row links to the fall.",
    );
    expect(body).toContain('## The fall page in the app');
    expect(body).toContain(
      "In the app, while the prices it reads show a fall in the coins you hold, Learn's first row opens a page with the figure and each coin's earlier falls.",
    );
    expect(body).not.toMatch(/next buy day/u);
    // The fall page stays, with its failure line, while its price read fails or is pending (ThisFallPage), so no
    // sentence says that page's address opens this module.
    expect(body).not.toMatch(/that page's address|When they show no fall/u);
    expect(body).not.toMatch(/Learn opens with|## The fall under way/u);
  });

  it("When the market drops' idea holds no historic figure, read by a visitor with no plan", () => {
    const { module } = read('when-the-market-drops');
    const body = module.body.replace(/[ \n]+/gu, ' ');
    // Learn's index rows and a sheet's title show the idea with no past-performance line and no source, so it
    // holds no historic result (docs/LEGAL.md \u00a73 item 6): its only numbers are the trigger's thresholds.
    expect(module.idea).toBe('A fall of 10\u00a0% or more in 7\u00a0days leaves the plan as it was.');
    expect(body).toContain('fall 10\u00a0% or more in 7\u00a0days.');
    expect(module.idea).not.toMatch(/\b(?:19|20)\d\d\b|times a year|Bitstamp|your plan/u);
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
    // The paper dates the figure by its revision, not by a valuation day, so the module gives that date and no
    // "time of writing" that a page reviewed in 2026 would date to 2026 (CONTENT-STYLE §1 rule 1).
    expect(body).toContain('In its Jul\u00a02023 revision, 81\u00a0% of these users would have lost money.');
    expect(body).not.toMatch(/time of writing/iu);
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
    // The paper's section 2.2 gives the 81 % with no "time of writing", which its introduction keeps for "over 75%".
    expect(bis?.value).toContain('In its Jul 2023 revision, assuming each new user bought $100 of bitcoin');
    expect(bis?.value).not.toMatch(/time of writing/iu);
    expect(facts.find((fact) => fact.key === 'f.leverage')?.value).not.toMatch(/BIS|1049/u);
  });
});
