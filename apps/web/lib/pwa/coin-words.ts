import { COINS } from '@proofofcalm/content';

// The coin-name count of the manifest's screenshots (e2e/manifest-capture.spec.ts; docs/DESIGN.md §9). The page side
// hands back each string a person or assistive technology reads on its own, so the whole-word guards never see two
// neighbouring elements' text run together ("0.0012" and "BTC" as "0.0012BTC"); the Node side matches each string.

/** Every ticker and name of the catalogue, as whole words: a lowercase "near" or "render" is English, not a coin. */
const words = [...new Set(COINS.flatMap((coin) => [coin.id, coin.name]))];
const COIN_WORDS = new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join('|')})(?![\\p{L}\\p{N}])`, 'gu');

/**
 * Runs in the page (Playwright serialises it, so it reads nothing outside itself): every text node outside scripts
 * and styles, each element's alt, aria-label and title, every input's and textarea's value and placeholder, and the
 * whole text once more, so a name split across inline elements ("Bit<b>coin</b>") is still read.
 */
export function readableStrings(root: HTMLElement): string[] {
  const strings: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement?.closest('script, style') == null) strings.push(node.textContent ?? '');
  }
  for (const element of root.querySelectorAll('[alt], [aria-label], [title]')) {
    for (const name of ['alt', 'aria-label', 'title']) strings.push(element.getAttribute(name) ?? '');
  }
  for (const field of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
    strings.push(field.value, field.placeholder);
  }
  const whole = root.cloneNode(true) as HTMLElement;
  for (const element of whole.querySelectorAll('script, style')) element.remove();
  strings.push(whole.textContent ?? '');
  return strings;
}

/** The catalogue's names and tickers the strings hold, each once, in the order first read. */
export const coinWords = (strings: readonly string[]) => [
  ...new Set(strings.flatMap((text) => text.match(COIN_WORDS) ?? [])),
];
