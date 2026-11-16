// The translated Learn modules (ADR-0057; ADR-0048 Deviations): `<translations>/<language>/learn/<slug>.mdx`, each
// with a front matter of slug, title, idea and caveat only. Its metadata is the English module's under the translated
// texts, parsed by the same parseModule from the translation's own body, so the reading time counts the translation's
// words; it rides in the translation's lazy chunk, never in the chunk that lists the modules.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FENCE = '---';
const TEXTS = ['title', 'idea', 'caveat'];
const KEYS = ['slug', ...TEXTS];
const keyOf = (line: string) => /^([A-Za-z]+):/.exec(line)?.[1];

/** The entries of `dir`, by name; none when the folder is missing. */
export async function entriesOf(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return [];
    throw error;
  }
}

/** A translation file: its language folder, its absolute path and its source. */
export type TranslationFile = { readonly language: string; readonly file: string; readonly source: string };

/** Every `<language>/learn/*.mdx` under `translations`, by language, then by name. */
export async function listTranslations(translations: string): Promise<TranslationFile[]> {
  const files: TranslationFile[] = [];
  for (const language of await entriesOf(translations)) {
    const learn = join(translations, language, 'learn');
    for (const name of (await entriesOf(learn)).filter((entry) => entry.endsWith('.mdx'))) {
      const file = join(learn, name);
      files.push({ language, file, source: await readFile(file, 'utf8') });
    }
  }
  return files;
}

const split = (source: string) => {
  const lines = source.split(/\r?\n/);
  const close = lines.indexOf(FENCE, 1);
  return lines[0] === FENCE && close !== -1 ? { front: lines.slice(1, close), body: lines.slice(close + 1) } : null;
};

/**
 * The source parseModule reads for a translation: the English front matter with the translated title, idea and
 * caveat in place of English's, then the translation's body. A string is the build's message for a translation
 * without front matter, with a key other than the four, or with a slug no English module carries.
 */
export function translatedSource(
  translation: string,
  englishOf: (slug: string) => string | undefined,
): { readonly slug: string; readonly source: string } | string {
  const parts = split(translation);
  if (parts === null) return 'open the file with front matter between 2 --- lines';
  const extra = parts.front.map(keyOf).filter((key) => key !== undefined && !KEYS.includes(key));
  if (extra.length > 0) return `remove ${extra.join(', ')}: a translation holds slug, title, idea and caveat`;
  const slug =
    parts.front
      .find((line) => keyOf(line) === 'slug')
      ?.slice('slug:'.length)
      .trim() ?? '';
  const english = split(englishOf(slug) ?? '');
  if (english === null) return `no English module has the slug ${slug || '(none)'} (ADR-0057)`;
  const kept = english.front.filter((line) => !TEXTS.includes(keyOf(line) ?? ''));
  const texts = parts.front.filter((line) => TEXTS.includes(keyOf(line) ?? ''));
  return { slug, source: [FENCE, ...kept, ...texts, FENCE, ...parts.body].join('\n') };
}
