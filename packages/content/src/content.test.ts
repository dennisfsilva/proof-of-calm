import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import allowList from '../sources.allow.json' with { type: 'json' };
import { COUNTRY_CODES } from './loaders/countries.ts';
import { parseModule } from './loaders/modules.ts';
import { CountryProfileSchema } from './schema/jurisdiction.ts';
import { type ContentFile, validateContent } from './validate.ts';

// The files as `pnpm validate:content` reads them, checked on a fixed day so that this test does not
// start failing when a review falls due; the CLI checks the review dates against the real day.
const root = new URL('../', import.meta.url);
const jsonIn = (folder: string) =>
  readdirSync(new URL(folder, root))
    .filter((name) => name.endsWith('.json'))
    .map((name) => `${folder}${name}`);
const read = (path: string): ContentFile => ({
  path: `packages/content/${path}`,
  json: JSON.parse(readFileSync(new URL(path, root), 'utf8')),
});
const { $comment: _, ...allow } = allowList;

describe('the content files (docs/CONTENT-OPS.md §1)', () => {
  const paths = ['coins.json', ...jsonIn('cycles/'), ...jsonIn('jurisdictions/'), ...jsonIn('templates/')];

  it('all pass the content gate', () => {
    expect(paths).toHaveLength(16);
    expect(validateContent(paths.map(read), { today: '2026-10-17', allow })).toEqual([]);
  });

  // `enacted` says a text exists, so the text is the evidence; a proposal may rest on a report of it.
  it('an enacted pending change cites a law or an authority, never a secondary source alone', () => {
    const unread = jsonIn('jurisdictions/').flatMap((path) =>
      CountryProfileSchema.parse(read(path).json)
        .pendingChanges.filter(
          ({ status, source }) => status === 'enacted' && !['law', 'authority'].includes(source.kind),
        )
        .map(({ title }) => `${path}: ${title}`),
    );
    expect(unread).toEqual([]);
  });

  it('have a loader for every profile and a profile for every loader', () => {
    const files = jsonIn('jurisdictions/').map((path) => path.slice('jurisdictions/'.length, -'.json'.length));
    expect(files.map((name) => name.toUpperCase()).sort()).toEqual([...COUNTRY_CODES]);
  });

  // CONTENT-STYLE §4: a no-break space is written `\u00a0` in JSON, since a typed one looks like a space.
  // The translated overlays under i18n/ are read too, every locale and folder.
  it('a profile or an overlay writes a no-break space as its escape, never the character', () => {
    const overlays = readdirSync(new URL('i18n/', root), { recursive: true, encoding: 'utf8' })
      .map((path) => `i18n/${path.replaceAll('\\', '/')}`)
      .filter((path) => path.endsWith('.json'));
    expect(overlays.length).toBeGreaterThan(0);
    const typed = [...jsonIn('jurisdictions/'), ...overlays].flatMap((path) =>
      readFileSync(new URL(path, root), 'utf8')
        .split('\n')
        .flatMap((line, index) => (line.includes('\u00a0') ? [`${path}:${index + 1}`] : [])),
    );
    expect(typed).toEqual([]);
  });

  // Bitstamp's OHLC endpoint answers HTTP 400 without `limit`, so a source the owner opens would not
  // answer. Every JSON file of the package is read, the facts, templates, cycles and overlays alike.
  it('give each Bitstamp OHLC source a limit of 1 to 1000 candles, since Bitstamp answers 400 without one', () => {
    // The top level first, so the walk never descends into node_modules.
    const json = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.name !== 'node_modules')
      .flatMap((entry) =>
        entry.isDirectory()
          ? readdirSync(new URL(`${entry.name}/`, root), { recursive: true, encoding: 'utf8' }).map(
              (path) => `${entry.name}/${path.replaceAll('\\', '/')}`,
            )
          : [entry.name],
      )
      .filter((path) => path.endsWith('.json'));
    const ohlc = json.flatMap((path) =>
      [
        ...readFileSync(new URL(path, root), 'utf8').matchAll(/https:\/\/www\.bitstamp\.net\/api\/v2\/ohlc\/[^"\s]*/g),
      ].map(([url]) => ({ path, url })),
    );
    expect(new Set(ohlc.map(({ path }) => path.split('/')[0]))).toEqual(new Set(['cycles', 'facts', 'templates']));
    expect(ohlc).toHaveLength(22);
    const limit = (source: string) => Number(new URL(source).searchParams.get('limit'));
    const unanswered = ohlc.filter(
      ({ url }) => !(Number.isInteger(limit(url)) && limit(url) >= 1 && limit(url) <= 1000),
    );
    expect(unanswered.map(({ path, url }) => `${path}: ${url}`)).toEqual([]);
  });

  // The folder arrives with the first module, so an absent one is empty.
  it('every module in learn/ has the required front matter', () => {
    const learn = new URL('learn/', root);
    const names = existsSync(learn) ? readdirSync(learn).filter((name) => name.endsWith('.mdx')) : [];
    const problems = names.flatMap((name) => {
      const result = parseModule(`packages/content/learn/${name}`, readFileSync(new URL(name, learn), 'utf8'));
      return result.ok ? [] : result.error;
    });
    expect(problems).toEqual([]);
  });
});
