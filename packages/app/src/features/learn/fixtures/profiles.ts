import { type CountryProfile, loadProfile } from '@proofofcalm/content';

// The profiles the country card's tests and stories read: the three shipped files, and four shapes derived from
// Portugal's that the next countries take (a country with no holding rule, a lower rate after the holding
// period, a portfolio-wide and a wealth-snapshot computation). The card reads the same fields for each, so a
// new shape needs a profile file, not code.

const load = async (code: string) => {
  const profile = await loadProfile(code);
  if (profile === null) throw new Error(`no profile ${code}`);
  return profile;
};

export const PORTUGAL = await load('PT');
export const GERMANY = await load('DE');
export const GENERIC = await load('XX');

const shape = (name: string, change: Partial<CountryProfile>): CountryProfile => ({
  ...PORTUGAL,
  name: `${PORTUGAL.name} (${name})`,
  ...change,
});

export const SHAPES = {
  none: shape('no holding rule', { holdingRule: { kind: 'none' }, holdingRuleConditions: [] }),
  'lower-rate': shape('lower rate after a year', { holdingRule: { kind: 'years', years: 1, effect: 'lower-rate' } }),
  'portfolio-wide': shape('portfolio-wide', { computationModel: { kind: 'portfolio-wide' } }),
  'wealth-snapshot': shape('wealth snapshot', {
    computationModel: { kind: 'wealth-snapshot', date: '01-01' },
    card: { ...PORTUGAL.card, allowances: [] },
  }),
} satisfies Record<string, CountryProfile>;
