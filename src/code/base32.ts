/**
 * base32.ts — Crockford Base32.
 *
 * The alphabet drops I, L, O and U. The first three because they are the
 * characters a person reading a code off a screen and typing it into Canvas
 * confuses with 1 and 0; the fourth so the encoding cannot spell an obscenity
 * by accident. Decoding therefore ACCEPTS the confusable characters and maps
 * them back — O to zero, I and L to one — because a student who types what they
 * see should not be told their code is broken when it is not.
 *
 * Hyphens and whitespace are stripped wherever they appear, in any quantity.
 * A code is displayed grouped, and it will be pasted back with the grouping
 * still in it, or with a line break in the middle, or with a trailing space
 * from a spreadsheet cell. None of those are errors.
 *
 * PURE. No I/O, no globals, no clock.
 */

/** The Crockford alphabet: no I, no L, no O, no U. */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const DECODE = new Map<string, number>();
for (let i = 0; i < CROCKFORD_ALPHABET.length; i += 1) {
  const c = CROCKFORD_ALPHABET[i] as string;
  DECODE.set(c, i);
  DECODE.set(c.toLowerCase(), i);
}
for (const [character, value] of [
  ['O', 0],
  ['o', 0],
  ['I', 1],
  ['i', 1],
  ['L', 1],
  ['l', 1],
] as const) {
  DECODE.set(character, value);
}

/** Characters removed before decoding, wherever they appear. */
const SEPARATORS = /[\s-]+/g;

/**
 * Strip separators from a code as typed.
 *
 * PRECONDITION: none.
 */
export function stripSeparators(text: string): string {
  return text.replace(SEPARATORS, '');
}

/**
 * Encode bits to Crockford Base32, MSB first.
 *
 * PRECONDITION: `bitLength` is a multiple of 5 and no greater than
 * `bytes.length * 8`. The caller owns the padding: this function will not
 * invent bits to reach a character boundary, because a codec that pads
 * silently is a codec that can lose a field.
 */
export function encodeBits(bytes: Uint8Array, bitLength: number): string {
  if (bitLength % 5 !== 0) throw new RangeError(`bitLength ${bitLength} is not a multiple of 5`);
  if (bitLength > bytes.length * 8) throw new RangeError('bitLength exceeds the bytes given');

  let out = '';
  for (let bit = 0; bit < bitLength; bit += 5) {
    let value = 0;
    for (let k = 0; k < 5; k += 1) {
      const index = bit + k;
      const byte = bytes[index >> 3] as number;
      value = (value << 1) | ((byte >> (7 - (index & 7))) & 1);
    }
    out += CROCKFORD_ALPHABET[value] as string;
  }
  return out;
}

/** A character that is not in the alphabet and is not a separator. */
export interface Base32Reject {
  readonly ok: false;
  /** Offset into the ORIGINAL text, separators included. */
  readonly offset: number;
  readonly character: string;
}

/** A successful decode. */
export interface Base32Accept {
  readonly ok: true;
  readonly bytes: Uint8Array;
  /** The stripped, upper-cased, confusable-folded code. */
  readonly normalized: string;
}

/**
 * Decode Crockford Base32 into bytes, MSB first.
 *
 * PRECONDITION: `bitLength` is a multiple of 5, and the stripped text is
 * exactly `bitLength / 5` characters. A shorter or longer code is rejected by
 * the caller, which knows what length it expected; this function reports only
 * characters it cannot read, with their offset in the text AS TYPED so a
 * teacher can point at the character in a gradebook cell.
 */
export function decodeBits(text: string, bitLength: number): Base32Accept | Base32Reject {
  const bytes = new Uint8Array(Math.ceil(bitLength / 8));
  let normalized = '';
  let bit = 0;

  for (let offset = 0; offset < text.length; offset += 1) {
    const character = text[offset] as string;
    if (/[\s-]/.test(character)) continue;
    const value = DECODE.get(character);
    if (value === undefined) return { ok: false, offset, character };
    normalized += CROCKFORD_ALPHABET[value] as string;
    for (let k = 0; k < 5; k += 1) {
      if (bit >= bitLength) {
        bit += 1;
        continue;
      }
      const set = (value >> (4 - k)) & 1;
      if (set === 1) {
        const index = bit >> 3;
        bytes[index] = (bytes[index] as number) | (1 << (7 - (bit & 7)));
      }
      bit += 1;
    }
  }

  return { ok: true, bytes, normalized };
}
