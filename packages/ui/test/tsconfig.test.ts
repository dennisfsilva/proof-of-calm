import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

// TypeScript reads an include entry whose last part holds a dot as a file name, not a folder, so an
// entry of ".storybook" matched nothing and `pnpm typecheck` never checked the Storybook config.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

it('type-checks every TypeScript file of the Storybook configuration', () => {
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    },
  };
  const config = ts.getParsedCommandLineOfConfigFile(path.join(root, 'tsconfig.json'), {}, host);
  const checked = (config?.fileNames ?? []).map((file) => path.relative(root, file).replaceAll('\\', '/'));
  const storybook = readdirSync(path.join(root, '.storybook'))
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => `.storybook/${name}`);
  expect(storybook).toEqual(expect.arrayContaining(['.storybook/main.ts', '.storybook/preview.tsx']));
  expect(checked).toEqual(expect.arrayContaining(storybook));
});
