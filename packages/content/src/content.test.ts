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
