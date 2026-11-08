import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CountryProfileSchema } from './schema/jurisdiction.ts';

// The card's text against the document that owns it. A country's `summary60` row in docs/JURISDICTIONS.md §7.x
// is the document of record for the card text that ships (.claude/rules/docs.md, "One owner per fact"); the
// generic profile `XX` has no §7 section and its card text is quoted in §2 "Generic profile `XX`". No lint
// compares the two (`pnpm lint:docs` resolves paths, commands, ADR numbers and the owned literals), so this
// test does. The package's turbo.json names JURISDICTIONS.md as an input of the test task, so a change to the
// document reruns it instead of replaying a cached pass.
const root = new URL('../', import.meta.url);
const doc = readFileSync(new URL('../../docs/JURISDICTIONS.md', root), 'utf8');

/** The document from a heading on, with every run of whitespace collapsed: the §2 quote wraps across lines. */
function section(heading: string): string {
  const start = doc.indexOf(heading);
  if (start === -1) throw new Error(`docs/JURISDICTIONS.md has no heading "${heading}"`);
  return doc.slice(start).replace(/\s+/g, ' ');
}

const profiles = readdirSync(new URL('jurisdictions/', root))
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    name,
    profile: CountryProfileSchema.parse(JSON.parse(readFileSync(new URL(`jurisdictions/${name}`, root), 'utf8'))),
  }));

describe('docs/JURISDICTIONS.md quotes every card as it ships', () => {
  it("§7.x holds each country profile's card.summary60 verbatim in its summary60 row", () => {
    const countryFacts = section('## 7. Country facts');
    const drifted = profiles
      .filter(({ profile }) => profile.code !== 'XX')
      .filter(({ profile }) => !countryFacts.includes(`| summary60 | "${profile.card.summary60}" |`))
      .map(({ name }) => name);
    expect(drifted).toEqual([]);
  });

  it(`§2 "Generic profile XX" holds xx.json's card.summary60 verbatim`, () => {
    const generic = profiles.find(({ profile }) => profile.code === 'XX');
    if (generic === undefined) throw new Error('no generic profile XX');
    expect(section('### Generic profile `XX`')).toContain(`card: "${generic.profile.card.summary60}"`);
  });
});
