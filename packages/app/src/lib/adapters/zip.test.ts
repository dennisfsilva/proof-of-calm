import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileText, readZipCsv } from './zip';
import { zipOf } from './zip.testing';

// Runs under Node's own DecompressionStream (Node 24 has 'deflate-raw'), the platform's stream the browser also has.

const LEDGER = readFileSync(new URL('../../../../core/test/exchange/kraken-synthetic-2025-12.csv', import.meta.url));
const CAP = 1_000_000;
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readZipCsv, the one CSV file of an archive', () => {
  it.each([
    ['stored', 0],
    ['deflated', 8],
  ])('reads a %s ledger back byte-exact', async (_, method) => {
    const archive = zipOf([{ name: 'ledgers.csv', data: LEDGER, method }]);
    expect(await readZipCsv(archive, CAP)).toStrictEqual({ ok: true, value: text(LEDGER) });
  });

  it('takes the CSV whatever its case and folder, past folders and a __MACOSX/ copy', async () => {
    const archive = zipOf([
      { name: 'export/', data: '', method: 0 },
      { name: '__MACOSX/export/._LEDGERS.CSV', data: 'resource fork' },
      { name: 'export/LEDGERS.CSV', data: LEDGER },
      { name: 'export/readme.txt', data: 'not a ledger' },
    ]);
    expect(await readZipCsv(archive, CAP)).toStrictEqual({ ok: true, value: text(LEDGER) });
  });

  it('an archive with no CSV file is zip-no-csv', async () => {
    const archive = zipOf([{ name: 'readme.txt', data: 'hello' }]);
    expect(await readZipCsv(archive, CAP)).toStrictEqual({ ok: false, error: { code: 'zip-no-csv' } });
  });

  it('an archive with two CSV files is zip-several-csv', async () => {
    const archive = zipOf([
      { name: 'ledgers.csv', data: LEDGER },
      { name: 'trades.csv', data: 'txid,ordertxid\n' },
    ]);
    expect(await readZipCsv(archive, CAP)).toStrictEqual({ ok: false, error: { code: 'zip-several-csv' } });
  });

  it.each([
    ['an encrypted entry', { flags: 1 }],
    ['a ZIP64 entry', { zip64: true }],
    ['a method other than store and deflate', { method: 12 }],
    ['a CRC-32 that does not match', { crc: 0x12345678 }],
    ['a size that does not match', { size: LEDGER.length - 1 }],
    ['deflate data that does not decode', { deflated: new Uint8Array([0xff, 0xff, 0xff, 0xff]) }],
  ])('%s is zip-unsupported', async (_, override) => {
    const archive = zipOf([{ name: 'ledgers.csv', data: LEDGER, ...override }]);
    expect(await readZipCsv(archive, CAP)).toStrictEqual({ ok: false, error: { code: 'zip-unsupported' } });
  });

  it.each([
    ['cut inside its central directory', -30],
    ['cut inside its data', 100],
    ['its first four bytes alone', 4],
  ])('an archive %s is zip-unsupported', async (_, cut) => {
    const archive = zipOf([{ name: 'ledgers.csv', data: LEDGER }]);
    const truncated = archive.subarray(0, cut < 0 ? archive.length + cut : cut);
    expect(await readZipCsv(truncated, CAP)).toStrictEqual({ ok: false, error: { code: 'zip-unsupported' } });
  });

  it('an end record whose directory points past the archive is zip-unsupported', async () => {
    const archive = zipOf([{ name: 'ledgers.csv', data: LEDGER }]);
    new DataView(archive.buffer).setUint32(archive.length - 6, archive.length, true);
    expect(await readZipCsv(archive, CAP)).toStrictEqual({ ok: false, error: { code: 'zip-unsupported' } });
  });

  it('a CSV whose recorded size is over the cap is zip-too-large before it is decoded', async () => {
    const archive = zipOf([{ name: 'ledgers.csv', data: LEDGER, size: CAP + 1 }]);
    expect(await readZipCsv(archive, CAP)).toStrictEqual({ ok: false, error: { code: 'zip-too-large' } });
  });

  it('a stored CSV over the cap is zip-too-large', async () => {
    const archive = zipOf([{ name: 'ledgers.csv', data: new Uint8Array(CAP + 1), method: 0 }]);
    expect(await readZipCsv(archive, CAP)).toStrictEqual({ ok: false, error: { code: 'zip-too-large' } });
  });

  it('a bomb whose header claims 100 bytes is refused before more than the cap and 64 KiB is decoded', async () => {
    const Platform = globalThis.DecompressionStream;
    let decoded = 0;
    vi.stubGlobal(
      'DecompressionStream',
      class {
        readonly writable: WritableStream<BufferSource>;
        readonly readable: ReadableStream<Uint8Array>;
        constructor(format: CompressionFormat) {
          const inner = new Platform(format);
          this.writable = inner.writable;
          this.readable = inner.readable.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                decoded += chunk.length;
                controller.enqueue(chunk);
              },
            }),
          );
        }
      },
    );
    const zeros = new Uint8Array(CAP * 20);
    const deflated = new Uint8Array(deflateRawSync(zeros));
    const archive = zipOf([{ name: 'ledgers.csv', data: zeros, deflated, size: 100 }]);
    expect(await readZipCsv(archive, CAP)).toStrictEqual({ ok: false, error: { code: 'zip-too-large' } });
    expect(decoded).toBeGreaterThan(CAP);
    expect(decoded).toBeLessThanOrEqual(CAP + 64 * 1024);
  });

  it('with no DecompressionStream for deflate-raw, a deflated CSV is zip-unsupported', async () => {
    vi.stubGlobal(
      'DecompressionStream',
      class {
        constructor() {
          throw new TypeError('Unsupported compression format');
        }
      },
    );
    const archive = zipOf([{ name: 'ledgers.csv', data: LEDGER }]);
    expect(await readZipCsv(archive, CAP)).toStrictEqual({ ok: false, error: { code: 'zip-unsupported' } });
  });
});

describe('readFileText, a chosen file', () => {
  it('reads a file that is not a ZIP as its text', async () => {
    const file = new Blob([LEDGER]);
    expect(await readFileText(file, CAP)).toStrictEqual({ ok: true, value: text(LEDGER) });
  });

  it('reads a ZIP as the text of its CSV file, and refuses one it cannot read', async () => {
    const zipped = new Blob([zipOf([{ name: 'ledgers.csv', data: LEDGER }])]);
    expect(await readFileText(zipped, CAP)).toStrictEqual({ ok: true, value: text(LEDGER) });
    const empty = new Blob([zipOf([{ name: 'readme.txt', data: 'hello' }])]);
    expect(await readFileText(empty, CAP)).toStrictEqual({ ok: false, error: { code: 'zip-no-csv' } });
  });
});
