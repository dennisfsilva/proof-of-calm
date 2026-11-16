// What holds for every live profile however a content review changes it (docs/ENGINEERING.md §2, Tests and
// content reviews): a rule rests on a law, an authority or a court, never on a secondary source alone
// (docs/CONTENT-OPS.md §5). The values themselves are the review's to change and the owner's to read.
import { describe, expect, it } from 'vitest';
import { loadProfiles } from '../loaders/countries.ts';
import type { CountryProfile } from '../schema/jurisdiction.ts';

type RuleKey = keyof CountryProfile['ruleSources'];

const profiles = await loadProfiles();

/** The rules whose source is `secondary`, or whose key names no source of the profile. */
function secondaryRules(profile: Pick<CountryProfile, 'sources' | 'ruleSources'>): RuleKey[] {
  return (Object.keys(profile.ruleSources) as RuleKey[]).filter((rule) => {
    const source = profile.sources.find((candidate) => candidate.key === profile.ruleSources[rule]);
    return source === undefined || source.kind === 'secondary';
  });
}

// Germany's two rules on a secondary source, by rule and source key, until the owner settles DE
// (docs/JURISDICTIONS.md §7.7); a review that moves either to a primary source still passes.
const SETTLED_LATER: readonly (readonly [string, RuleKey, string])[] = [
  ['DE', 'lotRule', 'de-forvis-mazars-bmf-2025'],
  ['DE', 'reporting', 'de-cms-bmf-2025'],
];
const settledLater = (profile: CountryProfile, rule: RuleKey) =>
  SETTLED_LATER.some(
    ([code, key, source]) => profile.code === code && rule === key && profile.ruleSources[rule] === source,
  );

describe('secondaryRules', () => {
  const source = (key: string, kind: CountryProfile['sources'][number]['kind']) =>
    ({ key, kind }) as CountryProfile['sources'][number];
  const fixture = (lotKind: CountryProfile['sources'][number]['kind'], lotKey = 'lot') => ({
    sources: [source('law', 'law'), source('lot', lotKind)],
    ruleSources: { holdingRule: 'law', lotRule: lotKey, rates: 'law', losses: 'law', reporting: 'law' },
  });

  it.each(['law', 'authority', 'court'] as const)('answers [] when every rule rests on a source of kind %s', (kind) => {
    expect(secondaryRules(fixture(kind))).toEqual([]);
  });

  it('names a rule whose source is secondary', () => {
    expect(secondaryRules(fixture('secondary'))).toEqual(['lotRule']);
  });

  it('names a rule whose key no source holds', () => {
    expect(secondaryRules(fixture('law', 'no-such-source'))).toEqual(['lotRule']);
  });
});

describe('every live profile (docs/CONTENT-OPS.md §5)', () => {
  it.each(profiles)('$code rests each rule on a law, an authority or a court', (profile) => {
    expect(secondaryRules(profile).filter((rule) => !settledLater(profile, rule))).toEqual([]);
  });
});
