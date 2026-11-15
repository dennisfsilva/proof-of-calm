import { APP_ROUTES } from '@proofofcalm/app/lib/navigation/routes';
import { describe, expect, it } from 'vitest';
import { PUBLIC_PAGES, shellRoutes } from './shell-navigation';

// The navigations the worker answers from the precached shell (ADR-0045 §5), the way Serwist's navigation route
// reads its lists: the denylist first, then the allowlist.
const fromShell = (path: string) => !PUBLIC_PAGES.test(path) && shellRoutes(APP_ROUTES).test(path);

describe('the worker’s shell navigations', () => {
  it('answers every product route from the shell', () => {
    for (const path of ['/today', '/learn', '/learn/risk-honestly', '/plan/review', '/settings?x=1']) {
      expect(fromShell(path), path).toBe(true);
    }
  });

  it('never answers a public page under /en/ from the shell', () => {
    for (const path of ['/en/', '/en/learn', '/en/learn/risk-honestly', '/en/learn?x=1', '/en/today']) {
      expect(fromShell(path), path).toBe(false);
    }
  });

  it('leaves the site pages to the network', () => {
    for (const path of ['/', '/terms', '/risk', '/learning', '/~offline']) expect(fromShell(path), path).toBe(false);
  });
});
