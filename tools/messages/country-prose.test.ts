import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The prose that names a country without the app's forms (D3's verdict §8): the content overlays under
// packages/content/i18n/<locale> (JSON and MDX) and the site's messages in apps/web/messages/<locale>.json. A name
// that takes an article after a preposition (pt-PT `na Alemanha`, German `in den Niederlanden`) never follows the
// bare preposition, German never writes `Vereinigtes` after an article, and no German preposition with an article
// fused in (`im`, `vom`, `zum`, `beim`, `ins`) stands before such a name (docs/CONTENT-STYLE.md §9, §10). The
// names come from the app's forms files: a name whose `with` form is not the preposition and the bare name.

const root = fileURLToPath(new URL('../..', import.meta.url));

/** The prepositions each language writes directly before a country's name. */
const PREPOSITIONS = {
  'pt-PT': ['em', 'de', 'para', 'com', 'por', 'segundo', 'sobre'],
  de: ['in', 'für', 'mit', 'von', 'aus', 'auf', 'nach', 'bei', 'zu'],
} as const;
/** German's prepositions with a singular article fused in (`im` is `in dem`). */
const FUSED = ['im', 'vom', 'zum', 'beim', 'ins'] as const;
type Locale = keyof typeof PREPOSITIONS;
const LOCALES = Object.keys(PREPOSITIONS) as Locale[];

type Forms = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** The names of `forms` that take an article after a preposition; the general profile has no country name. */
function articleNames(forms: Forms): string[] {
  return Object.entries(forms)
    .filter(([code]) => code !== 'XX')
    .filter(([, form]) => form.with !== `${form.with?.split(' ')[0]} ${form.name}`)
    .map(([, form]) => form.name ?? '');
}

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
/** A word whose first letter may start a sentence: `[iI]m`; the rest keeps its case. */
const capitalisable = (word: string) => `[${word[0]}${word[0]?.toUpperCase()}]${literal(word.slice(1))}`;
/** A list of words whose first letter is case-free. */
const words = (list: readonly string[]) => list.map(capitalisable).join('|');

/**
 * The case endings each German name takes before the letter boundary, so a writer who drops the article still meets
 * the check with the inflected name (`in Niederlanden`, `im Niederlanden`; right: `in den Niederlanden`): the dative
 * plural `-n` of Niederlande, the genitive `-s` or `-es` of Königreich, none for the abbreviation USA. A name the
 * forms files add fails the first test until it has its row here. pt-PT has no such table: its names (Alemanha, Reino
 * Unido, Irlanda, Países Baixos, Estados Unidos) take no case ending, so they end at the boundary as written.
 */
const ENDINGS: Readonly<Record<string, string>> = {
  'Vereinigtes Königreich': '(?:e?s)?',
  Niederlande: 'n?',
  USA: '',
};

/** A German name with its case endings; the fused pattern reads only the first word of a longer name. */
const inflected = (name: string) => `${literal(name)}${ENDINGS[name] ?? ''}`;

/**
 * Each wrong form in `text`, as it reads there. The names keep their own case and end at a letter boundary after
 * their case endings, so `in Usage` and `beim USAmerikaner` are not `in USA` and `beim USA`; only a preposition's or
 * article's first letter is case-free (`Im Vereinigtes`).
 */
function findings(text: string, locale: Locale, names: readonly string[]): string[] {
  const name = locale === 'de' ? inflected : literal;
  const bare = new RegExp(
    `(?<!\\p{L})(?:${words(PREPOSITIONS[locale])})\\s+(?:${names.map(name).join('|')})(?!\\p{L})`,
    'gu',
  );
  const found = [...text.matchAll(bare)].map(([match]) => match);
  if (locale === 'de') {
    // `Vereinigtes` takes no ending here: its inflected forms (`Vereinigten`, `Vereinigtem`) are other words, and
    // `des Vereinigten Königreichs` is right.
    const article = new RegExp(`(?<!\\p{L})(?:${words(['das', 'dem', 'des', 'die'])})\\s+Vereinigtes(?!\\p{L})`, 'gu');
    found.push(...[...text.matchAll(article)].map(([match]) => match));
    // A singular article fused into the preposition fits none of these names: `Vereinigtes` wants the dative's
    // `Vereinigten` after it, and the plural names take `den`. A one-word name keeps its endings (`im Niederlanden`);
    // the first word of a longer one takes none, as above. A hyphen joins the name to a noun (`zum USA-Profil`),
    // U+002D or the no-break hyphen U+2011 (§10 keeps it for numeral compounds); the en dash U+2013 does not, since
    // right after a name it is a range or a Gedankenstrich, so `zum USA–Profil` stays refused.
    const first = (each: string) => (each.includes(' ') ? literal(each.split(' ')[0] ?? '') : inflected(each));
    const fused = new RegExp(
      `(?<!\\p{L})(?:${words(FUSED)})\\s+(?:${names.map(first).join('|')})(?![\\p{L}\\u002D\\u2011])`,
      'gu',
    );
    found.push(...[...text.matchAll(fused)].map(([match]) => match));
  }
  return found;
}

type Tree = string | number | boolean | null | readonly Tree[] | { readonly [key: string]: Tree };
const strings = (node: Tree): string[] =>
  typeof node === 'string'
    ? [node]
    : node !== null && typeof node === 'object'
      ? Object.values(node).flatMap(strings)
      : [];

/** The prose of one file: a JSON file's strings, or an MDX file as written. */
const prose = (path: string) => {
  const text = readFileSync(path, 'utf8');
  return path.endsWith('.json') ? strings(JSON.parse(text) as Tree).join('\n') : text;
};

/** The files a locale's prose lives in, relative to the root; a locale without a folder or file has none yet. */
function files(locale: Locale): string[] {
  const overlays = join(root, 'packages/content/i18n', locale);
  const content = existsSync(overlays)
    ? readdirSync(overlays, { recursive: true, encoding: 'utf8' })
        .filter((name) => /\.(?:json|mdx)$/u.test(name))
        .map((name) => join('packages/content/i18n', locale, name))
    : [];
  const site = join('apps/web/messages', `${locale}.json`);
  return existsSync(join(root, site)) ? [...content, site] : content;
}

const forms = (locale: Locale): Forms =>
  JSON.parse(readFileSync(join(root, 'packages/app/src/lib/countries/messages', `${locale}.json`), 'utf8')) as Forms;

describe('the country names in prose', () => {
  it('take the article from the forms files', () => {
    expect(articleNames(forms('pt-PT'))).toEqual([
      'Alemanha',
      'Reino Unido',
      'Irlanda',
      'Países Baixos',
      'Estados Unidos',
    ]);
    expect(articleNames(forms('de'))).toEqual(['Vereinigtes Königreich', 'Niederlande', 'USA']);
    expect(Object.keys(ENDINGS)).toEqual(articleNames(forms('de')));
  });

  it('catch a bare preposition before such a name, and German Vereinigtes after an article', () => {
    const pt = articleNames(forms('pt-PT'));
    expect(findings('Fontes de Alemanha; em Reino Unido e para Estados Unidos.', 'pt-PT', pt)).toEqual([
      'de Alemanha',
      'em Reino Unido',
      'para Estados Unidos',
    ]);
    expect(findings('Fontes da Alemanha, de Espanha, de Portugal, nos Estados Unidos; Alemanha.', 'pt-PT', pt)).toEqual(
      [],
    );
    const de = articleNames(forms('de'));
    expect(findings('Steuern in USA, für Niederlande, das Vereinigtes Königreich.', 'de', de)).toEqual([
      'in USA',
      'für Niederlande',
      'das Vereinigtes',
    ]);
    expect(
      findings('Steuern in den USA, im Vereinigten Königreich, in Deutschland; Vereinigtes Königreich.', 'de', de),
    ).toEqual([]);
  });

  it('catch an article fused into a German preposition before such a name', () => {
    const de = articleNames(forms('de'));
    expect(
      findings(
        'Steuern im Vereinigtes Königreich, vom Vereinigtes Königreich, zum Vereinigtes Königreich, beim Vereinigtes Königreich, ins Vereinigtes Königreich.',
        'de',
        de,
      ),
    ).toEqual(['im Vereinigtes', 'vom Vereinigtes', 'zum Vereinigtes', 'beim Vereinigtes', 'ins Vereinigtes']);
    expect(findings('Im Niederlande, vom USA, zum Niederlande.', 'de', de)).toEqual([
      'Im Niederlande',
      'vom USA',
      'zum Niederlande',
    ]);
    expect(
      findings(
        'Steuern im Vereinigten Königreich, vom Vereinigten Königreich, das Vereinigte Königreich; zum USA-Profil.',
        'de',
        de,
      ),
    ).toEqual([]);
    expect(findings(strings(forms('de') as Tree).join('\n'), 'de', de)).toEqual([]);
  });

  it('end a name at a letter boundary in its own case, and let only a hyphen join it to a noun', () => {
    const de = articleNames(forms('de'));
    expect(
      findings(
        'Steuern im Usage, im Usability-Test, beim USAmerikaner, zum USA‑Profil, zum USA-Profil; in Usage, mit USAmerikanern, für Niederländer.',
        'de',
        de,
      ),
    ).toEqual([]);
    expect(
      findings('Zum USA–Profil. Im Vereinigtes Königreich. In USA. Das Vereinigtes Königreich.', 'de', de),
    ).toEqual(['In USA', 'Das Vereinigtes', 'Zum USA', 'Im Vereinigtes']);
    const pt = articleNames(forms('pt-PT'));
    expect(findings('Em Alemanha. Sobre Reino Unido.', 'pt-PT', pt)).toEqual(['Em Alemanha', 'Sobre Reino Unido']);
  });

  it('refuse a dropped article before a name with its German case ending', () => {
    const de = articleNames(forms('de'));
    expect(findings('Steuern in Niederlanden. Steuern aus Niederlanden. Steuern im Niederlanden.', 'de', de)).toEqual([
      'in Niederlanden',
      'aus Niederlanden',
      'im Niederlanden',
    ]);
    expect(findings('Regeln aus Vereinigtes Königreichs, mit Vereinigtes Königreiches.', 'de', de)).toEqual([
      'aus Vereinigtes Königreichs',
      'mit Vereinigtes Königreiches',
    ]);
    expect(
      findings('Steuern in den Niederlanden, aus den Niederlanden, des Vereinigten Königreichs; USAs.', 'de', de),
    ).toEqual([]);
  });

  it('found the pt-PT overlays and the site messages', () => {
    expect(files('pt-PT')).toEqual(
      expect.arrayContaining([
        join('packages/content/i18n/pt-PT/jurisdictions/nl.json'),
        join('apps/web/messages/pt-PT.json'),
      ]),
    );
    expect(files('pt-PT').some((path) => path.endsWith('.mdx'))).toBe(true);
  });

  it.each(LOCALES)('write each name of %s with its article after a preposition', (locale) => {
    const names = articleNames(forms(locale));
    const found = files(locale).flatMap((path) =>
      findings(prose(join(root, path)), locale, names).map((match) => `${path}: ${match}`),
    );
    expect(found).toEqual([]);
  });
});
