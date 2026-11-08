import type { StorybookConfig } from '@storybook/react-vite';

// Storybook for packages/ui (ADR-0024, on Vite without Next since ADR-0045): the stories are the
// contract for every component, and the Vitest addon runs each one as a browser test with axe
// (vitest.config.ts). The framework adds no React plugin of its own, so viteFinal adds it, with the
// React Compiler through Babel as in the hosts (ADR-0045 §12; src/lib/react-compiler.stories.tsx
// proves it runs).
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
    const { clientNeverImportsServer } = await import('@proofofcalm/config/vite');
    // The same guard as the hosts' client builds (ADR-0045 §11): a story that reaches a server module
    // fails the Storybook build, as it would the app's.
    return mergeConfig(viteConfig, {
      plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), clientNeverImportsServer()],
    });
  },
};

export default config;
