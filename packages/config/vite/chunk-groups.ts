import type { Plugin, Rolldown } from 'vite';

/**
 * The features whose modules Today's entry holds: the shell and Today, the one screen imported
 * statically; every other screen is a lazy chunk (ADR-0045 §9).
 */
const ENTRY_FEATURES = new Set(['shell', 'today']);
const FEATURE = /[\\/]packages[\\/]app[\\/]src[\\/]features[\\/]([^\\/]+)[\\/]/;

/** The group's name: the chunk it makes is Today's entry chunk, which the group's modules join. */
const GROUP = 'today';

/**
 * Whether the walk from the entry passes through a module: everything but another feature's
 * modules. Another feature's barrel re-exports components Today never renders, and Rolldown's
 * `$initial` tag follows every static import, so the tag alone pulled 36 lazy-only modules (42 kB
 * rendered, through `features/learn/index.ts`) into the entry on 2026-11-09.
 */
export function walksInto(id: string): boolean {
  const feature = FEATURE.exec(id)?.[1];
  return feature === undefined || ENTRY_FEATURES.has(feature);
}

/** The entries walked, the modules they reach, and the names the walk asked of each module. */
type Reach = { entries: Set<string>; modules: Set<string>; asked: Map<string, Set<string>> };

/** The user entries above a module, through its static importers. */
function entriesAbove(ctx: Rolldown.ChunkingContext, id: string): string[] {
  const found: string[] = [];
  const seen = new Set([id]);
  const queue = [id];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    const info = ctx.getModuleInfo(next);
    if (info?.isEntry) found.push(next);
    for (const importer of info?.importers ?? []) {
      if (seen.has(importer)) continue;
      seen.add(importer);
      queue.push(importer);
    }
  }
  return found;
}

/** Whether a module's code names an export: an over-count, since a mention needs no import. */
const mentions = (code: string, name: string): boolean =>
  new RegExp(`(?<![\\w$])${name.replaceAll('$', '\\$')}(?![\\w$])`).test(code);

/**
 * The names an import from `from` asks of another feature's module `to`, or `null` when the walk
 * leaves `to` out: the names of `to` that `from`'s code mentions, less, when `from` is another
 * feature's module too, those it exports itself unless the walk asked them of it (a barrel passes on
 * only what its importers ask). A module read
 * for its effects, one without its code, and an `export *` are walked whole, since an under-count
 * would leave a module Today runs outside its chunk.
 */
function asks(ctx: Rolldown.ChunkingContext, reach: Reach, from: string, to: string): string[] | null {
  if (walksInto(to)) return [];
  const source = ctx.getModuleInfo(from);
  const names = ctx.getModuleInfo(to)?.exports ?? [];
  const code = source?.code;
  if (typeof code !== 'string' || names.length === 0 || /\bexport\s*\*/.test(code)) return [];
  const own = new Set(walksInto(from) ? [] : (source?.exports ?? []));
  const asked = reach.asked.get(from);
  const found = names.filter((name) => mentions(code, name) && (!own.has(name) || asked?.has(name)));
  return found.length > 0 ? found : null;
}

/**
 * Adds what an entry reaches through static imports: every module outside another feature, and of
 * another feature's modules the ones whose names the walk asks for. A module asked for new names is
 * walked again, since its barrel may now pass them on.
 */
function walkFrom(ctx: Rolldown.ChunkingContext, entry: string, reach: Reach): void {
  reach.entries.add(entry);
  reach.modules.add(entry);
  const queue = [entry];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const imported of ctx.getModuleInfo(next)?.importedIds ?? []) {
      const names = asks(ctx, reach, next, imported);
      if (names === null) continue;
      const asked = reach.asked.get(imported) ?? new Set<string>();
      const more = names.filter((name) => !asked.has(name));
      for (const name of more) asked.add(name);
      reach.asked.set(imported, asked);
      if (reach.modules.has(imported) && more.length === 0) continue;
      reach.modules.add(imported);
      queue.push(imported);
    }
  }
}

/**
 * Whether the walk from a module's entries reaches it, kept per chunking pass: a module whose
 * entries are walked already and that the walk missed came only through another feature.
 */
function reaches(cache: WeakMap<Rolldown.ChunkingContext, Reach>, ctx: Rolldown.ChunkingContext, id: string) {
  let reach = cache.get(ctx);
  if (!reach) {
    reach = { entries: new Set(), modules: new Set(), asked: new Map() };
    cache.set(ctx, reach);
  }
  if (reach.modules.has(id)) return true;
  for (const entry of entriesAbove(ctx, id)) if (!reach.entries.has(entry)) walkFrom(ctx, entry, reach);
  return reach.modules.has(id);
}

/**
 * Rolldown's code-splitting options for both hosts (`output.codeSplitting`, rolldown 1.2.13's
 * types): one group that keeps the modules a user entry imports statically in the entry's chunk,
 * packages and own code together, so a lazy chunk that imports some of them reads them from there
 * instead of splitting them into new shared chunks (Rolldown groups modules by the entries that
 * reach them). It takes only modules tagged `$initial` (statically imported by a user entry), and
 * its name function drops the ones the walk reaches only through another feature's names Today does
 * not import, which fall back to automatic splitting. It captures no dependencies on its own
 * (`includeDependenciesRecursively`), since the dependencies of a captured barrel are the lazy-only
 * modules it drops. Rolldown's types ask for `strictExecutionOrder: true` with that; it is off,
 * because it keeps every re-export of a barrel in the static graph (75 lazy-only modules moved into
 * Today's load on 2026-11-09). The output is valid instead because a module Today runs never sits in a
 * chunk outside the group that imports the group back: on 2026-11-09 the walk left `why-link.tsx` out,
 * its chunk and the group's imported each other, and the app stopped at boot with `TypeError: c is not
 * a function` (the chunk ran before the React it reads); `noChunkCycles` fails such a build.
 */
export function chunkGroups(): Rolldown.CodeSplittingOptions {
  const cache = new WeakMap<Rolldown.ChunkingContext, Reach>();
  return {
    groups: [
      {
        debugName: GROUP,
        name: (id, ctx) => (reaches(cache, ctx, id) ? GROUP : null),
        tags: ['$initial'],
        includeDependenciesRecursively: false,
      },
    ],
  };
}

/** The first cycle of static imports between chunks, as file names from its first chunk back to it. */
function firstCycle(imports: Map<string, string[]>): string[] | null {
  const done = new Set<string>();
  const path: string[] = [];
  const visit = (file: string): string[] | null => {
    const open = path.indexOf(file);
    if (open >= 0) return [...path.slice(open), file];
    if (done.has(file)) return null;
    path.push(file);
    for (const next of imports.get(file) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    done.add(file);
    return null;
  };
  for (const file of imports.keys()) {
    const cycle = visit(file);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Fails a build whose chunks import each other statically. Without `strictExecutionOrder`, a chunk
 * in such a cycle can run before the chunk it reads, which stopped the app at boot on 2026-11-09.
 */
export function noChunkCycles(): Plugin {
  return {
    name: 'poc:no-chunk-cycles',
    apply: 'build',
    generateBundle(_options, bundle) {
      const imports = new Map<string, string[]>();
      for (const item of Object.values(bundle)) if (item.type === 'chunk') imports.set(item.fileName, item.imports);
      const cycle = firstCycle(imports);
      if (cycle) this.error(`static import cycle between chunks: ${cycle.join(' -> ')}`);
    },
  };
}
