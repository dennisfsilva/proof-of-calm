import type { Rolldown } from 'vite';

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

type Reach = { entries: Set<string>; modules: Set<string> };

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

/** Adds what an entry reaches through static imports, never walking into another feature's modules. */
function walkFrom(ctx: Rolldown.ChunkingContext, entry: string, reach: Reach): void {
  reach.entries.add(entry);
  reach.modules.add(entry);
  const queue = [entry];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const imported of ctx.getModuleInfo(next)?.importedIds ?? []) {
      if (reach.modules.has(imported) || !walksInto(imported)) continue;
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
    reach = { entries: new Set(), modules: new Set() };
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
 * its name function drops the ones the walk reaches only through another feature, which fall back
 * to automatic splitting. It captures no dependencies on its own (`includeDependenciesRecursively`),
 * since the dependencies of a captured barrel are the lazy-only modules it drops; Vite builds the
 * client with `preserveEntrySignatures: false`, the setting Rolldown's types ask for with that.
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
