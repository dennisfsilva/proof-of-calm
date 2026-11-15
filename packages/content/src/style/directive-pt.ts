// The Portuguese half of the imperative rule (docs/CONTENT-STYLE.md §2, Portuguese): whether a sentence holds a
// buying, selling or holding directive. The caller adds the asset-name condition. Unlike English and German, the
// formal imperative, the subjunctive and the infinitive are their own forms, so they count anywhere in the
// sentence: a frame before them ("É melhor que", "Convém", "desde que") is an open class no list can hold.

const W = String.raw`(?<![\p{L}\p{N}])`;
const E = String.raw`(?![\p{L}\p{N}])`;
const AR = '(?:compr|guard|acumul|refor[cç]|apost|aproveit|segur)';
const ER = '(?:vend|mantenh|detenh|invist|adquir)';

// The formal imperative or present subjunctive (compre, comprem, compremos; venda, mantenha, invista, adquira), the
// infinitive bare or with -lo, -la, -los or -las, the imperfect subjunctive (comprasse, vendesse, mantivesse),
// "continue a" before a buying verb, and four verbs that act on a holding (troque, converta, liquide, diversifique).
const FORMS = new RegExp(
  `${W}(?:` +
    [
      `${AR}e(?:m|mos)?`,
      `${ER}a(?:m|mos)?`,
      `${AR}ar`,
      '(?:vend|mant|det)er',
      '(?:invest|adquir)ir',
      `(?:${AR}á|(?:vend|mant|det)ê|(?:invest|adquir)i)-l[oa]s?`,
      `${AR}(?:asse|assem|ássemos)`,
      'vend(?:esse|essem|êssemos)',
      '(?:mant|det)iv(?:esse|essem|éssemos)',
      '(?:invest|adquir)(?:isse|issem|íssemos)',
      'continu(?:e|em|ar) a (?:comprar|investir|acumular)',
      'troqu(?:e|em|emos)',
      'convert(?:a|am|amos)',
      'liquid(?:e|em|emos)',
      'diversifiqu(?:e|em|emos)',
    ].join('|') +
    `)${E}`,
  'giu',
);

// Where a clause opens: the sentence start, a colon, semicolon, bracket, quote, dash or bullet. The comma counts for
// the informal imperative and not for the noun "venda", so "é melhor que, numa queda, a venda" stays refused.
const OPEN_MARKS = String.raw`[:;(\[{«“"‘—–•·]|(?:^|\s)[-*](?=\s)`;
const OPEN = `(?:^|,|${OPEN_MARKS})`;
const OPEN_NO_COMMA = `(?:^|${OPEN_MARKS})`;

// "Venda" is the noun after a determiner or a preposition, or after an "a" that opens the sentence or a clause or
// follows a preposition ("após a venda"). Nowhere else: a pronoun never stands before a verb in those places.
const DETERMINERS = [
  ...'uma duma numa da na pela à de em por sem com após para cada qualquer nenhuma alguma outra esta'.split(' '),
  ...'essa aquela desta dessa daquela nesta nessa naquela sua nossa primeira segunda última próxima nova única mesma eventual toda'.split(
    ' ',
  ),
  String.raw`compras?\s+e`,
].join('|');
const PREPOSITIONS = 'após|até|para|sobre|com|sem|entre|contra|desde|perante|segundo|mediante|e|ou';
const NOUN_BEFORE = new RegExp(
  String.raw`(?:${W}(?:${DETERMINERS})|(?:${OPEN_NO_COMMA}\s*|${W}(?:${PREPOSITIONS})\s+)a)\s+$`,
  'iu',
);

// The informal imperative where a clause opens, after the adverbs that can stand before it ("Agora compra BTC").
const INFORMAL = new RegExp(
  String.raw`${OPEN}\s*(?:(?:já|agora|hoje|também|sempre|só|apenas|então|depois|primeiro)\s+)*${W}` +
    `(?:compra|vende|mant[ée]m|det[ée]m|guarda|investe|acumula|refor[çc]a|adquire|aposta|aproveita)${E}`,
  'iu',
);
// The informal negative imperative, or the second person after "que" ("não vendas", "que compres").
const INFORMAL_NEGATIVE = new RegExp(
  String.raw`${W}(?:não|nunca|jamais|nem|que)\s+(?:(?:o|a|os|as|lhe|lhes|me|te|nos|vos)\s+)?(?:${AR}es|${ER}as)${E}`,
  'iu',
);
// A light verb up to three words before a purchase or sale noun ("Faça já a sua compra de BTC").
const LIGHT_VERB = new RegExp(
  `${W}(?:fa[çc]am?|(?:efetu|realiz|concretiz|execut|antecip|adi)em?|proced(?:a|am)|dê|deem)` +
    String.raw`(?:\s+\p{L}+){0,3}\s+(?:compras?|vendas?|investimentos?|reforços?|aquisiç(?:ão|ões))${E}`,
  'iu',
);

export function hasPortugueseDirective(sentence: string): boolean {
  for (const match of sentence.matchAll(FORMS)) {
    const noun = match[0].toLowerCase() === 'venda' && NOUN_BEFORE.test(sentence.slice(0, match.index));
    if (!noun) return true;
  }
  return INFORMAL.test(sentence) || INFORMAL_NEGATIVE.test(sentence) || LIGHT_VERB.test(sentence);
}
