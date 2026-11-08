import { describe, expect, it } from 'vitest';
import { clientNeverImportsServer, isServerModule } from './client-never-imports-server.ts';
import { buildFixture, SERVER_ONLY_PACKAGE } from './fixture.ts';

const page =
  '<!doctype html>\n<html><head><script type="module" src="/entry.ts"></script></head><body></body></html>\n';
const entry = "import { key } from './prices.ts';\ndocument.title = key;\n";

describe('clientNeverImportsServer', () => {
  it('fails the client build of an entry that reaches server-only, naming the importer', async () => {
    const files = {
      ...SERVER_ONLY_PACKAGE,
      'index.html': page,
      'entry.ts': entry,
      'prices.ts': "import 'server-only';\nexport const key = 'secret';\n",
    };
    await expect(buildFixture(files, [clientNeverImportsServer()])).rejects.toThrow(
      /Client build resolved server-only, imported by [^\n]*prices\.ts/,
    );
  });

  it('fails without the guard only at run time: the installed package resolves and bundles', async () => {
    const files = {
      ...SERVER_ONLY_PACKAGE,
      'index.html': page,
      'entry.ts': entry,
      'prices.ts': "import 'server-only';\nexport const key = 'secret';\n",
    };
    const html = await buildFixture(files, []);
    expect(html).toMatch(/<script type="module" crossorigin src="\/assets\/index-[^"]+\.js">/);
  });

  it('fails the client build of a relative import under server/, naming the importer', async () => {
    const files = {
      'index.html': page,
      'entry.ts': entry,
      'prices.ts': "import { key } from './server/api.ts';\nexport { key };\n",
      'server/api.ts': "export const key = 'secret';\n",
    };
    await expect(buildFixture(files, [clientNeverImportsServer()])).rejects.toThrow(
      /Client build resolved \.\/server\/api\.ts, imported by [^\n]*prices\.ts/,
    );
  });

  it('fails the client build of a relative import under lib/server/, naming the importer', async () => {
    const files = {
      'index.html': page,
      'entry.ts': entry,
      'prices.ts': "import { key } from './lib/server/x.ts';\nexport { key };\n",
      'lib/server/x.ts': "export const key = 'secret';\n",
    };
    await expect(buildFixture(files, [clientNeverImportsServer()])).rejects.toThrow(
      /Client build resolved \.\/lib\/server\/x\.ts, imported by [^\n]*prices\.ts/,
    );
  });

  it('passes the same fixture without that import', async () => {
    const files = {
      ...SERVER_ONLY_PACKAGE,
      'index.html': page,
      'entry.ts': entry,
      'prices.ts': "export const key = 'public';\n",
    };
    const html = await buildFixture(files, [clientNeverImportsServer()]);
    expect(html).toMatch(/<script type="module" crossorigin src="\/assets\/index-[^"]+\.js">/);
  });

  it.each([
    'server-only',
    '@upstash/redis',
    '@vercel/functions',
    '@vercel/functions/oidc',
    '../lib/server/prices.ts',
    './server/api.ts',
    'P:/dev/apps/web/server/api.ts',
  ])('refuses %s', (id) => {
    expect(isServerModule(id)).toBe(true);
  });

  it.each(['react', 'react-dom/server', 'use-intl', './lib/serve.ts', 'server-only-polyfill'])(
    'lets %s through',
    (id) => {
      expect(isServerModule(id)).toBe(false);
    },
  );

  it('applies to the client environment only', () => {
    const plugin = clientNeverImportsServer();
    const applies = plugin.applyToEnvironment as (environment: { name: string }) => boolean;
    expect(applies({ name: 'client' })).toBe(true);
    expect(applies({ name: 'ssr' })).toBe(false);
  });
});
