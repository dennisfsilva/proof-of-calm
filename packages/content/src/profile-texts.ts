// What a country profile shows, as [field, text] pairs, and the checks on that text (docs/JURISDICTIONS.md §2), for
// validate.ts on English and on a translation (ADR-0057). Pure; relative imports name their .ts files, so that Node
// runs the CLI without a build step.
import { hyphenProblems } from './hyphen-validate.ts';
import { bannedProblems, type Problem } from './problem.ts';
import type { CountryProfile } from './schema/jurisdiction.ts';

const SUMMARY_WORDS = 60;
// The one profile text only the tax-year file copies (docs/CONTENT-STYLE.md §4).
export const FILE_ONLY_PROFILE_TEXT = 'lotRuleNote';

// The no-break space between the groups of a figure (`EUR 50 000`, docs/CONTENT-STYLE.md §4), which counts as one word.
const FIGURE_GROUP = /(?<=\d) (?=\d{3}(?!\d))/g;

export function summaryProblems(path: string, summary: string): Problem[] {
  const words = summary.replaceAll(FIGURE_GROUP, '').trim().split(/\s+/).length;
  return words > SUMMARY_WORDS ? [{ path, code: 'summary-too-long', detail: `${words} words` }] : [];
}

/** The ban list on every text a profile shows, and the no-break hyphen on all but the file-only one. */
export const profileTextProblems = (path: string, texts: readonly [string, string][]): Problem[] =>
  texts.flatMap(([field, text]) => [
    ...bannedProblems(path, field, text),
    ...(field === FILE_ONLY_PROFILE_TEXT ? [] : hyphenProblems(path, field, text)),
  ]);

/** Each source title the country card shows, with the language its `lang` names; a pending change's source has no
 * `lang` and the card shows none, so it is left out. A title is a quoted name: its words stay as published, the ban
 * list and the hyphen check stay off it, and only its joins are read (join-validate.ts, #368). */
export const sourceTitles = (profile: CountryProfile): [string, string, string][] =>
  profile.sources.map((source, index): [string, string, string] => [
    `sources.${index}.title`,
    source.title,
    source.lang,
  ]);

/** Every string of a profile that the app shows but its source titles (`sourceTitles`). */
export function profileTexts(profile: CountryProfile): [string, string][] {
  const card = profile.card;
  const list = (prefix: string, texts: readonly string[]) =>
    texts.map((text, index): [string, string] => [`${prefix}.${index}`, text]);
  return [
    ['name', profile.name],
    ['card.classification', card.classification],
    ['card.holdingRuleText', card.holdingRuleText],
    ['card.lotRuleText', card.lotRuleText],
    ['card.losses', card.losses],
    ['card.summary60', card.summary60],
    ['filingNote', profile.filingNote],
    ['lotRuleNote', profile.lotRuleNote],
    ...list('card.allowances', card.allowances),
    ...list('card.reporting', card.reporting),
    ...list('card.caveats', card.caveats),
    ...list('holdingRuleConditions', profile.holdingRuleConditions),
    ...card.taxableEvents.map((event, index): [string, string] => [`card.taxableEvents.${index}.note`, event.note]),
    ...card.rates.flatMap((rate, index): [string, string][] => [
      [`card.rates.${index}.label`, rate.label],
      [`card.rates.${index}.value`, rate.value],
      ...(rate.note === undefined ? [] : [[`card.rates.${index}.note`, rate.note] as [string, string]]),
    ]),
    ...profile.holdingRuleOverrides.map((override, index): [string, string] => [
      `holdingRuleOverrides.${index}.note`,
      override.note,
    ]),
    ...profile.pendingChanges.flatMap((change, index): [string, string][] => [
      [`pendingChanges.${index}.title`, change.title],
      [`pendingChanges.${index}.summary`, change.summary],
    ]),
    ...(profile.status.changeNotice === null
      ? []
      : [['status.changeNotice', profile.status.changeNotice] as [string, string]]),
  ];
}
