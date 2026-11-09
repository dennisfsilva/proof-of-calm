import { resolve } from 'node:path';
import type { StorybookConfig } from '@storybook/react-vite';

// Storybook for packages/app (ADR-0045 §12): the feature screens' stories, each run as a browser test
// with axe by the Vitest addon (vitest.config.ts). The Vite plugins are the hosts' client ones
// (packages/config/vite): the Learn modules' pipeline (ADR-0048) over the fixture folder, React with the
// compiler through Babel and with `.mdx` in its `include`, as the hosts have it, Tailwind, the precompiled
// messages (§8) and the guard that fails the build when a story reaches a server module (§11).
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  core: { disableTelemetry: true },
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import('vite');
    const { default: react, reactCompilerPreset } = await import('@vitejs/plugin-react');
    const { default: babel } = await import('@rolldown/plugin-babel');
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    const { clientNeverImportsServer, learnPlugins, MODULE_BODY_ELEMENTS, precompileMessagesPlugin } = await import(
      '@proofofcalm/config/vite'
    );
    const { parseModule } = await import('@proofofcalm/content/modules');
    return mergeConfig(viteConfig, {
      plugins: [
        ...learnPlugins({
          dir: resolve(import.meta.dirname, '../src/features/learn/fixtures'),
          parseModule,
          elements: MODULE_BODY_ELEMENTS,
        }),
        react({ include: /\.(mdx|[tj]sx?)$/ }),
        babel({ presets: [reactCompilerPreset()] }),
        tailwindcss(),
        precompileMessagesPlugin(),
        clientNeverImportsServer(),
      ],
    });
  },
};

export default config;
