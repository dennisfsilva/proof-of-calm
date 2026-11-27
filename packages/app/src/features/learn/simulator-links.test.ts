import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLISH } from '@proofofcalm/data';
import { describe, expect, it } from 'vitest';

// The simulator shows the reference closes, so nothing leads to /learn/simulator while the publish switch's
// `display` is off (packages/data/README.md, The publish switch): the route exists and is reached only by its
// address. A link, a navigation call or the absolute path in any product file of packages/app is a finding; the
// route's own `path="/simulator"` is none of these. Once `display` is true, the screen gets its row and this ends.

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PRODUCT = /\.tsx?$/;
const NOT_PRODUCT = /\.(?:test|stories|testing)\.tsx?$|\.d\.ts$/;

const LEADS = [
  /\b(?:href|to)\s*=\s*\{?\s*["'`][^"'`]*\/simulator\b/,
  /\b(?:push|replace|navigate)\(\s*["'`][^"'`]*\/simulator\b/,
  /["'`]~?\/learn\/simulator\b/,
];

const leadsIn = (text: string) => LEADS.some((pattern) => pattern.test(text));

function productFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'fixtures' || entry.name === 'testing' ? [] : productFiles(path);
    return PRODUCT.test(entry.name) && !NOT_PRODUCT.test(entry.name) ? [path] : [];
  });
}

describe('the way to the simulator while PUBLISH.display is false', () => {
  it('finds a link, a navigation call and the absolute path, and not the route', () => {
    expect(leadsIn('<Link href="/simulator">')).toBe(true);
    expect(leadsIn("<Link href={'~/learn/simulator'}>")).toBe(true);
    expect(leadsIn("router.push('/learn/simulator')")).toBe(true);
    expect(leadsIn('const SIMULATOR = `/learn/simulator`;')).toBe(true);
    expect(leadsIn('<Route path="/simulator">')).toBe(false);
  });

  it('nothing in the app links or navigates to /learn/simulator', () => {
    const found = productFiles(SOURCE)
      .filter((file) => leadsIn(readFileSync(file, 'utf8')))
      .map((file) => relative(SOURCE, file).replaceAll('\\', '/'));
    expect(productFiles(SOURCE).length).toBeGreaterThan(100);
    expect(PUBLISH.display ? [] : found).toEqual([]);
  });
});
