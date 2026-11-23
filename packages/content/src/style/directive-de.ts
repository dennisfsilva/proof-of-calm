// The German half of the imperative rule (docs/CONTENT-STYLE.md §2, German): whether a line holds a buying, selling
// or holding directive, an advice frame, or a branch that opens with a listed form. The caller adds the asset-name
// condition to the directive. Spelling cannot tell the Sie-imperative from the infinitive, the ihr-imperative from
// the participle or the du-imperative from the noun, so the rule reads forms over whole lines, and a capital initial
// counts only where a clause opens.

const W = String.raw`(?<![\p{L}\p{N}])`;
const E = String.raw`(?![\p{L}\p{N}])`;
const between = (alternatives: readonly string[], flags: string) =>
  new RegExp(`${W}(?:${alternatives.join('|')})${E}`, flags);
const unique = (words: readonly string[]) => [...new Set(words)];

type Verb = { readonly infinitive: string; readonly stem: string; readonly extra: readonly string[] };
const verb = (infinitive: string, stem: string, ...extra: string[]): Verb => ({ infinitive, stem, extra });
const past = (stem: string) => [`${stem}test`, `${stem}tet`, `${stem}ten`];

/** The infinitive, the stem, stem+e, stem+st, stem+t (+et after t or d), -le for -eln stems and the listed extras. */
const forms = ({ infinitive, stem, extra }: Verb) => [
  infinitive,
  stem,
  `${stem}e`,
  `${stem}st`,
  /[td]$/u.test(stem) ? `${stem}et` : `${stem}t`,
  ...(stem.endsWith('el') ? [`${stem.slice(0, -2)}le`] : []),
  ...extra,
];

const SIMPLE = [
  verb('kaufen', 'kauf', ...past('kauf')),
  verb('verkaufen', 'verkauf', ...past('verkauf')),
  verb('halten', 'halt', 'hältst', 'hieltest', 'hieltst', 'hieltet', 'hielten'),
  verb('behalten', 'behalt', 'behältst', 'behieltest', 'behieltet', 'behielten'),
  verb('investieren', 'investier', ...past('investier')),
  verb('reinvestieren', 'reinvestier'),
  verb('erwerben', 'erwerb', 'erwirb', 'erwirbst', 'erwarbst', 'erwarbt', 'erwarben'),
  verb('veräußern', 'veräußer', 'veräußre'),
  verb('akkumulieren', 'akkumulier'),
  verb('sparen', 'spar', ...past('spar')),
  verb('besparen', 'bespar'),
  verb('tauschen', 'tausch', ...past('tausch')),
  verb('wechseln', 'wechsel'),
  verb('liquidieren', 'liquidier'),
  verb('diversifizieren', 'diversifizier'),
  verb('realisieren', 'realisier'),
  verb('sichern', 'sicher', 'sichre'),
  verb('verwahren', 'verwahr'),
  verb('wetten', 'wett'),
  verb('spekulieren', 'spekulier'),
  verb('nutzen', 'nutz'),
  verb('streuen', 'streu'),
  verb('stapeln', 'stapel'),
  verb('sammeln', 'sammel'),
  verb('holen', 'hol'),
];
type Separable = readonly [Verb, readonly string[]];
const SEPARABLE: readonly Separable[] = [
  [verb('kaufen', 'kauf'), ['nach', 'zu', 'dazu', 'ein', 'an', 'auf']],
  [verb('legen', 'leg'), ['an', 'nach', 'zu']],
  [verb('sparen', 'spar'), ['an']],
  [verb('stocken', 'stock'), ['auf']],
  [verb('sammeln', 'sammel'), ['an', 'ein']],
  [verb('bauen', 'bau'), ['auf']],
  [verb('schaffen', 'schaff'), ['an']],
  [verb('tauschen', 'tausch'), ['um', 'ein']],
  [verb('wechseln', 'wechsel'), ['um']],
  [verb('schichten', 'schicht'), ['um']],
  [verb('stoßen', 'stoß', 'stößt'), ['ab']],
  [verb('steigen', 'steig'), ['ein', 'aus']],
  [verb('greifen', 'greif'), ['zu']],
  [verb('schlagen', 'schlag', 'schlägst'), ['zu']],
  [verb('nehmen', 'nehm', 'nimm', 'nimmst'), ['mit']],
  [verb('halten', 'halt', 'hältst'), ['fest', 'durch', 'bei']],
  [verb('nutzen', 'nutz'), ['aus']],
  [verb('sichern', 'sicher'), ['ab']],
  [verb('bewahren', 'bewahr'), ['auf']],
  [verb('stellen', 'stell'), ['glatt']],
];
// The light verbs count only in a line with a purchase noun ("Tätigen Sie Ihren nächsten Kauf von BTC").
const LIGHT: readonly Separable[] = [
  [verb('führen', 'führ'), ['durch', 'aus']],
  [verb('nehmen', 'nehm', 'nimm', 'nimmst'), ['vor']],
  [verb('schließen', 'schließ', 'schließt'), ['ab']],
];
const LIGHT_SIMPLE = [verb('tätigen', 'tätig')];
const PURCHASE_NOUN = new RegExp(
  `(?:kauf|käufe|verkauf|verkäufe|investition|anlage|order|transaktion|position)(?:e|en|s|es|n)?${E}`,
  'iu',
);

/** A separable verb's joined forms: particle+form and particle+zu+infinitive (nachkaufen, nachzukaufen). */
const joined = ([base, particles]: Separable) =>
  particles.flatMap((particle) => [...forms(base).map((form) => particle + form), `${particle}zu${base.infinitive}`]);
const longestFirst = (words: readonly string[]) => unique(words).sort((a, b) => b.length - a.length);
const ALL_FORMS = longestFirst([...SIMPLE.flatMap(forms), ...SEPARABLE.flatMap(joined)]);
const INFINITIVES = unique([
  ...SIMPLE.map(({ infinitive }) => infinitive),
  ...SEPARABLE.flatMap(([base, particles]) =>
    particles.flatMap((particle) => [particle + base.infinitive, `${particle}zu${base.infinitive}`]),
  ),
]);
// Infinitives, zu-infinitives, 2nd-singular and past forms count in any case: no noun is spelled so but the
// nominalised infinitive, which the rule refuses beside an asset name too ("das Halten von BTC").
const ANY_CASE = new Set(
  [
    ...INFINITIVES,
    ...SIMPLE.flatMap(({ stem, extra }) => [`${stem}st`, ...extra.filter((form) => /(?:st|en)$/u.test(form))]),
  ].map((form) => form.toLowerCase()),
);

const ADVERBS =
  'jetzt|heute|sofort|gleich|auch|immer|nur|dann|danach|zuerst|erst|also|lieber|besser|bitte|einfach|ruhig|doch|mal|nie|nicht|monatlich|weiter';
const CONJUNCTIONS = 'und|oder|aber|sondern|denn';
/**
 * Where a clause opens, as the text before a word: the line's start; any dot (an ordinal's and an abbreviation's too,
 * since neither can be told from a sentence's end), ! ? : ; , an opening quote or bracket, a bullet, a dash or a
 * spaced hyphen, or a conjunction; with only the listed adverbs between.
 */
export const OPENS = new RegExp(
  String.raw`(?:^|[.!?:;,„“"«»‚‘(\[{•·*–—]|\s-|${W}(?:${CONJUNCTIONS}))\s*(?:(?:${ADVERBS})\s+)*$`,
  'iu',
);
const counts = (line: string, index: number, word: string) =>
  ANY_CASE.has(word.toLowerCase()) ||
  word === word.toLowerCase() ||
  (word.length > 1 && word === word.toUpperCase()) ||
  OPENS.test(line.slice(0, index));

const FORM = between(ALL_FORMS, 'giu');
// A split verb's particle closes the clause: the line ends, a mark follows, or a conjunction does.
const CLOSE = String.raw`\s*(?=$|[.,;:!?)\]}»“"'–—]|\s(?:${CONJUNCTIONS})${E})`;
const split = (entries: readonly Separable[]) =>
  new RegExp(
    entries
      .map(([base, particles]) => `${W}(?:${forms(base).join('|')})${E}.*?${W}(?:${particles.join('|')})${CLOSE}`)
      .join('|'),
    'giu',
  );
const SPLIT = split(SEPARABLE);
const SETZEN_AUF = new RegExp(`${W}(?:setzen|setze|setzt|setz)${E}.*?${W}auf${E}`, 'giu');
const LIGHT_FORM = between(longestFirst([...LIGHT.flatMap(([base]) => forms(base)), ...LIGHT.flatMap(joined)]), 'giu');
const LIGHT_JOINED = between(longestFirst(LIGHT_SIMPLE.flatMap(forms)), 'giu');
const LIGHT_SPLIT = split(LIGHT);

const firstWord = (match: string) => /^\p{L}+/u.exec(match)?.[0] ?? '';
const anyCounts = (line: string, patterns: readonly RegExp[]) =>
  patterns.some((pattern) =>
    [...line.matchAll(pattern)].some((match) => counts(line, match.index, firstWord(match[0]))),
  );

/** Whether a line holds a listed form, a split verb, `setzen … auf`, or a light verb beside a purchase noun. */
export function hasGermanDirective(line: string): boolean {
  if (anyCounts(line, [FORM, SPLIT, SETZEN_AUF])) return true;
  return PURCHASE_NOUN.test(line) && anyCounts(line, [LIGHT_FORM, LIGHT_JOINED, LIGHT_SPLIT]);
}

const MODAL = [
  'muss|musst|müssen|müsst|müsste|müssten|müsstest|müsstet',
  'soll|sollst|sollen|sollt|sollte|sollten|solltest|solltet',
  String.raw`am\s+besten|besser|lieber|sinnvoll|lohnt|lohnen|lohnenswert\p{L}*`,
];
const FRAME = between(MODAL, 'iu');
const INFINITIVE = between(INFINITIVES, 'iu');

/** Whether a line holds a modal or advice frame and a listed infinitive, in either order, with or without an asset. */
export function hasGermanFrame(line: string): boolean {
  return FRAME.test(line) && INFINITIVE.test(line);
}

const OPENING_FORM = new RegExp(`^\\s*(?:(?:${ADVERBS})\\s+)*(?:${ALL_FORMS.join('|')})${E}`, 'iu');

/** Whether an ICU branch's first words are a listed form, in any case, after the adverbs; a `#` first passes. */
export function opensWithGermanForm(text: string): boolean {
  return OPENING_FORM.test(text);
}
