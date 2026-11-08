// The hosts' Vite factory and its plugins (ADR-0045 §3, §7, §8, §11 and §12); `@proofofcalm/config/vite`.
export { BOOT_SCRIPT, BOOT_SCRIPT_HASH } from './boot.ts';
export { bootScriptPlugin, withBootScript } from './boot-plugin.ts';
export type { ChunkReport } from './chunk-report-plugin.ts';
export { clientNeverImportsServer, isServerModule } from './client-never-imports-server.ts';
export { type FontPreloadOptions, fontPreloadPlugin } from './font-preload-plugin.ts';
export { sha256 } from './hash.ts';
export { createHostConfig, type Host, type HostConfigOptions } from './host-config.ts';
export {
  blankFrontMatter,
  closedBody,
  LEARN_MODULES_ID,
  type LearnPluginOptions,
  learnPlugins,
  type ParseModule,
} from './learn-plugin.ts';
export {
  type CompiledMessages,
  compileMessages,
  FORMAT_ONLY_ALIAS,
  MESSAGES_FILE,
  messagesModule,
  precompileMessagesPlugin,
} from './precompile-messages-plugin.ts';
