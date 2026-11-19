// Merges the message files of the features (packages/app/src/features/<feature>/messages/<locale>.json)
// and of the lib modules that word things (packages/app/src/lib/<module>/messages, such as errors), the
// folder name being the namespace (ADR-0023), into packages/app/src/messages: en.json holds every
// namespace and gives the keys their types; <locale>/<namespace>.json holds one namespace of each locale
// in LOCALES, completed from English, for a route to load with its module (ADR-0045 §8, the entry of
// 2026-11-15 on translations). Everything in that folder is generated and committed, so the app
// needs no build step; `--check` fails when a file there is stale, missing or produced by no message file.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type MessageTree = { [key: string]: string | MessageTree };

/** The locales the merge writes; a translation sits beside English as `messages/<locale>.json`. */
export const LOCALES = ['en', 'pt-PT', 'de'] as const;

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

/**
 * The translated tree completed from English, in English's key order: a key the translation lacks keeps its
 * English text (a hidden locale may be partial, ADR-0045 §8); a key English does not have, or a message
 * where English has a namespace or the reverse, throws with its path.
 */
export function complete(english: MessageTree, translated: MessageTree, path = ''): MessageTree {
  for (const key of Object.keys(translated))
    if (!Object.hasOwn(english, key))
      throw new Error(`${path}${key} is not an English key; translate English's keys only.`);
  const done: MessageTree = {};
  for (const [key, source] of Object.entries(english)) {
    const value = Object.hasOwn(translated, key) ? translated[key] : undefined;
    if (value !== undefined && typeof value !== typeof source)
      throw new Error(`${path}${key} is a ${typeof source === 'string' ? 'message' : 'namespace'} in English.`);
    done[key] =
      typeof source === 'string' || value === undefined
        ? (value ?? source)
        : complete(source, value as MessageTree, `${path}${key}.`);
  }
  return done;
}

/**
 * Every file the merge writes, by its path in the messages folder, with its contents: `<locale>/<namespace>.json`
 * for each locale of `LOCALES`, completed from English, and the merged `en.json` alone, which types the keys.
 */
function collect(appSrc: string): Map<string, string> {
  const files = new Map<string, string>();
  const sources = readSources(appSrc);
  for (const locale of sources.keys())
    if (!(LOCALES as readonly string[]).includes(locale))
      throw new Error(`A message file is named "${locale}", which LOCALES in tools/messages/merge.ts does not list.`);
  const english = sources.get('en') ?? {};
  files.set('en.json', serialise(mergeMessages(english)));
  for (const locale of LOCALES) {
    const translated = sources.get(locale) ?? {};
    for (const namespace of Object.keys(translated))
      if (!Object.hasOwn(english, namespace))
        throw new Error(`${namespace} has a ${locale} message file but no English one.`);
    for (const [namespace, tree] of Object.entries(english)) {
      const own = Object.hasOwn(translated, namespace) ? translated[namespace] : undefined;
      files.set(`${locale}/${namespace}.json`, serialise(complete(tree, own ?? {}, `${namespace}.`)));
    }
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
