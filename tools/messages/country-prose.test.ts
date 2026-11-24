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

/** Each wrong form in `text`, as it reads there. */
function findings(text: string, locale: Locale, names: readonly string[]): string[] {
  const bare = new RegExp(
    `(?<!\\p{L})(?:${PREPOSITIONS[locale].join('|')})\\s+(?:${names.map(literal).join('|')})`,
    'giu',
  );
  const found = [...text.matchAll(bare)].map(([match]) => match);
  if (locale === 'de') {
    found.push(...[...text.matchAll(/(?<!\p{L})(?:das|dem|des|die)\s+Vereinigtes/giu)].map(([match]) => match));
    // A singular article fused into the preposition fits none of these names: `Vereinigtes` wants the dative's
    // `Vereinigten` after it, and the plural names take `den`; a hyphen joins the name to a noun (`zum USA-Profil`).
    const fused = new RegExp(
      `(?<!\\p{L})(?:${FUSED.join('|')})\\s+(?:${names.map((name) => literal(name.split(' ')[0] ?? '')).join('|')})(?!-)`,
      'giu',
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
    expect(findings('Zum USA–Profil. Im Vereinigtes Königreich. In USA. Das Vereinigtes Königreich.', 'de', de)).toEqual([
      'In USA',
      'Das Vereinigtes',
      'Zum USA',
      'Im Vereinigtes',
    ]);
    const pt = articleNames(forms('pt-PT'));
    expect(findings('Em Alemanha. Sobre Reino Unido.', 'pt-PT', pt)).toEqual(['Em Alemanha', 'Sobre Reino Unido']);
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
