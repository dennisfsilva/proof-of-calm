// No text the tax-year file's header copies from a profile holds a `;`, the list separator a comma-decimal
// spreadsheet splits a cell on (docs/DOMAIN.md §3.13), for validate.ts on English and on a translation (ADR-0057).
// `headerTexts` follows `cessionsHeader`, `snapshotHeader` and `perLotFile` in
// packages/app/src/features/settings/tax-year.ts, whose test imports it, so the two cannot drift. Pure; relative
// imports name their .ts files, so that Node runs the CLI without a build step.
import type { Problem } from './problem.ts';
import type { CountryProfile } from './schema/jurisdiction.ts';

const SPLITS = 'a comma-decimal spreadsheet splits the header cell there (docs/DOMAIN.md §3.13)';
const AROUND = 12;

/**
 * Every profile text a header line copies, as [field, text]: the name (the title and review lines), the lot-rule
 * note, each holding-rule condition, and the URL of the source each of the lot and holding rules names (the review
 * line). Each rule's source once, as the review line lists it.
 */
export const headerTexts = (profile: CountryProfile): [string, string][] => {
  const ruleSource = (rule: 'lotRule' | 'holdingRule'): [string, string][] => {
    const index = profile.sources.findIndex((source) => source.key === profile.ruleSources[rule]);
    const source = profile.sources[index];
    return source === undefined ? [] : [[`sources.${index}.url`, source.url]];
  };
  const texts: [string, string][] = [
    ['name', profile.name],
    ['lotRuleNote', profile.lotRuleNote],
    ...profile.holdingRuleConditions.map((text, index): [string, string] => [`holdingRuleConditions.${index}`, text]),
    ...ruleSource('lotRule'),
    ...ruleSource('holdingRule'),
  ];
  return [...new Map(texts)];
};

/** One `header-semicolon` problem per text that holds a `;`, with its field and the text around the first one. */
export const semicolonProblems = (path: string, texts: readonly [string, string][]): Problem[] =>
  texts.flatMap(([field, text]) => {
    const at = text.indexOf(';');
    if (at < 0) return [];
    const excerpt = text.slice(Math.max(0, at - AROUND), at + AROUND + 1);
    return [{ path, code: 'header-semicolon', detail: `${field}: ${JSON.stringify(excerpt)}, ${SPLITS}` }];
  });

/** The `;` check on every text of `profile` that a tax-year header line copies. */
export const headerTextProblems = (path: string, profile: CountryProfile): Problem[] =>
  semicolonProblems(path, headerTexts(profile));
