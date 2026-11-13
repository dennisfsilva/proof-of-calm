import { crc32, deflateRawSync } from 'node:zlib';

// ZIP archives built in the tests (zip.ts): local headers, then the central directory, then its end record, each
// field set as the archive would have it unless an entry overrides it to model a damaged or unsupported archive.

export type ZipEntry = {
  readonly name: string;
  readonly data: Uint8Array | string;
  /** 8 deflates the data (the default), 0 stores it; any other value is written as the method with stored data. */
  readonly method?: number;
  /** The general-purpose flags; bit 0 marks the entry encrypted. */
  readonly flags?: number;
  /** Overrides the CRC-32 the central directory records. */
  readonly crc?: number;
  /** Overrides the uncompressed size the central directory records. */
  readonly size?: number;
  /** Raw deflate data written in place of the data's own. */
  readonly deflated?: Uint8Array;
  /** Writes 0xFFFFFFFF as the sizes and offset, the marker of a ZIP64 entry. */
  readonly zip64?: boolean;
};

const bytes = (data: Uint8Array | string) => (typeof data === 'string' ? new TextEncoder().encode(data) : data);

/** A ZIP archive of the entries, in order. */
export function zipOf(entries: readonly ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const raw = bytes(entry.data);
    const method = entry.method ?? 8;
    const body = entry.deflated ?? (method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw);
    const crc = entry.crc ?? crc32(raw);
    const size = entry.size ?? raw.length;
    const flags = entry.flags ?? 0;
    const wide = entry.zip64 === true ? 0xffffffff : null;
    const local = new Uint8Array(30 + name.length + body.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, flags, true);
    l.setUint16(8, method, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, body.length, true);
    l.setUint32(22, size, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, flags, true);
    c.setUint16(10, method, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, wide ?? body.length, true);
    c.setUint32(24, wide ?? size, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, wide ?? offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const directory = centrals.reduce((sum, central) => sum + central.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, directory, true);
  e.setUint32(16, offset, true);
  const archive = new Uint8Array(offset + directory + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    archive.set(part, at);
    at += part.length;
  }
  return archive;
}
