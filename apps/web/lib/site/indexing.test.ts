import { describe, expect, it } from 'vitest';
import { indexFiles, PUBLIC_INDEXABLE, PUBLIC_PREFIX } from './indexing';

// The switch to indexing the public pages (ADR-0045 Deviations of 2026-11-15): off until the owner's launch.

const ORIGIN = 'https://proofofcalm.com';

describe('indexing', () => {
  it('is off, and the public pages live under /en/ (docs/GROWTH.md §2.6)', () => {
    expect(PUBLIC_INDEXABLE).toBe(false);
    expect(PUBLIC_PREFIX).toBe('/en/');
  });

  it('writes no sitemap.xml and no robots.txt while off', () => {
    expect(indexFiles(false, ORIGIN, ['/en/learn'])).toEqual([]);
  });

  it('once on, lists every public page in sitemap.xml and names it in robots.txt', () => {
    const [sitemap, robots, ...rest] = indexFiles(true, ORIGIN, ['/en/learn', '/en/learn/noise']);
    expect(rest).toEqual([]);
    expect(sitemap?.file).toBe('sitemap.xml');
    expect(sitemap?.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemap?.text).toContain('<url><loc>https://proofofcalm.com/en/learn</loc></url>');
    expect(sitemap?.text).toContain('<url><loc>https://proofofcalm.com/en/learn/noise</loc></url>');
    expect(robots).toEqual({
      file: 'robots.txt',
      text: 'User-agent: *\nAllow: /\n\nSitemap: https://proofofcalm.com/sitemap.xml\n',
    });
  });
});
