/// <reference types="vite/client" />

/** Defined by the hosts' Vite factory (packages/config/vite/host-config.ts): the API's absolute origin. */
interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
}

/** Defined by the same factory from VERCEL_ENV alone, `visible` on this host (ADR-0023, Deviations of 2026-11-18). */
declare const __POC_LANGUAGES__: import('@proofofcalm/app/lib/i18n').LanguagesFlag;
