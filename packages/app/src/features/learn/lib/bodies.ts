/// <reference path="../learn-modules.d.ts" />
import { LEARN_BODIES } from 'virtual:learn-modules';
import { lazy } from 'react';

// One lazy component per slug, at module level as `lazy` requires, for the route and the sheet alike: each
// renders it under a `Suspense` of its own.
const BODIES = new Map(Object.entries(LEARN_BODIES).map(([slug, load]) => [slug, lazy(load)]));

/** The lazy body of a module, or `undefined` for a slug no module has. */
export const moduleBody = (slug: string) => BODIES.get(slug);
