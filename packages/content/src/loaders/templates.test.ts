import { readFileSync } from 'node:fs';
import { followsTemplate, type HoldingRule, planFromTemplate, TemplateSchema } from '@proofofcalm/core';
import { date, id, instant, money } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { TemplateSchema as ContentTemplateSchema } from '../schema/template.ts';
import { COINS } from './coins.ts';
import { TEMPLATES, templateById } from './templates.ts';

const template = (templateId: string) => {
  const found = templateById(templateId);
  if (found === null) throw new Error(`no template ${templateId}`);
  return found;
};

describe('TEMPLATES (docs/DOMAIN.md §5, ADR-0009)', () => {
  it('are the four starting points, in the order of the table, each valid for the core', () => {
    expect(TEMPLATES.map((each) => [each.id, each.name])).toEqual([
      ['btc-only-hold', 'Bitcoin only, no sell window'],
      ['two-coins', 'Two coins, no sell window'],
      ['cycle-plan', 'Cycle plan'],
      ['accumulate', 'Three coins, no sell window'],
    ]);
    for (const each of TEMPLATES) expect(TemplateSchema.parse(each)).toEqual(each);
  });

  it('are named for their structure: no imperative, no promise, no word of safety (CONTENT-STYLE §6)', () => {
    for (const { name, oneLine, explanation } of TEMPLATES) {
      expect(name).not.toMatch(/\b(never|always|accumulate|buy|hold|sell)\b(?! window)/i);
      expect(`${name} ${oneLine} ${explanation}`).not.toMatch(/conservative|balanced|safe/i);
    }
  });

  it('hold the coins, splits, windows, references and dates of the table', () => {
    const shape = (templateId: string) => {
      const { coins, split, lastBuy, sellWindow, references, validUntil } = template(templateId);
      return { coins: coins.map((coin) => coin.id), split, lastBuy, sellWindow, references, validUntil };
    };
    const none = { lastBuy: undefined, sellWindow: null, references: {}, validUntil: undefined };
    expect(shape('btc-only-hold')).toEqual({ coins: ['BTC'], split: { BTC: '100' }, ...none });
    expect(shape('two-coins')).toEqual({ coins: ['BTC', 'ETH'], split: { BTC: '70', ETH: '30' }, ...none });
    expect(shape('accumulate')).toEqual({
      coins: ['BTC', 'ETH', 'SOL'],
      split: { BTC: '50', ETH: '30', SOL: '20' },
      ...none,
    });
    expect(shape('cycle-plan')).toEqual({
      coins: ['BTC', 'ETH', 'SOL', 'LINK'],
      split: { BTC: '40', ETH: '30', SOL: '15', LINK: '15' },
      lastBuy: '2028-06-01',
      sellWindow: { opens: '2029-06-01', closes: '2029-10-31', exitBy: '2029-12-31' },
      references: { peakFrom: '2029-09-01', peakTo: '2029-10-31', halving: '2028-04-15' },
      validUntil: '2028-06-01',
    });
  });

  it('no template holds expectations, and the schema refuses them', () => {
    for (const each of TEMPLATES) expect(each, each.id).not.toHaveProperty('expectations');
    const cycle = template('cycle-plan');
    expect(ContentTemplateSchema.safeParse(cycle).success).toBe(true);
    expect(ContentTemplateSchema.safeParse({ ...cycle, expectations: { bear: '0.7' } }).success).toBe(false);
  });

  it('carry no literal percentage in a oneLine (CONTENT-STYLE §4)', () => {
    for (const { id: templateId, oneLine } of TEMPLATES) expect(oneLine, templateId).not.toMatch(/\d\s*%/);
  });

  it('carry the catalogue’s coins, with the decimals of docs/DESIGN.md §5', () => {
    for (const each of TEMPLATES) {
      for (const coin of each.coins) expect(COINS).toContainEqual(coin);
    }
    expect(template('cycle-plan').coins.map((coin) => [coin.id, coin.decimals])).toEqual([
      ['BTC', 8],
      ['ETH', 6],
      ['SOL', 4],
      ['LINK', 4],
    ]);
  });

  it('show the risk label first and say what the Cycle plan forecasts in its first sentence', () => {
    expect(TEMPLATES.map((each) => each.riskLabel)).toEqual([
      'High risk · single asset',
      'High risk',
      'Very high risk · time-bound bet on a cycle',
      'Very high risk',
    ]);
    expect(template('cycle-plan').explanation.split('. ')[0]).toBe(
      'This template encodes a forecast about 2029 that may not come true: that Bitcoin’s highs keep coming about 4 years apart, the next between 1 September 2029 and 31 October 2029',
    );
    expect(template('cycle-plan').explanation).not.toContain('last high');
    expect(template('two-coins').explanation).toMatch(
      /^2 coins, Bitcoin and Ethereum, bought every month and held, with no date to sell unless you add one\./,
    );
  });

  it('the Cycle plan says on its card that the forecast may not come true', () => {
    expect(template('cycle-plan').oneLine).toMatch(/\. The plan rests on a forecast that may not come true\.$/);
  });

  it('carry each coin’s dated fall from the intraday high to the intraday low (LEGAL §4, ADR-0009)', () => {
    const BTC = ['BTC', '2021-11-10', '2022-11-21', '78'];
    const ETH = ['ETH', '2021-11-10', '2022-06-18', '82'];
    const SOL = ['SOL', '2021-11-06', '2022-12-29', '97'];
    const LINK = ['LINK', '2021-05-10', '2023-06-10', '91'];
    const falls = (templateId: string) =>
      template(templateId).drawdowns.map(({ coin, high, low, fall }) => [coin, high, low, fall]);
    expect(falls('btc-only-hold')).toEqual([BTC]);
    expect(falls('two-coins')).toEqual([BTC, ETH]);
    expect(falls('cycle-plan')).toEqual([BTC, ETH, SOL, LINK]);
    expect(falls('accumulate')).toEqual([BTC, ETH, SOL]);
  });

  it('date every drawdown figure an explanation cites by the day, month and year of its high and low', () => {
    const long = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const day = (calendar: string) => long.format(new Date(`${calendar}T00:00:00Z`));
    for (const { explanation, drawdowns, lastReviewed } of TEMPLATES) {
      for (const { coin, high, low, fall, accessed } of drawdowns) {
        expect(accessed <= lastReviewed, coin).toBe(true);
        if (!explanation.includes(`${fall} %`)) continue;
        expect(explanation, `${coin} ${fall} %`).toContain(`high on ${day(high)} to its low on ${day(low)}`);
      }
    }
    expect(template('two-coins').explanation).toContain('Ethereum fell 82 %');
    expect(template('cycle-plan').explanation).toContain('Chainlink fell 91 %');
  });

  it('name no fall without the day, month and year of its high and low (CONTENT-STYLE §1 rule 1)', () => {
    const DAY = String.raw`\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}`;
    const dated = new RegExp(String.raw`from its high on ${DAY} to its low on ${DAY}`);
    for (const { id: templateId, explanation } of TEMPLATES) {
      for (const sentence of explanation.split(/(?<=\.)\s+/)) {
        if (/\b(fell|fallen|dropped|lost)\b/i.test(sentence)) expect(sentence, templateId).toMatch(dated);
      }
    }
  });

  it('write every date with its day, month and year, never a month alone (CONTENT-STYLE §1 rule 1)', () => {
    const monthAlone =
      /(?<!\d )\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/;
    for (const { id: templateId, oneLine, explanation } of TEMPLATES) {
      expect(oneLine, templateId).not.toMatch(monthAlone);
      expect(explanation, templateId).not.toMatch(monthAlone);
    }
    expect(template('cycle-plan').oneLine).toBe(
      '4 coins bought monthly until 1 June 2028, held, then sold in thirds from 1 June 2029 to 31 October 2029. The plan rests on a forecast that may not come true.',
    );
  });

  it('say what happens without a metaphor or an idiom (CONTENT-STYLE §1 rule 3)', () => {
    for (const { id: templateId, explanation } of TEMPLATES) {
      expect(explanation, templateId).not.toMatch(/rhythm|rides on|whatever the market gives/);
    }
    expect(template('btc-only-hold').explanation).toContain('What can go wrong: every amount goes into 1 coin.');
    expect(template('cycle-plan').explanation).toContain(
      'What can go wrong: past cycles are too few data points to be a law.',
    );
    // A plan's value is units held times each coin's price (DOMAIN), so it depends on the price, never equals it.
    expect(template('btc-only-hold').explanation).toMatch(/needed depends on the market price that day\.$/);
    expect(template('accumulate').explanation).toMatch(/needed depends on that day’s market prices\.$/);
  });

  it('give each fall its own sentence, one idea each (CONTENT-STYLE §1 rule 4)', () => {
    for (const { id: templateId, explanation } of TEMPLATES) {
      for (const sentence of explanation.split(/(?<=\.)\s+/)) {
        expect(sentence.match(/ fell /g)?.length ?? 0, `${templateId}: ${sentence}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keep each sentence to 25 words, apart from the one the forecast needs (CONTENT-STYLE §1 rule 4)', () => {
    // ADR-0009 (Disagreement) wins over the 25 words for the forecast sentence.
    const exempt = ['This template encodes a forecast about 2029 '];
    for (const { id: templateId, explanation } of TEMPLATES) {
      for (const sentence of explanation.split(/(?<=\.)\s+/)) {
        if (exempt.some((start) => sentence.startsWith(start))) continue;
        expect(sentence.split(/\s+/).length, `${templateId}: ${sentence}`).toBeLessThanOrEqual(25);
      }
    }
  });

  it('write every list of three or more with the serial comma (CONTENT-STYLE §1 rule 9)', () => {
    expect(template('accumulate').oneLine).toBe(
      'Each monthly amount is split between Bitcoin, Ethereum, and Solana, with no sell window.',
    );
    const cycle = template('cycle-plan').explanation;
    expect(cycle).toContain('40 % Bitcoin, 30 % Ethereum, 15 % Solana, and 15 % Chainlink.');
    expect(cycle).toContain('thirds to sell from 1 June 2029, 1 August 2029, and 1 October 2029');
  });

  it('state no multiple of the money put in, a projection (LEGAL §3.6, ADR-0011)', () => {
    for (const { id: templateId, explanation } of TEMPLATES) {
      expect(explanation, templateId).not.toMatch(/\d×/);
    }
    expect(template('cycle-plan').explanation.split('\n\n')[2]).toBe(
      'From 1 June 2028 its dates no longer fill in, and the app asks for new ones.',
    );
  });

  it('cite for each fall a series that holds its high and its low (ADR-0009)', () => {
    const cited = (templateId: string) =>
      template(templateId).drawdowns.map(({ coin, source, lowSource }) => [coin, source, lowSource]);
    const coinbase = 'https://api.exchange.coinbase.com/products/SOL-USD/candles?granularity=86400';
    expect(cited('accumulate')[2]).toEqual([
      'SOL',
      `${coinbase}&start=2021-10-01T00:00:00Z&end=2022-07-27T00:00:00Z`,
      `${coinbase}&start=2022-07-27T00:00:00Z&end=2023-01-31T00:00:00Z`,
    ]);
    for (const each of TEMPLATES) {
      for (const { coin, source, lowSource } of each.drawdowns) {
        // LINK has not regained its high, so its low can still move: a 3-day response runs to today.
        if (coin === 'LINK') expect(lowSource, source).toContain('step=259200');
        else if (source.includes('bitstamp'))
          expect([source, lowSource]).toEqual([expect.stringContaining('&start='), undefined]);
        else expect(lowSource, source).toBeDefined();
      }
    }
  });

  it('keep the owner’s review fields as the files hold them', () => {
    const file = JSON.parse(readFileSync(new URL('../../templates/cycle-plan.json', import.meta.url), 'utf8'));
    expect(template('cycle-plan')).toMatchObject({ lastReviewed: '2026-11-02', reviewedBy: 'owner' });
    expect(template('cycle-plan')).toEqual(file);
  });
});

describe('templateById', () => {
  it('finds a plan’s template, and nothing for a custom plan or an id no longer offered', () => {
    expect(templateById('accumulate')?.name).toBe('Three coins, no sell window');
    expect(templateById(null)).toBeNull();
    expect(templateById('recommended')).toBeNull();
  });
});

describe('a plan from a template, with each country’s rule (docs/DOMAIN.md §5)', () => {
  const PORTUGAL: HoldingRule = { kind: 'days', days: 365, effect: 'exempt' };
  const GERMANY: HoldingRule = { kind: 'years', years: 1, effect: 'exempt' };
  const start = (holdingRule: HoldingRule, overrides: { acceptEarlyOpen?: boolean; today?: string } = {}) => ({
    id: id(),
    country: 'PT',
    countryRuleVersion: 1,
    holdingRule,
    payCurrency: 'EUR' as const,
    displayCurrency: 'EUR' as const,
    monthlyAmount: money('100'),
    startingAmount: money('0'),
    firstBuy: date('2026-11-01'),
    buyDay: 1,
    lastBuy: null,
    sellWindow: null,
    acceptEarlyOpen: overrides.acceptEarlyOpen ?? false,
    why: '',
    today: date(overrides.today ?? '2026-10-17'),
    now: instant('2026-10-17T09:00:00Z'),
  });

  it('starts the Cycle plan in Portugal as dated: the window opens the day the last buy passes 365 days', () => {
    const plan = planFromTemplate(template('cycle-plan'), start(PORTUGAL));
    expect(plan.ok && plan.value.sellWindow).toEqual({
      opens: '2029-06-01',
      closes: '2029-10-31',
      exitBy: '2029-12-31',
    });
    expect(plan.ok && followsTemplate(plan.value, template('cycle-plan'))).toBe(true);
  });

  it('asks a German user to accept the window: it opens one day before the last buy is tax-free', () => {
    expect(planFromTemplate(template('cycle-plan'), start(GERMANY))).toEqual({
      ok: false,
      error: { code: 'invalid-plan', issues: ['sell-window-before-eligibility'] },
    });
    const accepted = planFromTemplate(template('cycle-plan'), start(GERMANY, { acceptEarlyOpen: true }));
    expect(accepted.ok && accepted.value.sellWindow?.acceptedEarlyOpen).toBe(true);
  });

  it('asks for dates once the Cycle plan’s dates have passed, and always for the undated templates', () => {
    const late = start(PORTUGAL, { today: '2028-06-01' });
    expect(planFromTemplate(template('cycle-plan'), late)).toEqual({ ok: false, error: { code: 'dates-needed' } });
    expect(planFromTemplate(template('btc-only-hold'), start(PORTUGAL))).toEqual({
      ok: false,
      error: { code: 'dates-needed' },
    });
  });
});
