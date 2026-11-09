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
  });

  it("When the market drops holds counsel's three things, the frequency with its window, and one past-performance element", () => {
    const { module } = read('when-the-market-drops');
    // A line end reads as a space; the no-break spaces stay, so the window is matched as written.
    const body = module.body.replace(/[ \n]+/gu, ' ');
    expect(module.chart).toBe('none');
    expect(module.facts).toEqual(['q.red-day-frequency', 'o.dca-windows', 'f.leverage']);
    expect(body).toContain(THREE_THINGS);
    expect(body).not.toMatch(/\b(?:only|actually)\b/iu);
    expect(body).toMatch(/16 Oct 2021 to 16 Oct 2026/u);
    expect(body).toContain('15.1 %');
    expect(body).toContain('118');
    expect(body).toContain('Bitstamp');
    expect(body).toContain('BIS');
    // The element sits once, directly under the first historic figure's source line, before the 118-plan figure.
    expect(body.split(ELEMENT)).toHaveLength(2);
    expect(body.indexOf(ELEMENT)).toBeGreaterThan(body.indexOf('15.1 %'));
    expect(body.indexOf(ELEMENT)).toBeLessThan(body.indexOf('118'));
    // docs/LEGAL.md §4: the line the element closes names the closes' source and their first and last dates.
    expect(body).toContain(
      "Bitstamp BTC/USD daily closes, 16 Oct 2021 to 16 Oct 2026, in Proof of Calm's own computation. <PastPerformance />",
    );
    // A negation does not lift a ban (docs/CONTENT-STYLE.md §2): no "suggest", even as "suggests no purchase".
    expect(body).not.toMatch(/suggest/iu);
  });
});
