import type { EntityId } from '../../schema/ids';

// D11 (docs/DOMAIN.md §3.13): "An id is the first 16 bytes of the SHA-256 of `poc-csv-1|kraken|<refid>|<COIN>|<in|out>`,
// with version 8 and variant 10, as a lowercase UUID that `EntityIdSchema` takes." The core has no TextEncoder or
// crypto, so SHA-256 (FIPS 180-4) is written here over printable ASCII, which is all the reader puts in a key.

const K = Uint32Array.of(
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
);
const START = Uint32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19);

/** A word the loops below always hold (their bounds are the arrays' lengths). */
const at = (words: Uint32Array, index: number) => words[index] as number;
const rotr = (word: number, bits: number) => (word >>> bits) | (word << (32 - bits));

/** The message in 64-byte blocks: the text's bytes, 0x80, zeros, then its length in bits as 64 bits big-endian. */
function blocks(ascii: string): DataView {
  const length = ascii.length;
  const bytes = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  for (let index = 0; index < length; index++) {
    const code = ascii.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) {
      throw new RangeError(`Expected printable ASCII, got U+${code.toString(16).toUpperCase().padStart(4, '0')}`);
    }
    bytes[index] = code;
  }
  bytes[length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.length - 8, Math.floor(length / 2 ** 29));
  view.setUint32(bytes.length - 4, (length * 8) >>> 0);
  return view;
}

/** SHA-256 (FIPS 180-4) of a printable ASCII text as 64 lowercase hex digits; U+0020..U+007E only, else RangeError. */
export function sha256Hex(ascii: string): string {
  const view = blocks(ascii);
  const hash = START.slice();
  const w = new Uint32Array(64);
  for (let block = 0; block < view.byteLength; block += 64) {
    for (let t = 0; t < 64; t++) {
      const [x, y] = [at(w, t - 15), at(w, t - 2)];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[t] = t < 16 ? view.getUint32(block + 4 * t) : at(w, t - 16) + s0 + at(w, t - 7) + s1;
    }
    const v = hash.slice();
    for (let t = 0; t < 64; t++) {
      const [a, b, c, e] = [at(v, 0), at(v, 1), at(v, 2), at(v, 4)];
      const choice = (e & at(v, 5)) ^ (~e & at(v, 6));
      const t1 = at(v, 7) + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + choice + at(K, t) + at(w, t);
      const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      v.copyWithin(1, 0, 7);
      v[4] = at(v, 4) + t1;
      v[0] = t1 + t2;
    }
    for (let index = 0; index < 8; index++) hash[index] = at(hash, index) + at(v, index);
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('');
}

/** An imported row's id from its key: the digest's first 16 bytes with version 8 and variant 10, as a UUID. */
export function importId(key: string): EntityId {
  const hex = sha256Hex(key);
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}` as EntityId;
}
