// Whether the public pages may be indexed, and what the build writes once they may (ADR-0045, Deviations of
// 2026-11-15; docs/GROWTH.md §2.6 and §4.1). The switch is this flag, then `node scripts/vercel-config.ts --write`:
// the public pages lose the X-Robots-Tag header and the robots meta, and the build writes sitemap.xml and
// robots.txt. `/`, the legal pages and the app stay noindex either way. Plain node loads this module.

/** False until the owner's launch (docs/RELEASE.md): every page keeps the noindex header and meta. */
export const PUBLIC_INDEXABLE = false as const;

/** Where the public pages live; the app's screens keep their own paths, such as `/learn` and `/today`. */
export const PUBLIC_PREFIX = '/en/';

export type IndexFile = { file: string; text: string };

/** sitemap.xml with every public page and robots.txt naming it; nothing while the pages are not indexable. */
export function indexFiles(indexable: boolean, origin: string, paths: readonly string[]): IndexFile[] {
  if (!indexable) return [];
  const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`);
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ];
  return [
    { file: 'sitemap.xml', text: sitemap.join('\n') },
    { file: 'robots.txt', text: `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n` },
  ];
}
