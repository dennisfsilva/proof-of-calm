// The one Vercel Function, at /api (ADR-0045 §2): the bundle that scripts/bundle-api.ts writes.
export { default } from '../server-dist/api.mjs';
