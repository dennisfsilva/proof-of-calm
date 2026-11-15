/// <reference path="../learn-modules.d.ts" />
import { LEARN_BODIES, LEARN_MODULES } from 'virtual:learn-modules';
import type { LearnModuleMeta } from '@proofofcalm/content';
import { pastFalls } from '../../../lib/services/red-day-model';
import type { PastFall } from '../../../lib/services/red-day-types';
import { DRAWDOWN_COINS } from '../components/module-chart';
import type { ModuleViewProps } from '../components/module-view';

// What the static Learn pages read, loaded before the web host's prerender renders them: a static render cannot
// suspend on a lazy body or wait for the cycles file, so every body is awaited here.

export type Body = ModuleViewProps['Body'];

export type LearnSite = {
  readonly modules: readonly LearnModuleMeta[];
  /** Every module's body by its slug. */
  readonly bodies: ReadonlyMap<string, Body>;
  /** The cycles file's rows of every coin it holds, in its order, for a module's chart. */
  readonly falls: readonly PastFall[];
};

export async function loadLearnSite(): Promise<LearnSite> {
  const [bodies, falls] = await Promise.all([
    Promise.all(Object.entries(LEARN_BODIES).map(async ([slug, load]) => [slug, (await load()).default] as const)),
    pastFalls(DRAWDOWN_COINS),
  ]);
  return { modules: LEARN_MODULES, bodies: new Map(bodies), falls };
}
