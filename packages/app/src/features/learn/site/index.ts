// The Learn pages the web host prerenders as static HTML with no script (ADR-0048 Deviations of 2026-11-15), exported
// as `@proofofcalm/app/features/learn/site`. The app never imports this folder: its Learn screens are the lazy chunk.
export { type Body, type LearnSite, loadLearnSite } from './load';
export { SiteLearnIndex, type SiteLearnIndexProps, SiteModulePage, type SiteModulePageProps } from './modules';
export { type SiteLinks, StaticLearn, type StaticLearnProps } from './static';
