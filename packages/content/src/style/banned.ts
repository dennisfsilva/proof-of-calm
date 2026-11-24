// The banned-words lint (docs/CONTENT-STYLE.md §1 and §2, docs/LEGAL.md §6), run over content and UI
// messages: advice-shaped words in English, German and Portuguese, the filler words of the voice rules,
// a percentage next to a return, and an imperative about buying or holding next to an asset name.
// Allow-listed phrases, each with its reason in style/banned.json, are taken out first.
import coins from '../../coins.json' with { type: 'json' };
import banned from '../../style/banned.json' with { type: 'json' };
import { hasGermanDirective, hasGermanFrame, opensWithGermanForm } from './directive-de.ts';
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
// A German one: bei, von or durch, an optional article (der, dem, den, or durch's die and das), a regulator of the
// list, "Finanzaufsicht" or "Aufsichtsbehörde", up to three words ("als Anbieter"), then registriert, eingetragen,
// gemeldet or beaufsichtigt; the participle first; or "Aufsicht der", "des" or "durch die" and a regulator. "Bei
// keiner Finanzaufsichtsbehörde registriert" has no article, so it passes.
const REGULATOR_DE = [
  ...longestFirst(banned.regulators),
  String.raw`finanzaufsicht\p{L}*`,
  String.raw`aufsichtsbehörde\p{L}*`,
];
const BY_REGULATOR_DE = String.raw`(?:(?:bei|von)\s+(?:der\s+|dem\s+|den\s+)?|durch\s+(?:die\s+|den\s+|das\s+)?)(?:${REGULATOR_DE.join('|')})`;
const REGISTRATION_DE = [
  String.raw`${BY_REGULATOR_DE}(?:\s+\p{L}+){0,3}?\s+(?:registriert|eingetragen|gemeldet|beaufsichtigt)\p{L}*`,
  String.raw`(?:registriert|eingetragen|gemeldet)\p{L}*\s+${BY_REGULATOR_DE}`,
  String.raw`aufsicht\s+(?:der|des|durch\s+die)\s+(?:${REGULATOR_DE.join('|')})`,
];
const ADVICE = between([
  ...banned.advice.en,
  ...banned.advice.de,
  ...banned.advice.pt,
  REGISTRATION,
  ...REGISTRATION_DE,
]);
const FILLER = between([...banned.filler.en, ...banned.filler.de, ...banned.filler.pt]);
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
// German (the D1 judge's rule, 2026-11-23): a figure with a sign or "Prozent"; a noun ending in a gain word, an
// optional qualifier ("pro Jahr", "p. a."), join ("beträgt", "liegt bei", "von", a colon) and connector ("bis zu",
// "über", "um die"), then the figure; the figure, up to two adjectives ("jährliche", "garantierte") and the noun; a
// gain verb ("verdienen", "erzielen"), a pronoun and a connector, then the figure; the figure, then that verb,
// "einbringen" or "abwerfen"; "Plus von" and the figure; "wirft" or "bringt", the figure, "ab" or "ein". Any other
// word between them ("werden mit 25 % besteuert") is tax prose.
const END = String.raw`(?![\p{L}\p{N}])`;
const PERCENT_DE = String.raw`[+−-]?\d+(?:[.,]\d+)?\s?(?:%|prozent${END})`;
// Vertrag and Übertrag end in "ertrag" but are no gain words, so the noun is no compound of either.
const NOUN_DE =
  String.raw`\p{L}*(?:rendite(?:n)?|gewinn(?:e|en|es|s)?|(?<!v|üb)ertr(?:ag(?:s|es)?|äge(?:n)?)|zins(?:en|es)?|verzinsung(?:en)?|` +
  `profit(?:e|en|s)?|rentabilität|wertzuw(?:achs(?:es)?|ächse(?:n)?)|wertsteigerung(?:en)?|wertentwicklung(?:en)?|performance)`;
const CONNECTOR_DE = String.raw`(?:bis\s+zu|über|mehr\s+als|rund|etwa|ca\.|circa|ungefähr|durchschnittlich|jährlich|monatlich|um(?:\s+die)?)`;
const JOIN_DE = String.raw`(?:beträgt|betragen|betrug|betrugen|(?:liegt|liegen|lag|lagen)\s+bei|ist|sind|war|waren|wäre|wären|von|in\s+höhe\s+von)`;
const QUALIFIER_DE = String.raw`(?:\s+(?:pro|im|je)\s+(?:jahr|monat)|\s+p\.\s?a\.|\s+im\s+schnitt)?`;
const ADJECTIVE_DE = `(?:(?:jährlich|monatlich|durchschnittlich|erwartet|möglich|potenziell|zusätzlich|garantiert|realistisch)(?:e|en|er|es|em)?|mehr|an)`;
const VERB_DE = String.raw`(?:gewinn(?:e|en|t|st)?|verdien\p{L}*|erziel\p{L}*|erwirtschaft\p{L}*)`;
const GAIN_DE = [
  String.raw`${NOUN_DE}${QUALIFIER_DE}(?:\s*:|\s+${JOIN_DE})?(?:\s+${CONNECTOR_DE})?\s+${PERCENT_DE}`,
  String.raw`${PERCENT_DE}${QUALIFIER_DE}(?:[\s-]+${ADJECTIVE_DE}){0,2}[\s-]*${NOUN_DE}${END}`,
  String.raw`${VERB_DE}(?:\s+(?:sie|du|ihr|wir|man))?(?:\s+${CONNECTOR_DE})?\s+${PERCENT_DE}`,
  String.raw`${PERCENT_DE}${QUALIFIER_DE}(?:\s+(?:jährlich|monatlich))?\s+(?:${VERB_DE}|einbringen|abwerfen)${END}`,
  String.raw`plus\s+von(?:\s+${CONNECTOR_DE})?\s+${PERCENT_DE}`,
  String.raw`(?:wirft|werfen|bringt|bringen)(?:\s+${CONNECTOR_DE})?\s+${PERCENT_DE}${QUALIFIER_DE}\s+(?:ab|ein)${END}`,
];
const RETURN_PERCENTAGE = new RegExp(
  `${PERCENT}\\s*${GAIN}|${GAIN}\\s+(?:of\\s+)?${PERCENT}|(?<![\\p{L}\\p{N}])(?:` +
    `${PERCENT}\\s*(?:de\\s+)?${NOUN_PT}(?![\\p{L}\\p{N}])|` +
    `${TAX_PROSE}${NOUN_PT}${ADJECTIVE_PT}(?:${JOIN_PT})?\\s+${PERCENT}|` +
    `(?:ganhe|ganhar|ganha|ganham)(?:\\s+${CONNECTOR_PT})?\\s+${PERCENT}|` +
    GAIN_DE.join('|') +
    ')',
  'giu',
);
// One asset class for every language (docs/CONTENT-STYLE.md §2, item 3): the general words in any case, with
// their plurals and the Portuguese and German names; the catalogue's names as written, with a plural s; its
// tickers only in capitals, because "link", "sol" and "render" are also ordinary words.
const ASSET_NAME = between(
  [
    String.raw`bitcoin\p{L}*`,
    'ether(?:eum|s)?',
    'solana',
    'chainlink',
    String.raw`crypto\p{L}*`,
    'cripto(?:moedas?|-?ac?tivos?)?',
    String.raw`\p{L}*krypto\p{L}*`,
    String.raw`\p{L}*coins?`,
    'münzen?',
    'tokens?',
    'moedas?',
  ],
  'iu',
);
const NAMES = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${longestFirst(coins.map(({ name }) => name)).join('|')})s?(?![\\p{L}\\p{N}])`,
  'u',
);
const TICKER = between(longestFirst(coins.map(({ id }) => id)), 'u');
// The messages' placeholders the app fills with a coin: {coin} with its ticker, {coins} and {names} with a list of
// coins, and the names each format.units caller in packages/app fills with units and their ticker ("0.5 BTC"). A name
// the app also fills with money, a link or a currency ({fee}, {sold}, {log}, {file}) stays out. An ICU argument on
// them ({coins, select, …}) chooses words and stays copy.
const COIN_PLACEHOLDER = /\{(?:coins?|names|units|held(?:Units)?|sent|excess|short|outside)\}/u;
// An English imperative is the bare verb, so it counts only at the start of a sentence or of an ICU branch; "Buy day"
// is the plan's noun. The Portuguese forms count anywhere (directive-pt.ts), the German ones over a line
// (directive-de.ts).
const IMPERATIVE = /^\s*(buy|sell|hold|invest|get|grab)(?![\p{L}\p{N}])(?!\s+days?\b)/iu;
// A sentence ends at "!", "?", a line end or a dot that no digit follows, so "Buy 0.5 BTC" and "1.000 €" stay whole.
const SENTENCE_END = /[!?\n]+|\.(?!\d)/;
// A template's date placeholder ({date:sellWindow.opens}, template-dates.ts) is one word the person reads as a date,
// so before the cut it stands in as a token with no dot, letter or listed verb: its path neither ends a sentence nor
// names an asset. A finding shows it as written. Every other brace stays as written, so an ICU branch body
// ({count, plural, one {Mantenha} …}) is copy the lint reads, and a non-date path with a ticker in it names that coin.
const DATE_PLACEHOLDER = /\{date:[^{}\s]+\}/gu;
// The token is U+E000, the index, U+E001: private-use characters no copy holds, invisible in most diffs.
const TOKEN = /(\d+)/gu;

/** The text cut at `end`, each piece as the lint reads it and as written. */
function pieces(text: string, end: RegExp) {
  const held: string[] = [];
  const masked = text.replace(DATE_PLACEHOLDER, (whole) => `${held.push(whole) - 1}`);
  return masked.split(end).map((read) => ({
    read,
    written: read.replace(TOKEN, (_, index: string) => held[Number(index)] ?? ''),
  }));
}
const sentences = (text: string) => pieces(text, SENTENCE_END);
// The German rule reads a line: a dot ends nothing, since ordinals and abbreviations cannot be told from an end.
const lines = (text: string) => pieces(text, /\n+/u);
// Soft hyphens and zero-width characters would split a word the reader sees whole.
const INVISIBLE = /[­​-‍⁠]/gu;

// An argument that chooses its words: `{count, plural, …}`, `{formal, select, …}`, `{n, selectordinal, …}`.
const BRANCHING = /^\s*[^\s,{}]+\s*,\s*(?:plural|select|selectordinal)\s*,/u;

/**
 * Where ICU's quoting that starts at `at` ends: `''` is one apostrophe, an apostrophe before `{`, `}`, `#` or `|`
 * quotes up to the next lone apostrophe, and any other apostrophe is itself (ICU's DOUBLE_OPTIONAL mode).
 */
function afterQuote(text: string, at: number): number {
  if (text[at + 1] === "'") return at + 2;
  if (!/[{}#|]/u.test(text[at + 1] ?? '')) return at + 1;
  for (let index = at + 1; index < text.length; index += 1) {
    if (text[index] !== "'") continue;
    if (text[index + 1] !== "'") return index + 1;
    index += 1;
  }
  return text.length;
}

/** The index of the brace that closes the one at `open`, past quoted text; the text's length when none does. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; ) {
    const char = text[index];
    if (char === "'") {
      index = afterQuote(text, index);
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return index;
    index += 1;
  }
  return text.length;
}

/** The text of every plural, select and selectordinal branch of an ICU message, nested ones included, outer first. */
function branchTexts(message: string): readonly string[] {
  const texts: string[] = [];
  const arguments_ = (from: number, to: number): void => {
    for (let index = from; index < to; ) {
      if (message[index] === "'") {
        index = afterQuote(message, index);
        continue;
      }
      if (message[index] !== '{') {
        index += 1;
        continue;
      }
      const end = closing(message, index);
      const head = BRANCHING.exec(message.slice(index + 1, end));
      if (head !== null) branches(index + 1 + head[0].length, end);
      index = end + 1;
    }
  };
  // A selector (`one`, `=0`, `offset:1`, a select key) holds no brace or quote, so the next brace opens its branch.
  const branches = (from: number, to: number): void => {
    for (let open = message.indexOf('{', from); open !== -1 && open < to; open = message.indexOf('{', open)) {
      const end = closing(message, open);
      texts.push(message.slice(open + 1, end));
      arguments_(open + 1, end);
      open = end + 1;
    }
  };
  arguments_(0, message.length);
  return texts;
}

const findAll = (pattern: RegExp, text: string, rule: Finding['rule']): Finding[] =>
  [...text.matchAll(pattern)].map((match) => ({ rule, match: match[0] }));

const namesAsset = (read: string) =>
  ASSET_NAME.test(read) || NAMES.test(read) || TICKER.test(read) || COIN_PLACEHOLDER.test(read);

type Read = {
  /**
   * False where a newline is no line the person reads: a Learn module's body as it stands (modules-validate.ts), whose
   * German lines are its joined read and its page lines.
   */
  readonly germanLines?: boolean;
  /**
   * True for the German line rule alone, on lines its caller sets: a Learn module's page lines
   * (modules-validate.ts).
   */
  readonly germanOnly?: boolean;
};

export function findBanned(text: string, { germanLines = true, germanOnly = false }: Read = {}): Finding[] {
  const kept = text.normalize('NFC').replace(INVISIBLE, '').replace(ALLOWED, ' ');
  const imperatives = sentences(kept)
    .filter(({ read }) => (IMPERATIVE.test(read) || hasPortugueseDirective(read)) && namesAsset(read))
    .map(({ written }): Finding => ({ rule: 'imperative', match: written.trim() }));
  const german = germanLines ? lines(kept) : [];
  const germanImperatives = german
    .filter(({ read }) => hasGermanDirective(read) && namesAsset(read))
    .map(({ written }): Finding => ({ rule: 'imperative', match: written.trim() }));
  const germanFrames = german
    .filter(({ read }) => hasGermanFrame(read))
    .map(({ written }): Finding => ({ rule: 'advice', match: written.trim() }));
  if (germanOnly) return [...germanFrames, ...germanImperatives];
  // A branch's first words open the sentence the person reads, whatever stands before the argument.
  const branchImperatives = branchTexts(kept)
    .map((branch) => sentences(branch)[0])
    .filter((first) => first !== undefined && (IMPERATIVE.test(first.read) || opensWithGermanForm(first.read)))
    .map((first): Finding => ({ rule: 'imperative', match: first?.written.trim() ?? '' }));
  return [
    ...findAll(ADVICE, kept, 'advice'),
    ...findAll(FILLER, kept, 'filler'),
    ...findAll(RETURN_PERCENTAGE, kept, 'return-percentage'),
    ...germanFrames,
    ...imperatives,
    ...germanImperatives,
    ...branchImperatives,
  ];
}
