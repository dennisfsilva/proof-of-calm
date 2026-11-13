import type { EntityId } from '../../schema/ids';

// D11 (docs/DOMAIN.md §3.13): "An id is the first 16 bytes of the SHA-256 of `poc-csv-1|kraken|<refid>|<COIN>|<in|out>`,
// with version 8 and variant 10, as a lowercase UUID that `EntityIdSchema` takes." The core has no TextEncoder or
// crypto, so SHA-256 (FIPS 180-4) is written here over printable ASCII, which is all the reader puts in a key.

const words = (rows: readonly string[]) =>
  Uint32Array.from(rows.join(' ').split(' '), (hex) => Number.parseInt(hex, 16));

/** FIPS 180-4 §4.2.2: the round constants. */
const K = words([
  '428a2f98 71374491 b5c0fbcf e9b5dba5 3956c25b 59f111f1 923f82a4 ab1c5ed5',
  'd807aa98 12835b01 243185be 550c7dc3 72be5d74 80deb1fe 9bdc06a7 c19bf174',
  'e49b69c1 efbe4786 0fc19dc6 240ca1cc 2de92c6f 4a7484aa 5cb0a9dc 76f988da',
  '983e5152 a831c66d b00327c8 bf597fc7 c6e00bf3 d5a79147 06ca6351 14292967',
  '27b70a85 2e1b2138 4d2c6dfc 53380d13 650a7354 766a0abb 81c2c92e 92722c85',
  'a2bfe8a1 a81a664b c24b8b70 c76c51a3 d192e819 d6990624 f40e3585 106aa070',
  '19a4c116 1e376c08 2748774c 34b0bcb5 391c0cb3 4ed8aa4a 5b9cca4f 682e6ff3',
  '748f82ee 78a5636f 84c87814 8cc70208 90befffa a4506ceb bef9a3f7 c67178f2',
]);
/** FIPS 180-4 §5.3.3: the initial hash value. */
const START = words(['6a09e667 bb67ae85 3c6ef372 a54ff53a 510e527f 9b05688c 1f83d9ab 5be0cd19']);

/** A word of an array the loops below index only within its length. */
const at = (array: Uint32Array, index: number) => array[index] as number;
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
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(block + 4 * t);
    for (let t = 16; t < 64; t++) {
      const [x, y] = [at(w, t - 15), at(w, t - 2)];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[t] = at(w, t - 16) + s0 + at(w, t - 7) + s1;
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
