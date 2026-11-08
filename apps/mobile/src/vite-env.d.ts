/// <reference types="vite/client" />

/** Defined by the hosts' Vite factory (packages/config/vite/host-config.ts): the API's absolute origin. */
interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
}
