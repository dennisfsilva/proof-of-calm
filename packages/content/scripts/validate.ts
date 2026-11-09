// `pnpm validate:content`: reads every content file and every UI message file, and fails on any problem
// that validateContent or the build's closed-body check finds (docs/CONTENT-OPS.md §1). The clock gives today's date in UTC.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ContentFile, validateContent } from '../src/validate.ts';
import { closedBodyProblems } from './closed-body.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
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
  ...featureMessages,
  ...jsonIn('apps/web/messages'),
];

const fromRoot = (absolute: string) => relative(root, absolute).replaceAll('\\', '/');
const modules = filesIn('packages/content/learn', '.mdx').map((absolute) => ({
  path: fromRoot(absolute),
  source: readFileSync(absolute, 'utf8'),
}));

const problems: { path: string; code: string; detail: string }[] = [];
const files: ContentFile[] = [];
for (const absolute of paths) {
  const path = fromRoot(absolute);
  try {
    files.push({ path, json: JSON.parse(readFileSync(absolute, 'utf8')) });
  } catch (error) {
    problems.push({ path, code: 'invalid-json', detail: String(error) });
  }
}
const allow = JSON.parse(readFileSync(join(root, 'packages/content/sources.allow.json'), 'utf8'));
problems.push(...validateContent(files, { today: new Date().toISOString().slice(0, 10), allow, modules }));
// The build's own compiler and element list on every module body (ADR-0048).
problems.push(...(await closedBodyProblems(modules)));

for (const problem of problems) console.error(`${problem.path}: ${problem.code}: ${problem.detail}`);
console.log(`${files.length + modules.length} files checked, ${problems.length} problems`);
if (problems.length > 0) process.exitCode = 1;
