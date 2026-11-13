import { describe, expect, it } from 'vitest';
import { EntityIdSchema } from '../../schema/ids';
import { importId, sha256Hex } from './import-id';

// D11 (docs/DOMAIN.md §3.13): an imported row's id is the first 16 bytes of the SHA-256 of its key, version 8,
// variant 10. The vectors are FIPS 180-4's (NIST's SHA-256 examples).

describe('sha256Hex', () => {
  it('gives FIPS 180-4 digests for the empty text, "abc" and the 448-bit message of two blocks', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('takes every printable ASCII character and throws RangeError on anything outside U+0020..U+007E', () => {
    expect(sha256Hex(' ~')).toMatch(/^[0-9a-f]{64}$/);
    for (const text of ['\n', '\u007f', 'é', 'a\u{1F600}', '\u0000']) expect(() => sha256Hex(text)).toThrow(RangeError);
  });
});

describe('importId', () => {
  it('is the digest’s first 16 bytes with version 8 and variant 10, as a lowercase UUID EntityIdSchema takes', () => {
    expect(importId('abc')).toBe('ba7816bf-8f01-8fea-8141-40de5dae2223');
    const id = importId('poc-csv-1|kraken|TQ1AAA-SYNTH-000001|BTC|in');
    expect(EntityIdSchema.safeParse(id).success).toBe(true);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('throws RangeError on a key outside printable ASCII', () => {
    expect(() => importId('poc-csv-1|kraken|TQ1AAA-SYNTHÉ|BTC|in')).toThrow(RangeError);
  });
});
