// A translated Learn module against its English module (ADR-0057; ADR-0048 Deviations), for scripts/validate.ts: the
// front matter is read by English's rules and holds only the texts a reader reads, the idea and the caveat keep
// English's limits, every field and the body carry English's numbers, and the ban list and the no-break hyphen run on
// the translated text, as they run on a translated fact. The chart, the facts and the review dates are English's, and
// so is the word cap. The body's elements are the compiler's to read: scripts/closed-body.ts holds them, and the
// translation's chart, to English's. Pure.
import type { Result } from '@proofofcalm/core';
import { hyphenProblems } from '../hyphen-validate.ts';
import { type LearnModule, plainText, readFields } from '../loaders/modules.ts';
import { bannedProblems, type Problem } from '../problem.ts';
import { CONTENT_LANGUAGES, type OverlayLanguage } from './overlay.ts';
import { numbersIn } from './overlay-validate.ts';

const FENCE = '---';
const TEXTS = ['title', 'idea', 'caveat'] as const;
const KEYS: readonly string[] = ['slug', ...TEXTS];
const LIMITS = { idea: 120, caveat: 240 } as const;

/** A translation's front matter and body, as `readTranslatedModule` reads them. */
export type TranslatedModule = {
  readonly front: Readonly<Partial<Record<'slug' | (typeof TEXTS)[number], string>>>;
  readonly body: string;
};

/**
 * The front matter between the two fences, read by English's `readFields`, and the body after them. Each line
 * English refuses, and each key outside slug, title, idea and caveat, is a problem that names its line.
 */
export function readTranslatedModule(path: string, source: string): Result<TranslatedModule, Problem[]> {
  const refuse = (detail: string): Problem => ({ path, code: 'module-overlay-front-matter', detail });
  const lines = source.split(/\r?\n/);
  const close = lines.indexOf(FENCE, 1);
  if (lines[0] !== FENCE || close === -1) {
    return { ok: false, error: [refuse('open the file with front matter between 2 --- lines')] };
  }
  const head = lines.slice(1, close);
  const { fields, problems } = readFields(path, head);
  const extra = [...fields.keys()]
    .filter((key) => !KEYS.includes(key))
    .map((key) => {
      const at = `line ${head.findIndex((line) => line.startsWith(`${key}:`)) + 2}`;
      return `${at}: remove ${key}: a translation holds slug, title, idea and caveat; the rest is English's`;
    });
  const error = [...problems.map(({ detail }) => refuse(detail)), ...extra.map(refuse)];
  if (error.length > 0) return { ok: false, error };
  return { ok: true, value: { front: Object.fromEntries(fields), body: lines.slice(close + 1).join('\n') } };
}

function frontProblems(path: string, front: TranslatedModule['front']): Problem[] {
  const report = (detail: string): Problem => ({ path, code: 'module-overlay-front-matter', detail });
  return [
    ...TEXTS.filter((key) => (front[key] ?? '') === '').map((key) => report(`add ${key}`)),
    ...(['idea', 'caveat'] as const)
      .filter((key) => (front[key] ?? '').length > LIMITS[key])
      .map((key) => report(`keep the ${key} to ${LIMITS[key]} characters`)),
  ];
}

/** Every way a translated module departs from its English module; the empty list is a pass. */
export function translatedModuleProblems(
  path: string,
  english: LearnModule | undefined,
  translated: TranslatedModule,
  language: OverlayLanguage,
): Problem[] {
  const { front, body } = translated;
  if (english === undefined) {
    const detail = `no English module has the slug ${front.slug ?? '(none)'}; name the file and slug after one`;
    return [{ path, code: 'module-overlay-orphan', detail }];
  }
  // The body as a person reads it, with each line end a space, so a phrase cannot hide across a line.
  const read = (text: string) => plainText(text).replace(/\s+/g, ' ');
  const texts: [string, string, string][] = [
    ...TEXTS.map((key): [string, string, string] => [key, front[key] ?? '', english[key]]),
    ['body', read(body), read(english.body)],
  ];
  const named = path.slice(path.lastIndexOf('/') + 1) === `${english.slug}.mdx`;
  return [
    ...(named ? [] : [{ path, code: 'file-name', detail: `rename the file to ${english.slug}.mdx` }]),
    ...frontProblems(path, front),
    ...texts.flatMap(([field, text, en]): Problem[] => {
      const [mine, others] = [numbersIn(text, language).join(' ') || 'none', numbersIn(en, 'en').join(' ') || 'none'];
      if (mine === others) return [];
      return [{ path, code: 'overlay-number-mismatch', detail: `${field}: ${mine}, English ${others}` }];
    }),
    ...texts.flatMap(([field, text]) => [...bannedProblems(path, field, text), ...hyphenProblems(path, field, text)]),
  ];
}

/** A translated module's file as scripts/validate.ts reads it: the language folder it sits in, its path and source. */
export type TranslationFile = { readonly language: string; readonly path: string; readonly source: string };

const isOverlayLanguage = (language: string): language is OverlayLanguage =>
  language !== 'en' && (CONTENT_LANGUAGES as readonly string[]).includes(language);

/**
 * Each file's problems against the English module of its slug; a folder of no overlay language, or a file whose
 * front matter does not read, fails whole.
 */
export function moduleTranslationProblems(
  files: readonly TranslationFile[],
  english: readonly LearnModule[],
): Problem[] {
  return files.flatMap(({ language, path, source }): Problem[] => {
    if (!isOverlayLanguage(language)) {
      return [{ path, code: 'module-overlay-orphan', detail: `${language} is not a content language` }];
    }
    const translated = readTranslatedModule(path, source);
    if (!translated.ok) return translated.error;
    const module = english.find((candidate) => candidate.slug === translated.value.front.slug);
    return translatedModuleProblems(path, module, translated.value, language);
  });
}
