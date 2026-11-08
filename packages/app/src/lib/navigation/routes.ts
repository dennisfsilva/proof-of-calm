// The app's routes, one per screen (ADR-0045 §1 and §9). This module imports nothing: the build
// scripts (apps/web/scripts, the worker's define) load it under plain `node` through the export
// `@proofofcalm/app/lib/navigation/routes`, and the vercel.json writer, the worker's navigation
// allowlist and the router read the same list.
export const APP_ROUTES = ['today', 'portfolio', 'log', 'plan', 'settings', 'learn', 'onboarding'] as const;

export type AppRoute = (typeof APP_ROUTES)[number];
