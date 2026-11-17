// A translated Learn module against its English module (ADR-0057; ADR-0048 Deviations), for scripts/validate.ts: the
// front matter holds only the texts a reader reads, the idea and the caveat keep English's limits, every field and the
// body carry English's numbers and the body English's elements in order, and the ban list and the no-break hyphen run on
// the translated text, as they run on a translated fact. The chart, the facts and the review dates are English's, and so
// is the word cap; the build's closed-body check runs on the translation as on English. Pure.
import { hyphenProblems } from '../hyphen-validate.ts';
import { type LearnModule, plainText } from '../loaders/modules.ts';
import { bannedProblems, type Problem } from '../problem.ts';
import { CONTENT_LANGUAGES, type OverlayLanguage } from './overlay.ts';
import { numbersIn } from './overlay-validate.ts';

/** A translation's front matter and body, as `readTranslatedModule` reads them. */
export type TranslatedModule = { readonly front: Readonly<Record<string, string>>; readonly body: string };

const FENCE = '---';
const FIELD = /^([A-Za-z]+):(?: (.*))?$/;
const TEXTS = ['title', 'idea', 'caveat'] as const;
const KEYS: readonly string[] = ['slug', ...TEXTS];
const LIMITS = { idea: 120, caveat: 240 } as const;
// An element of the closed set, `<Chart />` or `<PastPerformance />`; an escaped `\<` is text.
const ELEMENT = /(?<!\\)<([A-Z][A-Za-z]*)\b/g;

/** The flat `key: value` lines between the two fences and the body after them; null without the fences. */
export function readTranslatedModule(source: string): TranslatedModule | null {
  const lines = source.split(/\r?\n/);
  const close = lines.indexOf(FENCE, 1);
  if (lines[0] !== FENCE || close === -1) return null;
  const front: Record<string, string> = {};
  for (const line of lines.slice(1, close)) {
    const match = FIELD.exec(line);
    if (match?.[1] !== undefined) front[match[1]] = (match[2] ?? '').trim();
  }
  return { front, body: lines.slice(close + 1).join('\n') };
}

const elementsIn = (body: string) => [...body.matchAll(ELEMENT)].map((match) => match[1]).join(', ') || 'none';

function frontProblems(path: string, front: TranslatedModule['front']): Problem[] {
  const report = (detail: string): Problem => ({ path, code: 'module-overlay-front-matter', detail });
  const extra = Object.keys(front).filter((key) => !KEYS.includes(key));
  return [
    ...(extra.length === 0
      ? []
      : [
          report(`remove ${extra.join(', ')}: a translation holds slug, title, idea and caveat; the rest is English's`),
        ]),
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
  const [ours, theirs] = [elementsIn(body), elementsIn(english.body)];
  const named = path.slice(path.lastIndexOf('/') + 1) === `${english.slug}.mdx`;
  return [
    ...(named ? [] : [{ path, code: 'file-name', detail: `rename the file to ${english.slug}.mdx` }]),
    ...frontProblems(path, front),
    ...texts.flatMap(([field, text, en]): Problem[] => {
      const [mine, others] = [numbersIn(text, language).join(' ') || 'none', numbersIn(en, 'en').join(' ') || 'none'];
      if (mine === others) return [];
      return [{ path, code: 'overlay-number-mismatch', detail: `${field}: ${mine}, English ${others}` }];
    }),
    ...(ours === theirs
      ? []
      : [{ path, code: 'module-overlay-elements', detail: `body: ${ours}, English ${theirs}, in this order` }]),
    ...texts.flatMap(([field, text]) => [...bannedProblems(path, field, text), ...hyphenProblems(path, field, text)]),
  ];
}

/** A translated module's file as scripts/validate.ts reads it: the language folder it sits in, its path and source. */
export type TranslationFile = { readonly language: string; readonly path: string; readonly source: string };

const isOverlayLanguage = (language: string): language is OverlayLanguage =>
  language !== 'en' && (CONTENT_LANGUAGES as readonly string[]).includes(language);

/**
 * Each file's problems against the English module of its slug; a folder of no overlay language, or a file without
 * front matter, fails whole.
 */
export function moduleTranslationProblems(
  files: readonly TranslationFile[],
  english: readonly LearnModule[],
): Problem[] {
  return files.flatMap(({ language, path, source }): Problem[] => {
    if (!isOverlayLanguage(language)) {
      return [{ path, code: 'module-overlay-orphan', detail: `${language} is not a content language` }];
    }
    const translated = readTranslatedModule(source);
    if (translated === null) {
      return [
        { path, code: 'module-overlay-front-matter', detail: 'open the file with front matter between 2 --- lines' },
      ];
    }
    const module = english.find((candidate) => candidate.slug === translated.front.slug);
    return translatedModuleProblems(path, module, translated, language);
  });
}
