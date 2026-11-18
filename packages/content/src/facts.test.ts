import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import allowList from '../sources.allow.json' with { type: 'json' };
import { FactSchema } from './schema/fact.ts';
import { type ContentFile, readAfterReview, validateContent } from './validate.ts';

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

// A fact whose value a merged review changed, before the log PR updates its EDUCATION §9 row (docs/CONTENT-OPS.md §8
// steps 4 and 5). The owner's session PR adds the entry to main before the flip, with the fact's old and new value as
// read in the review's diff. The agent's branch cannot change this file (CI's guard), so a later push that moves the
// value fails the tie. An entry whose review closed unmerged looks like one still open: main holds `was` in both. No
// test finds it, so the owner removes it (§8 step 4).
const unlogged: ReadonlyMap<string, { was: string; now: string }> = new Map([]);

/** The first cells of the rows that do not read their facts' values; a value at its entry's `now` reads as `was`. */
function driftedRows(
  rows: readonly string[][],
  values: ReadonlyMap<string, string>,
  pending: typeof unlogged,
): string[] {
  const held = (key: string) => {
    const value = values.get(key);
    const entry = pending.get(key);
    return entry !== undefined && value === entry.now ? entry.was : value;
  };
  // A row of one key is its value; row k is its facts' values in order, then the closing sentence.
  return rows
    .filter(([, keys = '', cell = '']) => {
      const read = rowKeys(keys).map(held);
      return read.length === 1 ? cell !== read[0] : !cell.startsWith(`${read.join(' ')} `);
    })
    .map(([, keys = '']) => keys);
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
    const late = facts.filter((fact) => fact.date > fact.accessed || readAfterReview(fact.accessed, fact));
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

  // EDUCATION §9 row f: its leverage figure dated by the day. ESMA's figure is about CFDs, and the FCA ban reads close
  // to a status word.
  it('f dates its leverage figure by the day and names neither ESMA nor the FCA', () => {
    const leverage = facts.find((fact) => fact.key === 'f.leverage');
    expect(leverage?.value).not.toMatch(/ESMA|FCA/u);
    // Main pinned the day, 10 Oct 2025; a review may date the figure by another day, so the relation holds a dollar
    // figure dated by its day.
    expect(leverage?.value).toMatch(/\bon \d{1,2} [A-Z][a-z]{2,3} \d{4}, [^.]*\$\d/u);
  });

  it("a value writes September as en-GB's Sept (CONTENT-STYLE §4)", () => {
    expect(facts.filter((fact) => shortSeptember.test(fact.value)).map((fact) => fact.key)).toEqual([]);
  });

  // EDUCATION §9 states every fact's figures and no other check reads it, so each row stays tied to its facts' values.
  // A review cannot change the row: CI's guard refuses docs on its branch. A changed value passes only through its
  // `unlogged` entry, until the log PR updates the row and removes the entry.
  it("each fact's value reads the same in its EDUCATION §9 row", () => {
    const values = new Map(facts.map((fact) => [fact.key, fact.value]));
    expect(driftedRows(educationRows(), values, unlogged)).toEqual([]);
  });

  it('the unlogged list names only keys of the facts files and of EDUCATION §9', () => {
    const keys = new Set(facts.map((fact) => fact.key));
    const rows = new Set(educationKeys());
    expect([...unlogged.keys()].filter((key) => !keys.has(key) || !rows.has(key))).toEqual([]);
  });
});

// Literal rows and values, never the live files: a review may change any of those.
describe('the EDUCATION §9 tie with a pending fact (docs/CONTENT-OPS.md §8 steps 4 and 5)', () => {
  const rows = [['', '`x.one`', 'Old value.', '']];
  const pending = new Map([['x.one', { was: 'Old value.', now: 'New value.' }]]);
  const none: typeof unlogged = new Map();
  const at = (value: string) => new Map([['x.one', value]]);

  it('a value that reads its row passes', () => {
    expect(driftedRows(rows, at('Old value.'), none)).toEqual([]);
  });

  it('a changed value with no entry drifts', () => {
    expect(driftedRows(rows, at('New value.'), none)).toEqual(['`x.one`']);
  });

  it("a value at its entry's now passes with the row at was (the merged review)", () => {
    expect(driftedRows(rows, at('New value.'), pending)).toEqual([]);
  });

  it("a value past its entry's now drifts, longer or shorter", () => {
    expect(driftedRows(rows, at('New value. Later.'), pending)).toEqual(['`x.one`']);
    expect(driftedRows(rows, at('New value'), pending)).toEqual(['`x.one`']);
  });

  it('the old value with the entry present passes (main before the merge)', () => {
    expect(driftedRows(rows, at('Old value.'), pending)).toEqual([]);
  });

  const logged = [['', '`x.one`', 'New value.', '']];

  it("the log PR's updated row drifts while the entry stays, so the log PR removes it", () => {
    expect(driftedRows(logged, at('New value.'), pending)).toEqual(['`x.one`']);
  });

  it('the updated row passes once the entry is removed', () => {
    expect(driftedRows(logged, at('New value.'), none)).toEqual([]);
  });

  it('row k passes with one pending key among six, and drifts at a wrong now', () => {
    const keys = ['k.a', 'k.b', 'k.c', 'k.d', 'k.e', 'k.f'];
    const row = [['', keys.map((key) => `\`${key}\``).join(', '), 'A. B. C. D. E. F. Closing.', '']];
    const values = new Map(keys.map((key) => [key, `${key.slice(2).toUpperCase()}.`]));
    values.set('k.c', 'C2.');
    expect(driftedRows(row, values, new Map([['k.c', { was: 'C.', now: 'C2.' }]]))).toEqual([]);
    expect(driftedRows(row, values, new Map([['k.c', { was: 'C.', now: 'C3.' }]]))).toEqual([row[0]?.[1]]);
  });
});
