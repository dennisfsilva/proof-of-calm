import type { Rolldown } from 'vite';
import { describe, expect, it } from 'vitest';
import { chunkGroups, walksInto } from './chunk-groups.ts';

const ROOT = '/repo';
const REACT_DOM = `${ROOT}/node_modules/.pnpm/react-dom@19.3.1/node_modules/react-dom/cjs/react-dom-client.production.js`;
const ZOD = `${ROOT}/node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/mini/schemas.js`;
const BUTTON = `${ROOT}/packages/ui/src/components/button.tsx`;
const COLLAPSIBLE = `${ROOT}/packages/ui/src/components/collapsible.tsx`;
const PORTFOLIO = `${ROOT}/packages/app/src/features/portfolio/components/portfolio-screen.tsx`;
const ENTRY = `${ROOT}/apps/web/app.html`;
const SHELL = `${ROOT}/packages/app/src/features/shell/index.ts`;
const TODAY = `${ROOT}/packages/app/src/features/today/components/today-screen.tsx`;
const LEARN = `${ROOT}/packages/app/src/features/learn/index.ts`;
const HOLDING = `${ROOT}/packages/app/src/features/learn/components/holding-conditions.tsx`;

describe('walksInto', () => {
  it('react-dom, zod, a ui component, the shell and Today are modules the walk passes through', () => {
    for (const id of [REACT_DOM, ZOD, ZOD.replaceAll('/', '\\'), BUTTON, SHELL, TODAY, TODAY.replaceAll('/', '\\')]) {
      expect(walksInto(id)).toBe(true);
    }
  });

  it("a lazy screen's module, and another feature's barrel, stop the walk", () => {
    for (const id of [PORTFOLIO, LEARN, HOLDING, PORTFOLIO.replaceAll('/', '\\')]) expect(walksInto(id)).toBe(false);
  });
});

/** A chunking context over a static import graph: each id maps to the ids it imports. */
function contextOf(graph: Record<string, string[]>): Rolldown.ChunkingContext {
  const importers = (id: string) => Object.keys(graph).filter((from) => graph[from]?.includes(id));
  return {
    getModuleInfo: (id: string) =>
      id in graph
        ? ({ id, isEntry: id === ENTRY, importedIds: graph[id], importers: importers(id) } as unknown as Rolldown.ModuleInfo)
        : null,
  };
}

/** What the group's `name` function gives each module, `null` where it leaves one to automatic splitting. */
function names(ctx: Rolldown.ChunkingContext, ids: string[]) {
  const [group, ...rest] = chunkGroups().groups ?? [];
  if (!group || rest.length > 0) throw new Error('expected one group');
  const name = group.name;
  if (typeof name !== 'function') throw new Error('expected a name function');
  return Object.fromEntries(ids.map((id) => [id, name(id, ctx) ?? null]));
}

describe('chunkGroups', () => {
  const graph = {
    [ENTRY]: [SHELL, REACT_DOM],
    [SHELL]: [TODAY, LEARN],
    [TODAY]: [BUTTON, ZOD],
    [LEARN]: [HOLDING],
    [HOLDING]: [COLLAPSIBLE],
    [BUTTON]: [],
    [COLLAPSIBLE]: [],
    [REACT_DOM]: [],
    [ZOD]: [],
  };

  it('one group of $initial modules that captures no dependencies on its own', () => {
    expect(chunkGroups().groups).toMatchObject([
      { debugName: 'today', tags: ['$initial'], includeDependenciesRecursively: false },
    ]);
  });

  it('takes the modules the entry reaches statically, packages and own code alike', () => {
    expect(names(contextOf(graph), [ENTRY, SHELL, TODAY, BUTTON, REACT_DOM, ZOD])).toEqual({
      [ENTRY]: 'today',
      [SHELL]: 'today',
      [TODAY]: 'today',
      [BUTTON]: 'today',
      [REACT_DOM]: 'today',
      [ZOD]: 'today',
    });
  });

  it("leaves another feature's modules, and what only they reach, to automatic splitting", () => {
    expect(names(contextOf(graph), [LEARN, HOLDING, COLLAPSIBLE])).toEqual({
      [LEARN]: null,
      [HOLDING]: null,
      [COLLAPSIBLE]: null,
    });
  });

  it('a module reached from the entry by another path stays in the group', () => {
    const ctx = contextOf({ ...graph, [TODAY]: [BUTTON, ZOD, COLLAPSIBLE] });
    expect(names(ctx, [COLLAPSIBLE, HOLDING])).toEqual({ [COLLAPSIBLE]: 'today', [HOLDING]: null });
  });
});
