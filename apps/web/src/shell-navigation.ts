// The navigations the worker answers from the precached shell (ADR-0045 §5): the product's routes, and never a
// public page under PUBLIC_PREFIX, which is a prerendered file of its own (ADR-0045 Deviations of 2026-11-15).
import { PUBLIC_PREFIX } from '../lib/site/indexing';

/** The product's routes, a path or a query after them, as vercel.json rewrites them to the shell (§1). */
export const shellRoutes = (routes: readonly string[]): RegExp => new RegExp(`^/(?:${routes.join('|')})(?:[/?]|$)`);

/** The public pages: the worker's denylist, which Serwist reads before the allowlist. */
export const PUBLIC_PAGES = new RegExp(`^${PUBLIC_PREFIX}`);
