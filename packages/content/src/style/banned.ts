// The banned-words lint (docs/CONTENT-STYLE.md §1 and §2, docs/LEGAL.md §6), run over content and UI
// messages: advice-shaped words in English, German and Portuguese, the filler words of the voice rules,
// a percentage next to a return, and an imperative about buying or holding next to an asset name.
// Allow-listed phrases, each with its reason in style/banned.json, are taken out first.
import banned from '../../style/banned.json' with { type: 'json' };
import { hasPortugueseDirective } from './directive-pt.ts';

export type Finding = {
  readonly rule: 'advice' | 'filler' | 'return-percentage' | 'imperative';
  readonly match: string;
};

const between = (alternatives: readonly string[], flags = 'giu') =>
  new RegExp(`(?<![\\p{L}\\p{N}])(${alternatives.join('|')})(?![\\p{L}\\p{N}])`, flags);
const literal = (phrase: string) => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const longestFirst = (phrases: readonly string[]) => [...phrases].sort((a, b) => b.length - a.length).map(literal);
// A Portuguese registration claim: registado, registrado, inscrito or supervisionado, a preposition, then a
// regulator of the list by its initials or its full name, or "regulador" itself.
const REGISTRATION =
  String.raw`(?:regist(?:r)?ad|inscrit|supervisionad)(?:o|a|os|as)\s+` +
  String.raw`(?:n[oa]s?|pel[oa]s?|por|junto\s+d[oa]s?|perante\s+[oa]s?|com\s+[oa]s?)\s+` +
  `(?:${[...longestFirst(banned.regulators), 'regulador(?:es)?'].join('|')})`;
const ADVICE = between([...banned.advice.en, ...banned.advice.de, ...banned.advice.pt, REGISTRATION]);
const FILLER = between([...banned.filler.en, ...banned.filler.pt]);
const ALLOWED = between(longestFirst(banned.allow.map((entry) => entry.phrase)));
// A gain word right next to a percentage, in either order: English joins them with "of"; Portuguese puts up to
// two adjectives after the noun ("rendimento médio anual de 8 %") and joins it to the figure with "de", "é de",
// "cerca de", "até", "mais de", "superior a" or "acima de"; a gain verb takes the same connectors ("ganhe até
// 8 %"). Any other word between them ("são tributadas à taxa especial de", "das"), or a gain word after
// "sobre" (with or without an article), "das" or "dos", is tax prose, not a promise (docs/CONTENT-STYLE.md §2).
const PERCENT = String.raw`\d+(?:[.,]\d+)?\s?%`;
const GAIN = '(?:returns?|gains?|profits?|yields?)';
const NOUN_PT = '(?:retornos?|ganhos?|lucros?|rendimentos?|rentabilidades?|rendibilidades?|mais[- ]valias?)';
const TAX_PROSE = String.raw`(?<!(?<![\p{L}\p{N}])(?:sobre(?:\s+(?:as?|os?))?|das|dos)\s+)`;
const ADJECTIVE_PT = String.raw`(?:\s+(?:anua(?:l|is)|mensa(?:l|is)|médi[oa]s?|tota(?:l|is)|potencia(?:l|is)|esperad[oa]s?)){0,2}`;
const CONNECTOR_PT = String.raw`(?:cerca\s+de|até|mais\s+de|superior\s+a|acima\s+de)`;
const JOIN_PT = String.raw`\s+(?:(?:é|são)\s+)?(?:de(?:\s+${CONNECTOR_PT})?|${CONNECTOR_PT})`;
const RETURN_PERCENTAGE = new RegExp(
  `${PERCENT}\\s*${GAIN}|${GAIN}\\s+(?:of\\s+)?${PERCENT}|(?<![\\p{L}\\p{N}])(?:` +
    `${PERCENT}\\s*(?:de\\s+)?${NOUN_PT}(?![\\p{L}\\p{N}])|` +
    `${TAX_PROSE}${NOUN_PT}${ADJECTIVE_PT}(?:${JOIN_PT})?\\s+${PERCENT}|` +
    `(?:ganhe|ganhar|ganha|ganham)(?:\\s+${CONNECTOR_PT})?\\s+${PERCENT})`,
  'giu',
);
// Names in any case, with their plurals and the Portuguese names; the tickers only in capitals, because "link"
// and "sol" are also ordinary words.
const ASSET_NAME = between(
  [
    'bitcoins?',
    'ether(?:eum|s)?',
    'solana',
    'chainlink',
    'crypto(?:currenc(?:y|ies))?',
    'cripto(?:moedas?|-?ac?tivos?)?',
  ],
  'iu',
);
const TICKER = between(['BTC', 'ETH', 'SOL', 'LINK'], 'u');
// The messages' placeholders the app fills with a coin: {coin} with its ticker, {coins} and {names} with a list of
// coins. An ICU argument on them ({coins, select, …}) chooses words and stays copy.
const COIN_PLACEHOLDER = /\{(?:coins?|names)\}/u;
// An English or German imperative is the bare verb, so it counts only at the start of a sentence; "Buy day" is
// the plan's noun. The Portuguese forms count anywhere (directive-pt.ts).
const IMPERATIVE = /^\s*(buy|sell|hold|invest|get|grab|kaufe?n?)(?![\p{L}\p{N}])(?!\s+days?\b)/iu;
// A sentence ends at "!", "?", a line end or a dot that no digit follows, so "Buy 0.5 BTC" and "1.000 €" stay whole.
const SENTENCE_END = /[!?\n]+|\.(?!\d)/;
// A template's date placeholder ({date:sellWindow.opens}, template-dates.ts) is one word the person reads as a date,
// so before the cut it stands in as a token with no dot, letter or listed verb: its path neither ends a sentence nor
// names an asset. A finding shows it as written. Every other brace stays as written, so an ICU branch body
// ({count, plural, one {Mantenha} …}) is copy the lint reads, and a non-date path with a ticker in it names that coin.
const DATE_PLACEHOLDER = /\{date:[^{}\s]+\}/gu;
// The token is U+E000, the index, U+E001: private-use characters no copy holds, invisible in most diffs.
const TOKEN = /(\d+)/gu;

/** The text's sentences, each as the lint reads it and as written. */
function sentences(text: string) {
  const held: string[] = [];
  const masked = text.replace(DATE_PLACEHOLDER, (whole) => `${held.push(whole) - 1}`);
  return masked.split(SENTENCE_END).map((read) => ({
    read,
    written: read.replace(TOKEN, (_, index: string) => held[Number(index)] ?? ''),
  }));
}

const findAll = (pattern: RegExp, text: string, rule: Finding['rule']): Finding[] =>
  [...text.matchAll(pattern)].map((match) => ({ rule, match: match[0] }));

const namesAsset = (read: string) => ASSET_NAME.test(read) || TICKER.test(read) || COIN_PLACEHOLDER.test(read);

export function findBanned(text: string): Finding[] {
  const kept = text.replace(ALLOWED, ' ').normalize('NFC');
  const imperatives = sentences(kept)
    .filter(({ read }) => (IMPERATIVE.test(read) || hasPortugueseDirective(read)) && namesAsset(read))
    .map(({ written }): Finding => ({ rule: 'imperative', match: written.trim() }));
  return [
    ...findAll(ADVICE, kept, 'advice'),
    ...findAll(FILLER, kept, 'filler'),
    ...findAll(RETURN_PERCENTAGE, kept, 'return-percentage'),
    ...imperatives,
  ];
}
