// Merges the message files of the features (packages/app/src/features/<feature>/messages/<locale>.json)
// and of the lib modules that word things (packages/app/src/lib/<module>/messages, such as errors), the
// folder name being the namespace (ADR-0023), into packages/app/src/messages: <locale>.json holds every
// namespace and gives the keys their types; <locale>/<namespace>.json holds one namespace, for a route to
// load with its module (ADR-0045 §8). Everything in that folder is generated and committed, so the app
// needs no build step; `--check` fails when a file there is stale, missing or produced by no message file.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type MessageTree = { [key: string]: string | MessageTree };

/** Feature name → that feature's messages, merged under the feature name, in a stable order. */
export function mergeMessages(byFeature: Record<string, MessageTree>): MessageTree {
  const merged: MessageTree = {};
  for (const feature of Object.keys(byFeature).sort()) {
    const tree = byFeature[feature];
    if (tree !== undefined) merged[feature] = tree;
  }
  return merged;
}

export function serialise(tree: MessageTree): string {
  return `${JSON.stringify(tree, null, 2)}\n`;
}

/** Locale → namespace → messages, from every feature's and lib module's message files. */
function readSources(appSrc: string): Map<string, Record<string, MessageTree>> {
  const byLocale = new Map<string, Record<string, MessageTree>>();
  const namespaces = new Set<string>();
  const folders = ['features', 'lib'].flatMap((kind) => {
    const dir = join(appSrc, kind);
    return existsSync(dir) ? readdirSync(dir).map((name) => ({ name, path: join(dir, name) })) : [];
  });
  for (const { name: namespace, path } of folders.sort((a, b) => a.name.localeCompare(b.name))) {
    const messagesDir = join(path, 'messages');
    if (!existsSync(messagesDir)) continue;
    if (namespaces.has(namespace))
      throw new Error(`Two message folders are named "${namespace}"; a namespace needs one folder.`);
    namespaces.add(namespace);
    for (const file of readdirSync(messagesDir).filter((name) => name.endsWith('.json'))) {
      const locale = file.slice(0, -'.json'.length);
      const forLocale = byLocale.get(locale) ?? {};
      forLocale[namespace] = JSON.parse(readFileSync(join(messagesDir, file), 'utf8')) as MessageTree;
      byLocale.set(locale, forLocale);
    }
  }
  return byLocale;
}

/** Every file the merge writes, by its path in the messages folder, with its contents. */
function collect(appSrc: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const [locale, namespaces] of readSources(appSrc)) {
    files.set(`${locale}.json`, serialise(mergeMessages(namespaces)));
    for (const [namespace, tree] of Object.entries(namespaces))
      files.set(`${locale}/${namespace}.json`, serialise(tree));
  }
  return new Map([...files].sort(([a], [b]) => a.localeCompare(b)));
}

/** The JSON files in the messages folder and in its subfolders, by their path in it. */
function present(messagesDir: string): string[] {
  if (!existsSync(messagesDir)) return [];
  return readdirSync(messagesDir).flatMap((name) => {
    const path = join(messagesDir, name);
    if (!statSync(path).isDirectory()) return name.endsWith('.json') ? [name] : [];
    return readdirSync(path)
      .filter((file) => file.endsWith('.json'))
      .map((file) => `${name}/${file}`);
  });
}

export function run(appSrc: string, check: boolean): string[] {
  const messagesDir = join(appSrc, 'messages');
  const files = collect(appSrc);
  const fix = 'run `pnpm --filter @proofofcalm/tools messages`.';
  const problems: string[] = [];
  for (const [path, contents] of files) {
    const target = join(messagesDir, path);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current === contents) continue;
    if (check) problems.push(`${target} ${current === null ? 'is missing' : 'is out of date'}; ${fix}`);
    else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
  }
  for (const path of present(messagesDir).filter((name) => !files.has(name))) {
    const target = join(messagesDir, path);
    if (check) problems.push(`${target} comes from no message file; ${fix}`);
    else rmSync(target);
  }
  return problems;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const appSrc = fileURLToPath(new URL('../../packages/app/src', import.meta.url));
  const problems = run(appSrc, process.argv.includes('--check'));
  for (const problem of problems) console.error(problem);
  process.exit(problems.length > 0 ? 1 : 0);
}
