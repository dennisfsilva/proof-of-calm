// Writes the app icons of docs/DESIGN.md §9 into apps/web/public from the mark (mark.ts) and the brand
// colours (apps/web/lib/pwa/brand-colors.json, pinned to the tokens by a test). Deterministic: run it
// again after a change to either, and review the images.
//   node tools/icons/generate.ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import colours from '../../apps/web/lib/pwa/brand-colors.json' with { type: 'json' };
import { BRAND } from '../../packages/app/src/lib/brand/index.ts';
import { type MarkOptions, markShapes, type Rgba, renderMark } from './mark.ts';
import { encodeIco, encodePng } from './png.ts';

export function rgba(hex: string): Rgba {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new RangeError(`${hex} is not a #rrggbb colour`);
  return [
    Number.parseInt(match[1] ?? '', 16),
    Number.parseInt(match[2] ?? '', 16),
    Number.parseInt(match[3] ?? '', 16),
    255,
  ];
}

const PAPER = {
  background: rgba(colours.light.background),
  ring: rgba(colours.light.ink),
  dot: rgba(colours.light.accent),
};
const ANY: MarkOptions = { diameter: 0.8, dot: 1.2 };
/** Inside the central 80 % circle that a maskable icon keeps whatever the launcher's shape. */
const MASKABLE: MarkOptions = { diameter: 0.7, dot: 1.2 };
/** Small favicons get a larger dot so that it stays visible at 16 px. */
const FAVICON: MarkOptions = { diameter: 0.86, dot: 1.6 };

/** The adaptive favicon: the inks of the light and the dark theme, on no background. */
export function faviconSvg(): string {
  const { ring, dot } = markShapes(ANY);
  // rgb() of the same colours: the stylesheet lint allows colour functions, not hex, in markup.
  const css = (hex: string) => `rgb(${rgba(hex).slice(0, 3).join(' ')})`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    `<title>${BRAND.name}</title>`,
    `<style>.ring{fill:${css(colours.light.ink)}}.dot{fill:${css(colours.light.accent)}}@media (prefers-color-scheme:dark){.ring{fill:${css(colours.dark.ink)}}.dot{fill:${css(colours.dark.accent)}}}</style>`,
    `<path class="ring" d="${ring}"/>`,
    `<circle class="dot" cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}"/>`,
    '</svg>',
    '',
  ].join('\n');
}

export function icons(): Record<string, Buffer | string> {
  const png = (size: number, options: MarkOptions, palette: Parameters<typeof renderMark>[2] = PAPER) =>
    encodePng(size, size, renderMark(size, options, palette));
  const black: Rgba = [0, 0, 0, 255];
  return {
    'icons/icon-192.png': png(192, ANY),
    'icons/icon-512.png': png(512, ANY),
    'icons/icon-maskable-192.png': png(192, MASKABLE),
    'icons/icon-maskable-512.png': png(512, MASKABLE),
    // Monochrome icons are read for their alpha only (the system paints them).
    'icons/icon-monochrome-512.png': png(512, ANY, { background: null, ring: black, dot: black }),
    'apple-touch-icon.png': png(180, MASKABLE),
    'favicon.ico': encodeIco([16, 32, 48].map((size) => ({ size, png: png(size, FAVICON) }))),
    'favicon.svg': faviconSvg(),
  };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const publicDir = fileURLToPath(new URL('../../apps/web/public/', import.meta.url));
  for (const [name, content] of Object.entries(icons())) {
    writeFileSync(resolve(publicDir, name), content);
    console.log(`wrote apps/web/public/${name}`);
  }
}
