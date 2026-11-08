import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { manifest } from './manifest';

// What Chrome's install criteria and ADR-0033 ask of the manifest, as a schema; and every icon it names
// exists in public/ at the size it claims.
const Icon = z.object({
  src: z.string().check(z.regex(/^\/icons\/[a-z0-9-]+\.png$/)),
  sizes: z.string().check(z.regex(/^\d+x\d+$/)),
  type: z.literal('image/png'),
  purpose: z.enum(['any', 'maskable', 'monochrome']),
});
const Installable = z.object({
  id: z.string(),
  name: z.string().check(z.minLength(1)),
  short_name: z.string().check(z.minLength(1), z.maxLength(15)),
  description: z.string().check(z.minLength(1)),
  start_url: z.literal('/today'),
  scope: z.literal('/'),
  display: z.literal('standalone'),
  background_color: z.string().check(z.regex(/^#[0-9a-f]{6}$/)),
  theme_color: z.string().check(z.regex(/^#[0-9a-f]{6}$/)),
  icons: z.array(Icon),
});

function pngSize(path: string): string {
  const png = readFileSync(new URL(`../../public${path}`, import.meta.url));
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
}

describe('the web app manifest (ADR-0033)', () => {
  const parsed = Installable.safeParse(manifest());

  it('has everything installation needs', () => {
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('names icons of 192 and 512 px for any use and as maskable, all of which exist at their size', () => {
    const icons = parsed.data?.icons ?? [];
    for (const purpose of ['any', 'maskable'] as const) {
      expect(icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes)).toEqual([
        '192x192',
        '512x512',
      ]);
    }
    for (const icon of icons) expect(pngSize(icon.src), icon.src).toBe(icon.sizes);
  });
});
