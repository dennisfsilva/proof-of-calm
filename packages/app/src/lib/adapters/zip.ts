import { err, ok, type Result } from '@proofofcalm/core';

// An exchange export's ZIP (ADR-0056, docs/DOMAIN.md §3.13): the archive comes from the person's own disk but is
// untrusted, so every offset and length is checked against the archive before it is read. The end record and the
// central directory name the entries; exactly one, past folders and `__MACOSX/`, may end in `.csv` (any case). Stored
// and deflated entries only, neither encrypted nor ZIP64. Deflate goes through the platform's DecompressionStream,
// fed a slice at a time and stopped once the text passes `maxBytes`, whatever the header claims; the CRC-32 and the
// size are checked, then the bytes are decoded as UTF-8. Nothing from the archive (names, comments, extra fields)
// leaves this module: a refusal is a code alone. The core's `zip` code stays for a pasted archive.

export type ZipError =
  | { readonly code: 'zip-no-csv' }
  | { readonly code: 'zip-several-csv' }
  | { readonly code: 'zip-unsupported' }
  | { readonly code: 'zip-too-large' };

const END = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const ZIP64_LOCATOR = 0x07064b50;
const END_SIZE = 22;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;
/** Compressed bytes handed to the decoder at a time: deflate expands at most about 1,032 times. */
const SLICE = 1024;
/** A size or offset of 0xFFFFFFFF says the real one is in a ZIP64 extra field. */
const WIDE = 0xffffffff;

const refuse = (code: ZipError['code']): Result<never, ZipError> => err({ code });
const unsupported = refuse('zip-unsupported');

type Entry = {
  readonly flags: number;
  readonly method: number;
  readonly crc: number;
  readonly packed: number;
  readonly size: number;
  readonly offset: number;
};

/** The first four bytes of a ZIP's first local header, `PK\x03\x04`. */
function isZip(head: Uint8Array): boolean {
  return head.length >= 4 && new DataView(head.buffer, head.byteOffset, 4).getUint32(0, true) === LOCAL;
}

/** A chosen file's text: a ZIP's one CSV file (readZipCsv), else the file's own text. */
export async function readFileText(file: Blob, maxBytes: number): Promise<Result<string, ZipError>> {
  if (!isZip(new Uint8Array(await file.slice(0, 4).arrayBuffer()))) return ok(await file.text());
  return readZipCsv(new Uint8Array(await file.arrayBuffer()), maxBytes);
}

/** The text of the archive's one CSV file, or why it cannot be read. */
export async function readZipCsv(bytes: Uint8Array, maxBytes: number): Promise<Result<string, ZipError>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = csvEntry(bytes, view);
  if (!found.ok) return found;
  const entry = found.value;
  if ((entry.flags & 1) !== 0 || (entry.method !== 0 && entry.method !== 8)) return unsupported;
  if (entry.size > maxBytes) return refuse('zip-too-large');
  const at = entry.offset;
  if (at + LOCAL_SIZE > bytes.length || view.getUint32(at, true) !== LOCAL) return unsupported;
  const start = at + LOCAL_SIZE + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  if (start + entry.packed > bytes.length) return unsupported;
  const packed = bytes.subarray(start, start + entry.packed);
  const data = entry.method === 0 ? (packed.length > maxBytes ? null : packed) : await inflate(packed, maxBytes);
  if (data === null) return refuse('zip-too-large');
  if (data === 'unreadable' || data.length !== entry.size || crc32(data) !== entry.crc) return unsupported;
  return ok(new TextDecoder('utf-8').decode(data));
}

/** The one entry whose name ends in `.csv`, from the end record and the central directory. */
function csvEntry(bytes: Uint8Array, view: DataView): Result<Entry, ZipError> {
  const end = endRecord(view);
  if (end === null) return unsupported;
  const count = view.getUint16(end + 10, true);
  const length = view.getUint32(end + 12, true);
  const first = view.getUint32(end + 16, true);
  const zip64 = end >= 20 && view.getUint32(end - 20, true) === ZIP64_LOCATOR;
  if (zip64 || count === 0xffff || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0)
    return unsupported;
  if (first + length > end) return unsupported;
  const csv: Entry[] = [];
  let at = first;
  for (let index = 0; index < count; index += 1) {
    if (at + CENTRAL_SIZE > first + length || view.getUint32(at, true) !== CENTRAL) return unsupported;
    const nameLength = view.getUint16(at + 28, true);
    const next = at + CENTRAL_SIZE + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    if (next > first + length) return unsupported;
    const name = bytes.subarray(at + CENTRAL_SIZE, at + CENTRAL_SIZE + nameLength);
    if (isCsv(name)) {
      const packed = view.getUint32(at + 20, true);
      const size = view.getUint32(at + 24, true);
      const offset = view.getUint32(at + 42, true);
      if (packed === WIDE || size === WIDE || offset === WIDE) return unsupported;
      const [flags, method, crc] = [
        view.getUint16(at + 8, true),
        view.getUint16(at + 10, true),
        view.getUint32(at + 16, true),
      ];
      csv.push({ flags, method, crc, packed, size, offset });
    }
    at = next;
  }
  const [entry, ...more] = csv;
  if (entry === undefined) return refuse('zip-no-csv');
  return more.length > 0 ? refuse('zip-several-csv') : ok(entry);
}

/** The offset of the end record: the last signature whose comment runs exactly to the end of the archive. */
function endRecord(view: DataView): number | null {
  const last = view.byteLength - END_SIZE;
  for (let at = last; at >= 0 && at >= last - 0xffff; at -= 1)
    if (view.getUint32(at, true) === END && at + END_SIZE + view.getUint16(at + 20, true) === view.byteLength)
      return at;
  return null;
}

const MACOSX = '__MACOSX/';

/** A file, not a folder or a macOS resource copy, whose name ends in `.csv` in any case. */
function isCsv(name: Uint8Array): boolean {
  const ending = String.fromCharCode(...name.subarray(-4)).toLowerCase();
  return ending === '.csv' && String.fromCharCode(...name.subarray(0, MACOSX.length)) !== MACOSX;
}

/** The inflated bytes; null once they pass `maxBytes`; 'unreadable' for data or a platform that cannot inflate. */
async function inflate(packed: Uint8Array, maxBytes: number): Promise<Uint8Array | null | 'unreadable'> {
  let decoder: DecompressionStream;
  try {
    decoder = new DecompressionStream('deflate-raw');
  } catch {
    return 'unreadable';
  }
  let fed = 0;
  const source = new ReadableStream<BufferSource>(
    {
      pull(controller) {
        if (fed >= packed.length) controller.close();
        else controller.enqueue(packed.slice(fed, fed + SLICE));
        fed += SLICE;
      },
    },
    { highWaterMark: 0 },
  );
  const reader = source.pipeThrough(decoder).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return 'unreadable';
  }
  const data = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    data.set(chunk, at);
    at += chunk.length;
  }
  return data;
}

let table: Uint32Array | null = null;

/** The CRC-32 of ZIP (the reflected polynomial 0xEDB88320). */
function crc32(data: Uint8Array): number {
  if (table === null) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = (table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
