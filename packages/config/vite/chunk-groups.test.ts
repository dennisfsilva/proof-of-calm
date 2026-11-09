import type { Rolldown } from 'vite';
import { describe, expect, it } from 'vitest';
import { chunkGroups, noChunkCycles, walksInto } from './chunk-groups.ts';

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
const WHY = `${ROOT}/packages/app/src/features/learn/components/why-link.tsx`;

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

/** A module's names and code as the chunking context gives them; a module without one exports nothing. */
type Source = { exports: string[]; code: string };

/** A chunking context over a static import graph: each id maps to the ids it imports. */
function contextOf(graph: Record<string, string[]>, sources: Record<string, Source> = {}): Rolldown.ChunkingContext {
  const importers = (id: string) => Object.keys(graph).filter((from) => graph[from]?.includes(id));
  return {
    getModuleInfo: (id: string) =>
      id in graph
        ? ({
            id,
            isEntry: id === ENTRY,
            importedIds: graph[id],
            importers: importers(id),
            exports: sources[id]?.exports ?? [],
            code: sources[id]?.code ?? '',
          } as unknown as Rolldown.ModuleInfo)
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
  const sources: Record<string, Source> = {
    [LEARN]: {
      exports: ['HoldingConditions'],
      code: "export { HoldingConditions } from './components/holding-conditions';",
    },
    [HOLDING]: { exports: ['HoldingConditions'], code: 'export function HoldingConditions() {}' },
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
    expect(names(contextOf(graph, sources), [LEARN, HOLDING, COLLAPSIBLE])).toEqual({
      [LEARN]: null,
      [HOLDING]: null,
      [COLLAPSIBLE]: null,
    });
  });

  it('a module reached from the entry by another path stays in the group', () => {
    const ctx = contextOf({ ...graph, [TODAY]: [BUTTON, ZOD, COLLAPSIBLE] }, sources);
    expect(names(ctx, [COLLAPSIBLE, HOLDING])).toEqual({ [COLLAPSIBLE]: 'today', [HOLDING]: null });
  });

  it("takes another feature's module that the entry names through its barrel, and only that one", () => {
    const ctx = contextOf(
      { ...graph, [SHELL]: [TODAY], [TODAY]: [BUTTON, LEARN], [LEARN]: [WHY, HOLDING], [WHY]: [BUTTON] },
      {
        [TODAY]: { exports: ['TodayScreen'], code: "import { WhyLink } from '../../learn';" },
        [LEARN]: {
          exports: ['WhyLink', 'HoldingConditions'],
          code: "export { HoldingConditions } from './components/holding-conditions';\nexport { WhyLink } from './components/why-link';",
        },
        [WHY]: { exports: ['WhyLink'], code: 'export function WhyLink() {}' },
        [HOLDING]: { exports: ['HoldingConditions'], code: 'export function HoldingConditions() {}' },
      },
    );
    expect(names(ctx, [LEARN, WHY, HOLDING, COLLAPSIBLE])).toEqual({
      [LEARN]: 'today',
      [WHY]: 'today',
      [HOLDING]: null,
      [COLLAPSIBLE]: null,
    });
  });

  it("walks every import of another feature's module read for its effects or re-exporting all", () => {
    const ctx = contextOf(
      { ...graph, [TODAY]: [LEARN], [LEARN]: [HOLDING] },
      {
        [TODAY]: { exports: [], code: "import '../../learn';" },
        [LEARN]: { exports: [], code: "export * from './components/holding-conditions';" },
        [HOLDING]: { exports: ['HoldingConditions'], code: 'export function HoldingConditions() {}' },
      },
    );
    expect(names(ctx, [LEARN, HOLDING, COLLAPSIBLE])).toEqual({
      [LEARN]: 'today',
      [HOLDING]: 'today',
      [COLLAPSIBLE]: 'today',
    });
  });

  /** Today's screen importing Learn through `today`, with the barrel's two re-exports in `learn`. */
  const throughLearn = (today: string, learn: string, why: string[]) =>
    contextOf(
      {
        [ENTRY]: [SHELL],
        [SHELL]: [TODAY],
        [TODAY]: [LEARN],
        [LEARN]: [WHY, HOLDING],
        [WHY]: [REACT_DOM],
        [HOLDING]: [COLLAPSIBLE],
        [REACT_DOM]: [],
        [COLLAPSIBLE]: [],
      },
      {
        [TODAY]: { exports: ['TodayScreen'], code: today },
        [LEARN]: { exports: ['WhyLink', 'HoldingConditions', 'default'], code: learn },
        [WHY]: { exports: why, code: 'export default function WhyLink() {}' },
        [HOLDING]: { exports: ['HoldingConditions'], code: 'export function HoldingConditions() {}' },
      },
    );

  it("takes another feature's module that Today imports by default", () => {
    const ctx = contextOf(
      { [ENTRY]: [SHELL], [SHELL]: [TODAY], [TODAY]: [WHY], [WHY]: [REACT_DOM], [REACT_DOM]: [] },
      {
        [TODAY]: { exports: ['TodayScreen'], code: "import WhyLink from '../../learn/components/why-link';" },
        [WHY]: { exports: ['default'], code: 'export default function WhyLink() {}' },
      },
    );
    expect(names(ctx, [TODAY, WHY, REACT_DOM])).toEqual({ [TODAY]: 'today', [WHY]: 'today', [REACT_DOM]: 'today' });
  });

  it('follows a default through a barrel, by default import and by a named re-export of it', () => {
    const learn = "export { HoldingConditions } from './components/holding-conditions';\n";
    for (const [today, reexport] of [
      ["import WhyLink from '../../learn';", "export { default } from './components/why-link';"],
      ["import { WhyLink } from '../../learn';", "export { default as WhyLink } from './components/why-link';"],
    ]) {
      const ctx = throughLearn(today ?? '', learn + reexport, ['default']);
      expect(names(ctx, [LEARN, WHY, REACT_DOM, HOLDING])).toEqual({
        [LEARN]: 'today',
        [WHY]: 'today',
        [REACT_DOM]: 'today',
        [HOLDING]: null,
      });
    }
  });

  it('asks a renamed import for its source name, and a renamed re-export for the name its target exports', () => {
    const renamedImport = throughLearn(
      "import { WhyLink as Why } from '../../learn';",
      "export { HoldingConditions } from './components/holding-conditions';\nexport { WhyLink } from './components/why-link';",
      ['WhyLink'],
    );
    const renamedExport = throughLearn(
      "import { WhyLink } from '../../learn';",
      "export { Conditions as HoldingConditions } from './components/holding-conditions';\nexport { HoldingConditions as WhyLink } from './components/why-link';",
      ['HoldingConditions'],
    );
    expect(names(renamedImport, [WHY, REACT_DOM, HOLDING])).toEqual({
      [WHY]: 'today',
      [REACT_DOM]: 'today',
      [HOLDING]: null,
    });
    // The barrel also exports the name `why-link` exports, from `holding-conditions`: an over-count
    // may take that module too, but the one Today runs must be in the group.
    expect(names(renamedExport, [WHY, REACT_DOM])).toEqual({ [WHY]: 'today', [REACT_DOM]: 'today' });
  });

  it('walks a namespace import, and a statement it cannot read, whole', () => {
    const learn =
      "export { HoldingConditions } from './components/holding-conditions';\nexport { WhyLink } from './components/why-link';";
    for (const today of [
      "import * as learn from '../../learn';\nlearn.WhyLink;",
      "import { /* the link */ WhyLink } from '../../learn';",
    ]) {
      const ctx = throughLearn(today, learn, ['WhyLink']);
      expect(names(ctx, [LEARN, WHY, HOLDING, COLLAPSIBLE])).toEqual({
        [LEARN]: 'today',
        [WHY]: 'today',
        [HOLDING]: 'today',
        [COLLAPSIBLE]: 'today',
      });
    }
  });
});

/** The guard's error for chunks that each import the named files, `null` when it passes them. */
function guardError(imports: Record<string, string[]>): string | null {
  const bundle = Object.fromEntries(
    Object.entries(imports).map(([fileName, deps]) => [fileName, { type: 'chunk', fileName, imports: deps }]),
  );
  const hook = noChunkCycles().generateBundle;
  if (typeof hook !== 'function') throw new Error('expected a generateBundle function');
  let message: string | null = null;
  const context = {
    error(text: string): never {
      message = text;
      throw new Error(text);
    },
  };
  try {
    hook.call(context as never, {} as never, bundle as never, false);
  } catch {
    // The message is what the test reads.
  }
  return message;
}

describe('noChunkCycles', () => {
  it('passes chunks whose static imports form no cycle', () => {
    expect(
      guardError({ 'app.js': ['today.js', 'why-link.js'], 'why-link.js': ['today.js'], 'today.js': [] }),
    ).toBeNull();
  });

  it('fails the build on chunks that import each other, naming the cycle', () => {
    expect(guardError({ 'app.js': ['today.js'], 'today.js': ['why-link.js'], 'why-link.js': ['today.js'] })).toBe(
      'static import cycle between chunks: today.js -> why-link.js -> today.js',
    );
  });
});
