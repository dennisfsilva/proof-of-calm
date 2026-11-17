import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TAXES_MODULE } from './taxes';

// The public Taxes page's lead names the section where the app-only part ends by its heading, in the
// locale's quotes (“…” in English, «…» in pt-PT): the quoted words must be an h2 of that locale's module.
const content = new URL('../../../../../content/', import.meta.url);
const locales = [
  { locale: 'en', module: `learn/${TAXES_MODULE}.mdx` },
  { locale: 'pt-PT', module: `i18n/pt-PT/learn/${TAXES_MODULE}.mdx` },
];

const read = (path: string) => readFileSync(new URL(path, content), 'utf8');
const lead = (locale: string): string =>
  JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')).module.taxSiteLead;

describe('module.taxSiteLead', () => {
  it.each(locales)('in $locale quotes a heading of its Taxes module', ({ locale, module }) => {
    const quoted = /[“«]([^”»]+)[”»]/u.exec(lead(locale))?.[1];
    const headings = read(module)
      .split('\n')
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3).trim());
    expect(headings).toContain(quoted);
  });
});
