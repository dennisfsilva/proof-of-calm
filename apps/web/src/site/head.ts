// The head every prerendered site page shares (ADR-0045 §6): the same metadata as app.html, the
// title, and the stylesheet and font preload copied from the built document, so the pages share the
// hashed CSS and font files. No script element, except the theme script on the offline page, which
// the worker serves in place of the app (ADR-0045, the deviation of 2026-10-19; docs/DESIGN.md §3).
import { BRAND } from '@proofofcalm/app/lib/brand';
import { THEME_BEFORE_PAINT } from '@proofofcalm/app/lib/theme';
import { escapeHtml } from '../../lib/geo/uk-block';
import colours from '../../lib/pwa/brand-colors.json';

const FONT_PRELOAD = /<link\b[^>]*\brel="preload"[^>]*\bas="font"[^>]*>/;
const STYLESHEET = /<link\b[^>]*\brel="stylesheet"[^>]*>/;

/**
 * The font preload and the stylesheet link of the built `app.html`, in that order; the build fails
 * when either is missing, because the site pages would otherwise render unstyled.
 */
export function headAssets(appHtml: string): string[] {
  const preload = FONT_PRELOAD.exec(appHtml)?.[0];
  const stylesheet = STYLESHEET.exec(appHtml)?.[0];
  if (preload === undefined) throw new Error('the built app.html has no font preload link');
  if (stylesheet === undefined) throw new Error('the built app.html has no stylesheet link');
  return [preload, stylesheet];
}

/** The page title: the product's name alone on the holding page, `<title> · <product>` elsewhere. */
export function pageTitle(title: string | null): string {
  return title === null ? BRAND.name : `${title} · ${BRAND.name}`;
}

type PageHead = {
  title: string | null;
  assets: readonly string[];
  /** The offline page alone: the same inline theme script as app.html, whose hash is in `script-src`. */
  themeScript?: boolean;
};

/** The inner HTML of a site page's head (docs/DESIGN.md §9 for the icons and the theme colours). */
export function pageHead({ title, assets, themeScript = false }: PageHead): string {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    ...(themeScript ? [`<script>${THEME_BEFORE_PAINT}</script>`] : []),
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${escapeHtml(pageTitle(title))}</title>`,
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">',
    '<link rel="manifest" href="/manifest.webmanifest">',
    `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${colours.light.background}">`,
    `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${colours.dark.background}">`,
    ...assets,
  ].join('\n');
}
