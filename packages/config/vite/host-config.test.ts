import { resolve } from 'node:path';
import type { PluginOption } from 'vite';
import { describe, expect, it } from 'vitest';
import { createHostConfig } from './host-config.ts';

/** The names of the plugins in a config, nested arrays flattened (the React plugin returns several). */
function pluginNames(plugins: PluginOption[] | undefined): string[] {
  const names: string[] = [];
  const visit = (option: PluginOption): void => {
    if (Array.isArray(option)) for (const inner of option) visit(inner);
    else if (option && typeof option === 'object' && 'name' in option) names.push(option.name);
  };
  for (const option of plugins ?? []) visit(option);
  return names;
}

const OWN = [
  'poc:precompile-messages',
  'poc:client-never-imports-server',
  'poc:font-preload',
  'poc:no-chunk-cycles',
  'poc:boot-script',
];
const parseModule = () => ({ ok: false as const, error: [] });

describe('createHostConfig', () => {
  it('web: React with the compiler through Babel, Tailwind, the five plugins and the chunk report, app.html, no inlined assets', () => {
    const config = createHostConfig({ host: 'web', root: '/repo/apps/web', parseModule, env: {} });
    const names = pluginNames(config.plugins);
    for (const name of OWN) expect(names).toContain(name);
    expect(names.some((name) => name.includes('react'))).toBe(true);
    expect(names.some((name) => name.includes('babel'))).toBe(true);
    expect(names.some((name) => name.includes('tailwindcss'))).toBe(true);
    expect(names.indexOf('poc:boot-script')).toBe(names.length - 1);
    expect(names).toContain('poc:chunk-report');
    expect(config.root).toBe('/repo/apps/web');
    expect(config.build?.assetsInlineLimit).toBe(0);
    expect(config.build?.rolldownOptions?.input).toBe(resolve('/repo/apps/web', 'app.html'));
    expect(config.define).toEqual({
      'import.meta.env.VITE_API_BASE': '""',
      'import.meta.env.VITE_SERVICE_WORKER': '"on"',
      __POC_LANGUAGES__: '"visible"',
    });
  });

  it('mobile: index.html, the absolute API origin, no service worker and no chunk report (ADR-0045 §10)', () => {
    const config = createHostConfig({ host: 'mobile', root: '/repo/apps/mobile', parseModule, env: {} });
    expect(pluginNames(config.plugins)).toEqual(expect.arrayContaining(OWN));
    expect(pluginNames(config.plugins)).not.toContain('poc:chunk-report');
    expect(config.build?.rolldownOptions?.input).toBe(resolve('/repo/apps/mobile', 'index.html'));
    expect(config.define).toEqual({
      'import.meta.env.VITE_API_BASE': '"https://proofofcalm.com"',
      'import.meta.env.VITE_SERVICE_WORKER': '"off"',
      __POC_LANGUAGES__: '"visible"',
    });
  });

  // The language picker's flag (ADR-0023, Deviations of 2026-11-18): only Vercel's own VERCEL_ENV lists the
  // preview languages, and only on the web host's preview and development deployments; anything else, a stray
  // VITE_* variable included (Vite hands every one to import.meta.env), gives English alone.
  describe('the languages flag', () => {
    const flag = (host: 'web' | 'mobile', env: Record<string, string | undefined>) =>
      createHostConfig({ host, root: `/repo/apps/${host}`, parseModule, env }).define?.__POC_LANGUAGES__;

    it("lists the preview languages on the web host's preview and development deployments", () => {
      expect(flag('web', { VERCEL_ENV: 'preview' })).toBe('"listed"');
      expect(flag('web', { VERCEL_ENV: 'development' })).toBe('"listed"');
    });

    it('keeps them hidden in production, without VERCEL_ENV, on the mobile host and for any other value', () => {
      expect(flag('web', { VERCEL_ENV: 'production' })).toBe('"visible"');
      expect(flag('web', {})).toBe('"visible"');
      expect(flag('web', { VERCEL_ENV: '' })).toBe('"visible"');
      expect(flag('web', { VERCEL_ENV: 'Preview' })).toBe('"visible"');
      expect(flag('mobile', { VERCEL_ENV: 'preview' })).toBe('"visible"');
      expect(flag('mobile', { VERCEL_ENV: 'development' })).toBe('"visible"');
    });

    it('ignores a stray VITE_* variable on a production build', () => {
      const env = {
        VERCEL_ENV: 'production',
        VITE_LANGUAGES: 'listed',
        VITE_POC_LANGUAGES: 'listed',
        VITE_VERCEL_ENV: 'preview',
      };
      const config = createHostConfig({ host: 'web', root: '/repo/apps/web', parseModule, env });
      expect(config.define?.__POC_LANGUAGES__).toBe('"visible"');
      // The flag is no import.meta.env key, so no VITE_* variable can stand in for it.
      expect(Object.keys(config.define ?? {}).filter((key) => /LANGUAGE/i.test(key))).toEqual(['__POC_LANGUAGES__']);
    });

    it("reads process.env when no env is given (the hosts' vite.config.ts)", () => {
      const before = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'preview';
      try {
        expect(createHostConfig({ host: 'web', root: '/repo/apps/web', parseModule }).define?.__POC_LANGUAGES__).toBe(
          '"listed"',
        );
      } finally {
        if (before === undefined) delete process.env.VERCEL_ENV;
        else process.env.VERCEL_ENV = before;
      }
    });
  });

  it("both hosts carry the code-splitting groups that keep Today's static modules together", () => {
    for (const host of ['web', 'mobile'] as const) {
      const output = createHostConfig({ host, root: `/repo/apps/${host}`, parseModule }).build?.rolldownOptions?.output;
      const splitting = output && !Array.isArray(output) ? output.codeSplitting : undefined;
      if (typeof splitting !== 'object') throw new Error(`${host}: expected codeSplitting groups`);
      expect(splitting.groups?.map((group) => group.debugName)).toEqual(['today']);
    }
  });

  it("puts a hidden language's message chunks under assets/messages/<locale>/, English's and the rest under assets/", () => {
    const output = createHostConfig({ host: 'web', root: '/repo/apps/web', parseModule }).build?.rolldownOptions
      ?.output;
    const name = output && !Array.isArray(output) ? output.chunkFileNames : undefined;
    if (typeof name !== 'function') throw new Error('expected a chunkFileNames function');
    const chunk = (facadeModuleId: string | null) => ({ facadeModuleId }) as Parameters<typeof name>[0];
    expect(name(chunk('/repo/packages/app/src/messages/pt-PT/learn.json'))).toBe(
      'assets/messages/pt-PT/[name]-[hash].js',
    );
    expect(name(chunk('C:\\repo\\packages\\app\\src\\messages\\de\\log.json'))).toBe(
      'assets/messages/de/[name]-[hash].js',
    );
    expect(name(chunk('/repo/packages/app/src/messages/en/learn.json'))).toBe('assets/[name]-[hash].js');
    // A language's content chunks join them (ADR-0057); English content keeps assets/.
    expect(name(chunk('/repo/packages/content/rules/pt-PT/pt.json'))).toBe('assets/messages/pt-PT/[name]-[hash].js');
    expect(name(chunk('C:\\repo\\packages\\content\\i18n\\pt-PT\\jurisdictions\\pt.json'))).toBe(
      'assets/messages/pt-PT/[name]-[hash].js',
    );
    expect(name(chunk('/repo/packages/content/i18n/de/templates/steady.json'))).toBe(
      'assets/messages/de/[name]-[hash].js',
    );
    // A translated Learn module's chunk and its language's metadata module (ADR-0048 Deviations); English modules keep
    // assets/.
    expect(name(chunk('C:\\repo\\packages\\content\\i18n\\pt-PT\\learn\\start-here.mdx'))).toBe(
      'assets/messages/pt-PT/[name]-[hash].js',
    );
    expect(name(chunk('\0virtual:learn-meta/pt-PT'))).toBe('assets/messages/pt-PT/learn-meta-[hash].js');
    expect(name(chunk('\0virtual:learn-meta/de'))).toBe('assets/messages/de/learn-meta-[hash].js');
    expect(name(chunk('/repo/packages/content/learn/start-here.mdx'))).toBe('assets/[name]-[hash].js');
    expect(name(chunk('/repo/packages/content/rules/pt.json'))).toBe('assets/[name]-[hash].js');
    expect(name(chunk('/repo/packages/content/rules/locales.json'))).toBe('assets/[name]-[hash].js');
    expect(name(chunk('/repo/packages/content/jurisdictions/pt.json'))).toBe('assets/[name]-[hash].js');
    expect(name(chunk('/repo/packages/app/src/features/learn/index.ts'))).toBe('assets/[name]-[hash].js');
    expect(name(chunk(null))).toBe('assets/[name]-[hash].js');
  });

  it('the MDX plugins run before react (ADR-0048)', () => {
    const names = pluginNames(createHostConfig({ host: 'web', root: '/repo/apps/web', parseModule }).plugins);
    const react = names.findIndex((name) => name.includes('react'));
    for (const name of ['poc:learn-front-matter', '@mdx-js/rollup', 'poc:learn-modules']) {
      expect(names).toContain(name);
      expect(names.indexOf(name)).toBeLessThan(react);
    }
    expect(names.indexOf('poc:learn-front-matter')).toBeLessThan(names.indexOf('@mdx-js/rollup'));
  });
});
