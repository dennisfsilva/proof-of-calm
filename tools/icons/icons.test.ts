import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { faviconSvg, icons, rgba } from './generate.ts';
import { renderMark, shapeAt } from './mark.ts';
import { encodeIco, encodePng } from './png.ts';

const ANY = { diameter: 0.8, dot: 1.2 };

/** Width, height and the RGBA pixels of a PNG this module wrote (filter 0 on every row). */
function decode(png: Buffer): { width: number; height: number; pixels: Buffer } {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idatLength = png.readUInt32BE(33);
  const rows = inflateSync(png.subarray(41, 41 + idatLength));
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1)
    rows.copy(pixels, y * width * 4, y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1));
  return { width, height, pixels };
}

describe('the PNG and ICO writers', () => {
  it('write a PNG that decodes to the pixels given', () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 40]);
    const decoded = decode(encodePng(2, 2, pixels));
    expect([decoded.width, decoded.height]).toEqual([2, 2]);
    expect([...decoded.pixels]).toEqual([...pixels]);
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow('does not match');
  });

  it('write an ICO directory that points at each PNG', () => {
    const small = encodePng(1, 1, new Uint8Array([0, 0, 0, 255]));
    const ico = encodeIco([
      { size: 16, png: small },
      { size: 256, png: small },
    ]);
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 2]);
    expect([ico.readUInt8(6), ico.readUInt8(22)]).toEqual([16, 0]);
    expect(ico.readUInt32LE(6 + 12)).toBe(38);
    expect(ico.subarray(38, 38 + small.length)).toEqual(small);
  });
});

describe('the mark (docs/DESIGN.md §1)', () => {
  it('is a ring with its gap at two o’clock, closed by the dot', () => {
    expect(shapeAt(ANY, 50, 14)).toBe('ring'); // twelve o'clock, on the stroke
    expect(shapeAt(ANY, 50, 50)).toBeNull(); // the centre is open
    expect(shapeAt(ANY, 50, 5)).toBeNull(); // outside
    // Two o'clock on the middle of the stroke is the dot.
    const middle = (40 + 40 - (2 * 40) / 7) / 2;
    expect(shapeAt(ANY, 50 + middle * Math.cos(-Math.PI / 6), 50 + middle * Math.sin(-Math.PI / 6))).toBe('dot');
  });

  it('paints the ring in ink, the dot in accent and the rest in paper', () => {
    const colours = { background: rgba('#f7f4ef'), ring: rgba('#1c1a18'), dot: rgba('#ac7300') };
    const size = 100;
    const pixels = renderMark(size, ANY, colours);
    const at = (x: number, y: number) => [...pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
    expect(at(50, 14)).toEqual([0x1c, 0x1a, 0x18, 255]);
    expect(at(50, 50)).toEqual([0xf7, 0xf4, 0xef, 255]);
    expect(at(76, 35)).toEqual([0xac, 0x73, 0x00, 255]);
    const clear = renderMark(10, ANY, { ...colours, background: null });
    expect(clear[3]).toBe(0);
  });

  it('refuses a colour that is not #rrggbb', () => {
    expect(() => rgba('red')).toThrow('is not a #rrggbb colour');
  });
});

describe('the icon set (docs/DESIGN.md §9)', () => {
  const set = icons();

  it('has every size the manifest and the pages name', () => {
    const sizes = Object.fromEntries(
      Object.entries(set)
        .filter(([name]) => name.endsWith('.png'))
        .map(([name, content]) => [name, decode(content as Buffer).width]),
    );
    expect(sizes).toEqual({
      'icons/icon-192.png': 192,
      'icons/icon-512.png': 512,
      'icons/icon-maskable-192.png': 192,
      'icons/icon-maskable-512.png': 512,
      'icons/icon-monochrome-512.png': 512,
      'apple-touch-icon.png': 180,
    });
    expect((set['favicon.ico'] as Buffer).readUInt16LE(4)).toBe(3);
  });

  it('keeps maskable icons opaque and the monochrome one transparent around the mark', () => {
    expect(decode(set['icons/icon-maskable-192.png'] as Buffer).pixels[3]).toBe(255);
    expect(decode(set['icons/icon-monochrome-512.png'] as Buffer).pixels[3]).toBe(0);
  });

  it('gives the favicon both themes’ inks and a title', () => {
    expect(faviconSvg()).toMatch(
      /\.ring\{fill:rgb\(28 26 24\)\}.*prefers-color-scheme:dark.*\.ring\{fill:rgb\(241 240 236\)\}/,
    );
    expect(faviconSvg()).toContain('<title>Proof of Calm</title>');
  });

  it('matches the committed files', () => {
    for (const [name, content] of Object.entries(set)) {
      const committed = readFileSync(new URL(`../../apps/web/public/${name}`, import.meta.url));
      expect(Buffer.compare(committed, Buffer.from(content)), name).toBe(0);
    }
  });
});
