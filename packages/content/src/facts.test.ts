import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import allowList from '../sources.allow.json' with { type: 'json' };
import { FactSchema } from './schema/fact.ts';
import { type ContentFile, validateContent } from './validate.ts';

// The facts files against the table they come from (docs/EDUCATION.md §9, docs/CONTENT-OPS.md §7). The
// content package's turbo.json names EDUCATION.md as an input of the test task, so a change to the table
// reruns this test instead of replaying a cached pass.
const root = new URL('../', import.meta.url);
const { $comment: _, ...allow } = allowList;

/** The rows of EDUCATION §9's table, each split into its cells; the table's own cells hold no pipe. */
function educationRows(): string[][] {
  const doc = readFileSync(new URL('../../docs/EDUCATION.md', root), 'utf8');
  const section = doc.slice(doc.indexOf('## 9. Facts and sources'), doc.indexOf('## 10. '));
  return section
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => line.split('|').map((cell) => cell.trim()));
}

/** The keys a first-column cell of EDUCATION §9's table names. */
function rowKeys(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '');
}

/** The keys in the first column of EDUCATION §9's table. */
function educationKeys(): string[] {
  return educationRows().flatMap(([, keys = '']) => rowKeys(keys));
}

const files: ContentFile[] = readdirSync(new URL('facts/', root))
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    path: `packages/content/facts/${name}`,
    json: JSON.parse(readFileSync(new URL(`facts/${name}`, root), 'utf8')),
  }));
const facts = files.flatMap((file) => (file.json as unknown[]).map((item) => FactSchema.parse(item)));

// The wording checks on the values. The `confidence` field holds a rating and a value never does; a value
// states no researcher's correction; CONTENT-STYLE §4 speaks only of short months, so "September 2025" stands.
// "high" and "low" are figures too, so a bracket that holds a price is no rating; a rating opens its bracket
// or its own part of one, after a comma or a semicolon.
const rating = /\b(?:medium|confidence)\b|\((?:[^()$€£]*[,;] ?)?(?:high|low)\b[^()$€£]*\)/i;
const correction =
  /\([^()]*\b[Nn]ot (?:the )?(?:\d{1,2}(?:st|nd|rd|th)\b|\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|(?:\d{4}-)?\d{2}-\d{2})[^()]*\)/;
const shortSeptember = /\bSep\b/;

/** What each check must let through and what it must catch. */
const wordings = [
  {
    check: rating,
    accepted: [
      '(high: $126,272; low: $57,735)',
      ', high: $126,272, low: $57,735.',
      '35.5 % below the high, 41 % above the low',
      '(highest close $124,728)',
      '(lowest close $58,526)',
      '($126,272, high)',
      '(the 2025 high)',
      '(2025, the high so far)',
      '(→ the 2025 high)',
    ],
    rejected: [
      '(medium confidence)',
      '(Medium: Mt. Gox-era data)',
      '(confidence: medium)',
      '(medium; Mt. Gox-era data)',
      '(medium-high: thin data)',
      '(High)',
      '(low: thin data)',
      '(Bitstamp, high)',
      '(read, low)',
      '(high: 2011 data)',
      '(Bitstamp, high: 2011 data)',
      '(read, low: thin data)',
      '(Bitstamp; high)',
    ],
  },
  {
    check: correction,
    accepted: [
      'The UK tax year starts on 6 Apr, not 1 Jan.',
      'not the 18th of the month',
      '(not 5 coins)',
      '(not the 5 largest)',
    ],
    rejected: [
      '(13 Jun 2022, not 18 Jun)',
      '(13 Jun 2022, not the 18th)',
      '(13 Jun 2022, not 18 June)',
      '(not the 18 Jun)',
      '(Not 18 Jun)',
      '(13 Jun 2022, not 2022-06-18)',
      '(13 Jun 2022, not 06-18)',
    ],
  },
  {
    check: shortSeptember,
    accepted: ['in September 2025', '8 Sept 2023', '30 Sept 2026'],
    rejected: ['8 Sep 2023', 'Sep 2026'],
  },
];

describe('the education facts (docs/EDUCATION.md §9)', () => {
  it('the facts hold every key EDUCATION §9 lists, each with a source on the allow-list', () => {
    const keys = educationKeys();
    expect(keys).toHaveLength(32);
    expect(keys).not.toContain('e.scams');
    expect(facts.map((fact) => fact.key).sort()).toEqual([...keys].sort());
    expect(validateContent(files, { today: '2026-10-17', allow })).toEqual([]);
  });

  it('keep "under water" to the simulator (§8) and cite no series a licence excludes (ADR-0006)', () => {
    const wrong = facts.filter((fact) => /under water|Coin Metrics/i.test(fact.value));
    expect(wrong.map((fact) => fact.key)).toEqual([]);
  });

  it('date every source no later than the day it was read, and read it no later than the review', () => {
    const late = facts.filter((fact) => fact.date > fact.accessed || fact.accessed > fact.lastReviewed);
    expect(late.map((fact) => fact.key)).toEqual([]);
  });

  it('name the data’s publisher, so "[Source] closes" reads as LEGAL §4 writes it; our computation opens the value', () => {
    expect(facts.filter((fact) => fact.publisher.includes('Proof of Calm')).map((fact) => fact.key)).toEqual([]);
    const computed = facts.filter((fact) => /^[abhiopq]\./.test(fact.key));
    expect(
      computed.filter((fact) => !fact.value.startsWith("Proof of Calm's own computation")).map((fact) => fact.key),
    ).toEqual([]);
  });

  it('write dates in a value as a module quotes them, "6 Oct 2025", never ISO (CONTENT-STYLE §1 and §4)', () => {
    expect(facts.filter((fact) => /\b\d{4}-\d{2}\b/.test(fact.value)).map((fact) => fact.key)).toEqual([]);
  });

  it('no list in sources.allow.json names a domain twice, and PT lists portaldasfinancas.gov.pt', () => {
    const repeating = Object.entries(allow).filter(([, domains]) => new Set(domains).size < domains.length);
    expect(repeating.map(([list]) => list)).toEqual([]);
    expect(allow.PT).toContain('portaldasfinancas.gov.pt');
  });

  it('a value holds no confidence rating or researcher correction', () => {
    expect(
      facts.filter((fact) => rating.test(fact.value) || correction.test(fact.value)).map((fact) => fact.key),
    ).toEqual([]);
  });

  it('the wording checks let through and catch the wordings their table names', () => {
    for (const { check, accepted, rejected } of wordings) {
      expect(accepted.filter((text) => check.test(text))).toEqual([]);
      expect(rejected.filter((text) => !check.test(text))).toEqual([]);
    }
  });

  // docs/LEGAL.md §6 Q4 and EDUCATION §9 row d: fact d names each failure in its own fact, one source each,
  // from the company's or a regulator's own document on the facts list.
  it('d names Mt. Gox and FTX in a fact each, each source on the facts allow-list', () => {
    const failures = facts.filter((fact) => fact.key.startsWith('d.'));
    expect(failures.map((fact) => fact.key)).toEqual(['d.mt-gox', 'd.ftx']);
    const hosts = failures.map((fact) => new URL(fact.source).hostname);
    const allowed = (host: string) => allow.facts.some((domain) => host === domain || host.endsWith(`.${domain}`));
    expect(hosts.filter((host) => !allowed(host))).toEqual([]);
  });

  // EDUCATION §9 row f: one dated leverage figure. ESMA's figure is about CFDs, and the FCA ban reads close to a status word.
  it('f holds one dated leverage figure and names neither ESMA nor the FCA', () => {
    const leverage = facts.find((fact) => fact.key === 'f.leverage');
    expect(leverage?.value).not.toMatch(/ESMA|FCA/u);
    expect(leverage?.value).toContain('10 Oct 2025');
  });

  it("a value writes September as en-GB's Sept (CONTENT-STYLE §4)", () => {
    expect(facts.filter((fact) => shortSeptember.test(fact.value)).map((fact) => fact.key)).toEqual([]);
  });

  it("each fact's value reads the same in its EDUCATION §9 row", () => {
    const values = new Map(facts.map((fact) => [fact.key, fact.value]));
    // A row of one key is its value; row k is its facts' values in order, then the closing sentence.
    const drifted = educationRows().filter(([, keys = '', cell = '']) => {
      const held = rowKeys(keys).map((key) => values.get(key));
      return held.length === 1 ? cell !== held[0] : !cell.startsWith(`${held.join(' ')} `);
    });
    expect(drifted.map(([, keys]) => keys)).toEqual([]);
  });
});
