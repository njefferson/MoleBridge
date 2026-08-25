/**
 * sha256.ts — SHA-256 and HMAC-SHA256, implemented here on purpose.
 *
 * WHY NOT WebCrypto, AND WHY NOT `node:crypto`. The codec has to run in three
 * places and give the same answer in all of them: a student's Chromebook, a
 * teacher's decoder page, and this test suite. `node:crypto` does not exist in
 * a browser. WebCrypto's digest is ASYNCHRONOUS, which would make the codec
 * async, which would make the step machine async, which would make the whole
 * engine async for the sake of hashing twelve bytes. And this is a static site
 * with no runtime dependencies by constraint, so a package is not an option
 * either.
 *
 * So: FIPS 180-4, about eighty lines, synchronous, byte-identical everywhere.
 * The test suite checks it against the published NIST vectors and against
 * `node:crypto` over random input — that cross-check is the whole reason to
 * trust it, and it is the one thing this file cannot do for itself.
 *
 * THIS IS NOT A SECURITY BOUNDARY. See §9 of the specification and the README:
 * the key ships in the bundle. The MAC catches typos and casual edits. It does
 * not stop anyone who opens the developer tools.
 *
 * PURE. No I/O, no globals, no clock.
 */

const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

/**
 * SHA-256 of a byte string.
 *
 * PRECONDITION: none. Returns a fresh 32-byte digest; `message` is not modified.
 */
export function sha256(message: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  // Pad: one 0x80 byte, zeros, then the length in bits as a 64-bit big-endian.
  const bitLength = message.length * 8;
  const withOne = message.length + 1;
  const padded = new Uint8Array(Math.ceil((withOne + 8) / 64) * 64);
  padded.set(message, 0);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  // A message long enough to overflow 32 bits of bit-length is not something
  // this codec will ever hash; the high word is written as zero deliberately.
  view.setUint32(padded.length - 4, bitLength >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);

  const w = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(block + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] as number;
      const w2 = w[i - 2] as number;
      const s0 = (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }

    let a = h[0] as number;
    let b = h[1] as number;
    let c = h[2] as number;
    let d = h[3] as number;
    let e = h[4] as number;
    let f = h[5] as number;
    let g = h[6] as number;
    let hh = h[7] as number;

    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (hh + S1 + ch + (K[i] as number) + (w[i] as number)) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = ((h[0] as number) + a) >>> 0;
    h[1] = ((h[1] as number) + b) >>> 0;
    h[2] = ((h[2] as number) + c) >>> 0;
    h[3] = ((h[3] as number) + d) >>> 0;
    h[4] = ((h[4] as number) + e) >>> 0;
    h[5] = ((h[5] as number) + f) >>> 0;
    h[6] = ((h[6] as number) + g) >>> 0;
    h[7] = ((h[7] as number) + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, h[i] as number, false);
  return out;
}

/** SHA-256's block size in bytes — HMAC's key-padding width. */
export const SHA256_BLOCK_BYTES = 64;

/**
 * HMAC-SHA256, per RFC 2104.
 *
 * PRECONDITION: none. A key longer than the block size is hashed first, as the
 * standard requires; a shorter one is zero-padded.
 */
export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = new Uint8Array(SHA256_BLOCK_BYTES);
  if (key.length > SHA256_BLOCK_BYTES) block.set(sha256(key), 0);
  else block.set(key, 0);

  const inner = new Uint8Array(SHA256_BLOCK_BYTES + message.length);
  const outer = new Uint8Array(SHA256_BLOCK_BYTES + 32);
  for (let i = 0; i < SHA256_BLOCK_BYTES; i += 1) {
    inner[i] = (block[i] as number) ^ 0x36;
    outer[i] = (block[i] as number) ^ 0x5c;
  }
  inner.set(message, SHA256_BLOCK_BYTES);
  outer.set(sha256(inner), SHA256_BLOCK_BYTES);
  return sha256(outer);
}

/**
 * UTF-8 encode a string without reaching for a global.
 *
 * PRECONDITION: none. `TextEncoder` is a global in both Node and every browser
 * this ships to, but the constraint on this repo is no globals in `/src/code`,
 * and the encoding of a code's key material must not depend on which one is
 * present. Written out, it is nine lines and it cannot drift.
 */
export function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (const character of text) {
    const point = character.codePointAt(0) as number;
    if (point < 0x80) out.push(point);
    else if (point < 0x800) out.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    else if (point < 0x10000) {
      out.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      out.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}
