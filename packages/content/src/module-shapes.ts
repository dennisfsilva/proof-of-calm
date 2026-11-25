// The shapes B and E a Learn module's chart section is read against, and the coin spellings they read, for
// module-figures.ts (docs/CONTENT-STYLE.md §4, R5 and R6, §9 and §10).
import { MODULE_PERCENT_JOINERS } from './percent-token.ts';
import type { ContentCoin } from './schema/coin.ts';

export type Coin = Readonly<Pick<ContentCoin, 'id' | 'name'>>;
export const esc = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

// The shapes, as docs/CONTENT-STYLE.md §4, §9 and §10 write them, for English, pt-PT and German; any other
// language's section fails closed. `one` is the word for one fall; C1 is a coin with its article capitalised, which opens pt-PT's E.
export type Shapes = { readonly b: RegExp; readonly e: RegExp; readonly clause: RegExp; readonly one: string };
const N = '(?:100|[1-9][0-9]?)';
const J = `(?:${MODULE_PERCENT_JOINERS.map(esc).join('|')})`;
const F = `${N}${J}%`;
const Y = '[12][0-9]{3}';
const K = '(?<k>[1-9][0-9]?)';
// B's count and its noun, read as the joins read their run (join-validate.ts). A default-ignorable character never
// reaches it: the page drops it and R5 refuses the paragraph first; any other white-space, format or control gap but
// one U+00A0 is reported (R6).
const GAP = '(?<gap>[\\s\\p{Cf}\\p{Cc}]+)';
const B = (C: string) => `(?<c>${C})`;
const clause = (C: string) => new RegExp(`(?<c>${C})(?= )|(?<f>${N})(?=${J}%)`, 'gu');
export function shapesOf(language: string, C: string, C1: string): Shapes | undefined {
  if (language === 'en') {
    const L = `${F}(?: and ${F}|(?:, ${F})+, and ${F})?`;
    return {
      b: new RegExp(
        `^In the chart, ${B(C)} had ${K}${GAP}(?<falls>falls?) of more than (?<n>${N})${J}% between (?<y1>${Y}) and (?<y2>${Y})\\.$`,
        'u',
      ),
      e: new RegExp(`^(?:${C}) fell ${L}(?:(?:, (?:${C}) ${L})*, and (?:${C}) ${L})?\\.$`, 'u'),
      clause: clause(C),
      one: 'fall',
    };
  }
  if (language === 'de') {
    // §10: no article, the verb once, `um` once before each coin's figures, no comma before `und`. A figure joins `%`
    // by either joiner here and module-figures refuses all but U+00A0, so one wrong space is one problem.
    const L = `${F}(?: und ${F}|(?:, ${F})+ und ${F})?`;
    return {
      b: new RegExp(
        `^(?<span>Von (?<y1>${Y}) bis (?<y2>${Y})) hatte ${B(C)} im Diagramm ${K}${GAP}(?<falls>Rückgänge|Rückgang) um (?<more>mehr als (?<n>${N})${J}%)\\.$`,
        'u',
      ),
      e: new RegExp(`^(?:${C}) fiel um ${L}(?:(?:, (?:${C}) um ${L})* und (?:${C}) um ${L})?\\.$`, 'u'),
      clause: clause(C),
      one: 'Rückgang',
    };
  }
  if (language !== 'pt-PT') return undefined;
  // No comma before `e`, in a list of figures or between clauses (§9). B names its threshold and span, as German's
  // does, so R6's details quote pt-PT's own words.
  const L = `${F}(?: e ${F}|(?:, ${F})+ e ${F})?`;
  return {
    b: new RegExp(
      `^No gráfico, ${B(C)} teve ${K}${GAP}(?<falls>quedas?) de (?<more>mais de (?<n>${N})${J}%) (?<span>entre (?<y1>${Y}) e (?<y2>${Y}))\\.$`,
      'u',
    ),
    e: new RegExp(`^(?:${C1}) caiu ${L}(?:(?:, (?:${C}) ${L})* e (?:${C}) ${L})?\\.$`, 'u'),
    clause: clause(`${C1}|${C}`),
    one: 'queda',
  };
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/**
 * Each catalogue coin by the names a shape reads, spelling to id. English: as written, with a lower-case first
 * letter, and Ether for ETH. pt-PT (§9): `a` before either spelling of every coin and `o ether` for ETH, each also
 * with its article capitalised; no other article agrees.
 */
export function spellings(coins: readonly Coin[], language: string): Map<string, string> {
  // German (§10): each coin as the catalogue writes it, no article, no lower-case form, Ethereum for ETH.
  if (language === 'de') return new Map(coins.map(({ id, name }) => [name, id] as const));
  if (language !== 'pt-PT')
    return new Map(
      coins.flatMap(({ id, name }) =>
        [name, lowerFirst(name), ...(id === 'ETH' ? ['Ether', 'ether'] : [])].map(
          (spelling) => [spelling, id] as const,
        ),
      ),
    );
  return new Map(
    coins.flatMap(({ id, name }) =>
      [`a ${name}`, `a ${lowerFirst(name)}`, ...(id === 'ETH' ? ['o ether'] : [])].flatMap((spelling) => [
        [spelling, id] as const,
        [upperFirst(spelling), id] as const,
      ]),
    ),
  );
}
