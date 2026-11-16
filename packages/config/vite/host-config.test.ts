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
    const config = createHostConfig({ host: 'web', root: '/repo/apps/web', parseModule });
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
    });
  });

  it('mobile: index.html, the absolute API origin, no service worker and no chunk report (ADR-0045 §10)', () => {
    const config = createHostConfig({ host: 'mobile', root: '/repo/apps/mobile', parseModule });
    expect(pluginNames(config.plugins)).toEqual(expect.arrayContaining(OWN));
    expect(pluginNames(config.plugins)).not.toContain('poc:chunk-report');
    expect(config.build?.rolldownOptions?.input).toBe(resolve('/repo/apps/mobile', 'index.html'));
    expect(config.define).toEqual({
      'import.meta.env.VITE_API_BASE': '"https://proofofcalm.com"',
      'import.meta.env.VITE_SERVICE_WORKER': '"off"',
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
