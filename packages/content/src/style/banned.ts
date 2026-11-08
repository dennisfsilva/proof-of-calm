// The banned-words lint (docs/CONTENT-STYLE.md §1 and §2, docs/LEGAL.md §6), run over content and UI
// messages: advice-shaped words in English, German and Portuguese, the filler words of the voice rules,
// a percentage next to a return, and an imperative about buying or holding next to an asset name.
// Allow-listed phrases, each with its reason in style/banned.json, are taken out first.
import banned from '../../style/banned.json' with { type: 'json' };

export type Finding = {
  readonly rule: 'advice' | 'filler' | 'return-percentage' | 'imperative';
  readonly match: string;
};

const between = (alternatives: readonly string[], flags = 'giu') =>
  new RegExp(`(?<![\\p{L}\\p{N}])(${alternatives.join('|')})(?![\\p{L}\\p{N}])`, flags);
const literal = (phrase: string) => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ADVICE = between([...banned.advice.en, ...banned.advice.de, ...banned.advice.pt]);
const FILLER = between(banned.filler);
const ALLOWED = between(
  [...banned.allow].sort((a, b) => b.phrase.length - a.phrase.length).map((entry) => literal(entry.phrase)),
);
const PERCENT = String.raw`\d+(?:[.,]\d+)?\s?%`;
const GAIN = '(?:returns?|gains?|profits?|yields?)';
const RETURN_PERCENTAGE = new RegExp(`${PERCENT}\\s*${GAIN}|${GAIN}\\s+(?:of\\s+)?${PERCENT}`, 'giu');
// Names in any case; the tickers only in capitals, because "link" and "sol" are also ordinary words.
const ASSET_NAME = between(['bitcoin', 'ether(?:eum)?', 'solana', 'chainlink', 'crypto(?:currenc(?:y|ies))?'], 'iu');
const TICKER = between(['BTC', 'ETH', 'SOL', 'LINK'], 'u');
// "Buy day" is the plan's noun, never an imperative.
const IMPERATIVE = /^\s*(buy|sell|hold|invest|get|grab|kaufe?n?|compre|venda)(?![\p{L}\p{N}])(?!\s+days?\b)/iu;

const findAll = (pattern: RegExp, text: string, rule: Finding['rule']): Finding[] =>
  [...text.matchAll(pattern)].map((match) => ({ rule, match: match[0] }));

export function findBanned(text: string): Finding[] {
  const kept = text.replace(ALLOWED, ' ');
  const imperatives = kept
    .split(/[.!?\n]+/)
    .filter((sentence) => IMPERATIVE.test(sentence) && (ASSET_NAME.test(sentence) || TICKER.test(sentence)))
    .map((sentence): Finding => ({ rule: 'imperative', match: sentence.trim() }));
  return [
    ...findAll(ADVICE, kept, 'advice'),
    ...findAll(FILLER, kept, 'filler'),
    ...findAll(RETURN_PERCENTAGE, kept, 'return-percentage'),
    ...imperatives,
  ];
}
