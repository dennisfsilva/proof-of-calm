// `pnpm validate:content`: reads every content file and every UI message file, and fails on any problem
// that validateContent or the build's closed-body check finds (docs/CONTENT-OPS.md §1). The clock gives today's date in UTC.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleTranslationProblems } from '../src/i18n/module-overlay-validate.ts';
import { parseModule } from '../src/loaders/modules.ts';
import type { Problem } from '../src/problem.ts';
import { type ContentFile, figureContext, validateContent } from '../src/validate.ts';
import { closedBodyProblems } from './closed-body.ts';
import { overlayPaths } from './overlay-paths.ts';

// The repository root; a test passes a copy's root.
const root = resolve(process.argv[2] ?? fileURLToPath(new URL('../../../', import.meta.url)));
const filesIn = (directory: string, extension: string) => {
  const absolute = join(root, directory);
  return existsSync(absolute)
    ? readdirSync(absolute)
        .filter((name) => name.endsWith(extension))
        .map((name) => join(absolute, name))
    : [];
};
const jsonIn = (directory: string) => filesIn(directory, '.json');
const messagesOf = (kind: string) => {
  const folder = join(root, `packages/app/src/${kind}`);
  return existsSync(folder)
    ? readdirSync(folder).flatMap((name) => jsonIn(`packages/app/src/${kind}/${name}/messages`))
    : [];
};
const featureMessages = [...messagesOf('features'), ...messagesOf('lib')];
const catalogue = join(root, 'packages/content/coins.json');
const paths = [
  ...(existsSync(catalogue) ? [catalogue] : []),
  ...jsonIn('packages/content/cycles'),
  ...jsonIn('packages/content/jurisdictions'),
  ...jsonIn('packages/content/templates'),
  ...jsonIn('packages/content/facts'),
  ...overlayPaths(root),
  ...featureMessages,
  ...jsonIn('apps/web/messages'),
];

const fromRoot = (absolute: string) => relative(root, absolute).replaceAll('\\', '/');
const modules = filesIn('packages/content/learn', '.mdx').map((absolute) => ({
  path: fromRoot(absolute),
  source: readFileSync(absolute, 'utf8'),
}));

// Each translated module, `i18n/<language>/learn/<slug>.mdx`, against the English module of its slug (ADR-0057).
const englishModules = modules.flatMap(({ path, source }) => {
  const parsed = parseModule(path, source);
  return parsed.ok ? [parsed.value] : [];
});
const i18n = join(root, 'packages/content/i18n');
const languages = existsSync(i18n) ? readdirSync(i18n).filter((name) => existsSync(join(i18n, name, 'learn'))) : [];
const translations = languages.flatMap((language) =>
  filesIn(`packages/content/i18n/${language}/learn`, '.mdx').map((absolute) => ({
    language,
    path: fromRoot(absolute),
    source: readFileSync(absolute, 'utf8'),
  })),
);

const files: ContentFile[] = [];
const unread: Problem[] = [];
for (const absolute of paths) {
  const path = fromRoot(absolute);
  try {
    files.push({ path, json: JSON.parse(readFileSync(absolute, 'utf8')) });
  } catch (error) {
    unread.push({ path, code: 'invalid-json', detail: String(error) });
  }
}
// The chart's rows and the catalogue each module's chart section is read against (docs/CONTENT-STYLE.md §4, R5).
const figures = figureContext(files);
const problems: Problem[] = moduleTranslationProblems(translations, englishModules);
problems.push(...(await closedBodyProblems(translations, { english: englishModules, figures })), ...unread);
const allow = JSON.parse(readFileSync(join(root, 'packages/content/sources.allow.json'), 'utf8'));
problems.push(...validateContent(files, { today: new Date().toISOString().slice(0, 10), allow, modules }));
// The build's own compiler and element list on every module body (ADR-0048).
problems.push(...(await closedBodyProblems(modules, { figures })));

for (const problem of problems) console.error(`${problem.path}: ${problem.code}: ${problem.detail}`);
console.log(`${files.length + modules.length + translations.length} files checked, ${problems.length} problems`);
if (problems.length > 0) process.exitCode = 1;
