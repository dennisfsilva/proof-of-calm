// The day the public pages are rendered at, read before any build step (scripts/build.ts): lib/site/today.ts parses
// `SITE_TODAY` with core's calendar module, which plain node cannot load, so Vite's module runner imports it. The
// runner sets NODE_ENV to `development` when it is unset, and the client build after it would then be a development
// one, whose shell never registers the worker (src/main.tsx reads import.meta.env.PROD): NODE_ENV is put back.
import { join } from 'node:path';
import { runnerImport } from 'vite';

type Today = typeof import('../lib/site/today.ts');

export async function loadSiteToday(
  root: string,
  value: string | undefined,
  now: Date,
): Promise<ReturnType<Today['siteToday']>> {
  const nodeEnv = process.env.NODE_ENV;
  try {
    const { module } = await runnerImport<Today>(join(root, 'lib/site/today.ts'), {
      root,
      configFile: false,
      logLevel: 'warn',
    });
    return module.siteToday(value, now);
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
  }
}
