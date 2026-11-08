// PNG (RFC 2083) and ICO writers for the app icons, on node:zlib alone: 8-bit RGBA, no interlace,
// filter 0 on every row; ICO with PNG images inside, which every current browser reads.
import { crc32, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** `rgba` holds width × height pixels, four bytes each, row by row from the top. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) throw new RangeError('The pixel buffer does not match the size');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // bit depth 8, colour type RGBA, deflate, filter 0, no interlace
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** An ICO file holding the PNGs, each with its square size (256 is written as 0). */
export function encodeIco(images: readonly { size: number; png: Buffer }[]): Buffer {
  const directory = Buffer.alloc(6 + 16 * images.length);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    directory.writeUInt8(size >= 256 ? 0 : size, entry);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([directory, ...images.map(({ png }) => png)]);
}
