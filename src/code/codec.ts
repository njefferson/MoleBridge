/**
 * codec.ts — the completion code.
 *
 * A student finishes a session, the app prints 24 characters, the student types
 * them into a Canvas text box, and the teacher pastes a gradebook column into a
 * decoder page. That is the entire transport: no network, no account, no
 * server. The code carries how many problems were attempted, how many were
 * right first time, where the errors fell by stage, how many algebra branches
 * fired, how many entries the taxonomy could not classify, how long it took,
 * and which day it was.
 *
 * ONE FIELD TABLE, TWO DIRECTIONS. `FIELDS` below is the only place the layout
 * is written down; packing and unpacking both walk it. A codec that declares
 * its layout twice is a codec that will one day lose a field on one side only,
 * and by the time anyone notices, a class has already used it.
 *
 * ================================================================
 *  THE SECRET SHIPS IN THE BUNDLE. THE MAC IS NOT A FORGERY DEFENCE.
 * ================================================================
 * It catches typos, transcription slips, and casual hand-editing of a code. A
 * student who opens the developer tools can mint any code they like. That is
 * accepted, stated in the README, and designed for: the intended grading
 * posture is completion credit, not correctness credit. Nothing here should be
 * hardened further — see §9 of the specification, which rules obfuscation,
 * server validation and fingerprinting explicitly out of scope.
 *
 * A NOTE ON THE BIT COUNT, because the specification says two different things.
 * §8.2 heads the payload "115 bits" and then sums its own field list to 119,
 * padded to 120 for exactly 24 Base32 characters. 119 is the sum that is
 * actually correct for the fields listed, and 120 is the only total that gives
 * 24 characters, so this implements 1 pad bit + 119 field-and-MAC bits. That
 * also settles §8.3's "96-bit payload prefix": the pad bit plus the 95 bits of
 * fields is exactly 96 bits, which is exactly the first 12 bytes, which is what
 * the MAC covers.
 *
 * PURE. No I/O, no globals, no clock — the day offset is supplied by the
 * caller, which is where the injected clock lives.
 */

import { hmacSha256, utf8Bytes } from './sha256.ts';
import { CROCKFORD_ALPHABET, decodeBits, encodeBits, stripSeparators } from './base32.ts';

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/** The format version this build writes. */
export const CODE_VERSION = 1;

/** One leading zero bit, so the whole word is 120 bits and 24 characters. */
export const PAD_BITS = 1;
/** Pad bit plus every field except the MAC — what the MAC is computed over. */
export const MAC_INPUT_BITS = 96;
/** Leading bits of the HMAC that travel in the code. */
export const MAC_BITS = 24;
/** The whole word. */
export const TOTAL_BITS = MAC_INPUT_BITS + MAC_BITS;
/** Characters in a code, separators excluded. */
export const CODE_CHARS = TOTAL_BITS / 5;
/** How the code is grouped for display. */
export const DISPLAY_GROUPS: readonly number[] = [5, 5, 5, 5, 4];

/** Every payload field, in packing order, MSB first. */
export const FIELDS = [
  { name: 'version', bits: 3 },
  { name: 'assignmentKeyId', bits: 12 },
  { name: 'rosterId', bits: 12 },
  { name: 'attempted', bits: 7 },
  { name: 'firstTryCorrect', bits: 7 },
  { name: 'errS1', bits: 5 },
  { name: 'errS2', bits: 5 },
  { name: 'errS3', bits: 5 },
  { name: 'errS4', bits: 5 },
  { name: 'errS5', bits: 5 },
  { name: 'errS6', bits: 5 },
  { name: 'algebraTriggers', bits: 4 },
  { name: 'unclassified', bits: 4 },
  { name: 'durationMin', bits: 7 },
  { name: 'dayOffset', bits: 9 },
] as const;

/** The name of any payload field. */
export type FieldName = (typeof FIELDS)[number]['name'];

/** Everything a completion code carries. */
export type CompletionPayload = { readonly [K in FieldName]: number };

/** The largest value each field can hold. Counters saturate here. */
export const FIELD_MAX: { readonly [K in FieldName]: number } = Object.fromEntries(
  FIELDS.map((f) => [f.name, 2 ** f.bits - 1]),
) as { readonly [K in FieldName]: number };

/** The six gated stages, as the code names them. */
export const STAGE_FIELDS: readonly FieldName[] = ['errS1', 'errS2', 'errS3', 'errS4', 'errS5', 'errS6'];

const FIELD_BITS_TOTAL = FIELDS.reduce((sum, f) => sum + f.bits, 0);
if (PAD_BITS + FIELD_BITS_TOTAL !== MAC_INPUT_BITS) {
  throw new Error(
    `layout is inconsistent: ${PAD_BITS} pad + ${FIELD_BITS_TOTAL} field bits is not ${MAC_INPUT_BITS}`,
  );
}

/* ------------------------------------------------------------------ */
/* Bit twiddling                                                       */
/* ------------------------------------------------------------------ */

function writeBits(bytes: Uint8Array, at: number, width: number, value: number): void {
  for (let k = 0; k < width; k += 1) {
    const bit = at + k;
    const set = (value >>> (width - 1 - k)) & 1;
    if (set === 1) {
      const index = bit >> 3;
      bytes[index] = (bytes[index] as number) | (1 << (7 - (bit & 7)));
    }
  }
}

function readBits(bytes: Uint8Array, at: number, width: number): number {
  let value = 0;
  for (let k = 0; k < width; k += 1) {
    const bit = at + k;
    const byte = bytes[bit >> 3] as number;
    value = value * 2 + ((byte >> (7 - (bit & 7))) & 1);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Saturation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Clamp every field into its bit width, as §8.2 specifies ("saturating at").
 *
 * PRECONDITION: every field is a finite number. Negative values clamp to zero;
 * fractions are floored. A saturated counter has lost information on purpose —
 * {@link isSaturated} is how the consistency checks know not to reason from it.
 */
export function saturate(payload: CompletionPayload): CompletionPayload {
  const out: Record<string, number> = {};
  for (const field of FIELDS) {
    const raw = payload[field.name];
    const floored = Number.isFinite(raw) ? Math.floor(raw) : 0;
    out[field.name] = Math.max(0, Math.min(FIELD_MAX[field.name], floored));
  }
  return out as CompletionPayload;
}

/** True where a field sits at its maximum and may therefore be an undercount. */
export function isSaturated(payload: CompletionPayload, field: FieldName): boolean {
  return payload[field] >= FIELD_MAX[field];
}

/** Total errors across the six gated stages. */
export function totalStageErrors(payload: CompletionPayload): number {
  return STAGE_FIELDS.reduce((sum, field) => sum + payload[field], 0);
}

/* ------------------------------------------------------------------ */
/* Keying                                                              */
/* ------------------------------------------------------------------ */

/**
 * The HMAC key: the build secret with the assignment key id appended as two
 * big-endian bytes, which is §8.3's `BUILD_SECRET || assignmentKeyId`.
 *
 * Binding the key to the assignment id means a code minted for one assignment
 * does not verify against another — which is a transcription check (a code
 * pasted into the wrong gradebook column) far more than it is a security one.
 *
 * PRECONDITION: `assignmentKeyId` is an integer in 0..4095.
 */
export function macKey(secret: string, assignmentKeyId: number): Uint8Array {
  const secretBytes = utf8Bytes(secret);
  const key = new Uint8Array(secretBytes.length + 2);
  key.set(secretBytes, 0);
  key[secretBytes.length] = (assignmentKeyId >> 8) & 0xff;
  key[secretBytes.length + 1] = assignmentKeyId & 0xff;
  return key;
}

/* ------------------------------------------------------------------ */
/* Packing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Pack a payload into the leading 96 bits of a 15-byte word. The MAC bytes are
 * left zero for the caller to fill.
 *
 * PRECONDITION: every field already fits its width — call {@link saturate}
 * first. A field that does not fit THROWS rather than truncating, because a
 * silent truncation here is the exact defect this file's field table exists to
 * make impossible.
 */
export function packPayload(payload: CompletionPayload): Uint8Array {
  const bytes = new Uint8Array(TOTAL_BITS / 8);
  let at = PAD_BITS; // the leading zero bit is left as written
  for (const field of FIELDS) {
    const value = payload[field.name];
    if (!Number.isInteger(value) || value < 0 || value > FIELD_MAX[field.name]) {
      throw new RangeError(
        `${field.name} is ${value}, which does not fit ${field.bits} bits (0..${FIELD_MAX[field.name]})`,
      );
    }
    writeBits(bytes, at, field.bits, value);
    at += field.bits;
  }
  return bytes;
}

/**
 * Read every field back out of a packed word.
 *
 * PRECONDITION: `bytes` is at least 12 bytes long. The MAC is not examined.
 */
export function unpackPayload(bytes: Uint8Array): CompletionPayload {
  const out: Record<string, number> = {};
  let at = PAD_BITS;
  for (const field of FIELDS) {
    out[field.name] = readBits(bytes, at, field.bits);
    at += field.bits;
  }
  return out as CompletionPayload;
}

/* ------------------------------------------------------------------ */
/* Consistency (§9)                                                    */
/* ------------------------------------------------------------------ */

/**
 * The most stage errors one problem can plausibly account for. Used ONLY when
 * neither side of the comparison has saturated: a saturated counter is a known
 * undercount, and multiplying a bound by an undercount rejects real sessions.
 *
 * Set loose on purpose. §9 says this is a completion mechanism, not a proctor,
 * so the asymmetry runs one way: telling a teacher that a genuine struggling
 * student's code is broken costs far more than letting a forged one through,
 * and a forged one was never going to be caught here anyway.
 */
export const MAX_STAGE_ERRORS_PER_ATTEMPT = 30;

/** Every internal consistency check, by name. */
export type ConsistencyCheck =
  | 'ROSTER_ID_ZERO'
  | 'FIRST_TRY_EXCEEDS_ATTEMPTED'
  | 'NOTHING_ATTEMPTED_BUT_ACTIVITY'
  | 'UNCLASSIFIED_EXCEEDS_ERRORS'
  | 'ALGEBRA_EXCEEDS_ERRORS'
  | 'ERRORS_IMPLAUSIBLE_FOR_ATTEMPTS';

/** A check that failed, with what it saw. */
export interface ConsistencyFailure {
  readonly check: ConsistencyCheck;
  readonly detail: string;
}

/**
 * Run every §9 internal consistency check.
 *
 * PRECONDITION: `payload` came from {@link unpackPayload}, so every field is
 * already within its bit width.
 */
export function checkConsistency(payload: CompletionPayload): ConsistencyFailure[] {
  const failures: ConsistencyFailure[] = [];
  const errors = totalStageErrors(payload);
  const anyStageSaturated = STAGE_FIELDS.some((field) => isSaturated(payload, field));

  if (payload.rosterId === 0) {
    failures.push({
      check: 'ROSTER_ID_ZERO',
      detail: 'roster numbers run 1 to 4095; zero is not one a teacher assigned',
    });
  }
  if (payload.firstTryCorrect > payload.attempted) {
    failures.push({
      check: 'FIRST_TRY_EXCEEDS_ATTEMPTED',
      detail: `${payload.firstTryCorrect} right first time out of ${payload.attempted} attempted`,
    });
  }
  if (
    payload.attempted === 0 &&
    (errors > 0 || payload.algebraTriggers > 0 || payload.unclassified > 0 || payload.firstTryCorrect > 0)
  ) {
    failures.push({
      check: 'NOTHING_ATTEMPTED_BUT_ACTIVITY',
      detail: 'no problems attempted, yet the code records errors or remediation',
    });
  }
  if (!anyStageSaturated && !isSaturated(payload, 'unclassified') && payload.unclassified > errors) {
    failures.push({
      check: 'UNCLASSIFIED_EXCEEDS_ERRORS',
      detail: `${payload.unclassified} unclassified entries against ${errors} stage errors, and unclassified entries are a subset of them`,
    });
  }
  if (!anyStageSaturated && !isSaturated(payload, 'algebraTriggers') && payload.algebraTriggers > errors) {
    failures.push({
      check: 'ALGEBRA_EXCEEDS_ERRORS',
      detail: `${payload.algebraTriggers} remediation branches against ${errors} stage errors, and each branch follows an error`,
    });
  }
  if (
    !anyStageSaturated &&
    !isSaturated(payload, 'attempted') &&
    errors > payload.attempted * MAX_STAGE_ERRORS_PER_ATTEMPT
  ) {
    failures.push({
      check: 'ERRORS_IMPLAUSIBLE_FOR_ATTEMPTS',
      detail: `${errors} stage errors across ${payload.attempted} attempted problems`,
    });
  }
  return failures;
}

/* ------------------------------------------------------------------ */
/* Encode                                                              */
/* ------------------------------------------------------------------ */

/**
 * Insert the display hyphens: 5-5-5-5-4.
 *
 * PRECONDITION: `raw` is {@link CODE_CHARS} characters with no separators.
 */
export function formatCode(raw: string): string {
  const parts: string[] = [];
  let at = 0;
  for (const size of DISPLAY_GROUPS) {
    parts.push(raw.slice(at, at + size));
    at += size;
  }
  return parts.join('-');
}

/**
 * Encode a payload into a displayable completion code.
 *
 * PRECONDITION: `secret` is the build secret. Fields are saturated first, so
 * out-of-range counters clamp rather than throw — a session that somehow
 * recorded 200 attempts still produces a usable code reading 127.
 */
export function encodeCompletionCode(payload: CompletionPayload, secret: string): string {
  const saturated = saturate({ ...payload, version: CODE_VERSION });
  const bytes = packPayload(saturated);
  const mac = hmacSha256(macKey(secret, saturated.assignmentKeyId), bytes.slice(0, MAC_INPUT_BITS / 8));
  bytes.set(mac.slice(0, MAC_BITS / 8), MAC_INPUT_BITS / 8);
  return formatCode(encodeBits(bytes, TOTAL_BITS));
}

/* ------------------------------------------------------------------ */
/* Decode                                                              */
/* ------------------------------------------------------------------ */

/** The four verdicts §8.5 allows. Nothing else is ever reported. */
export type Verdict = 'VALID' | 'MAC_FAIL' | 'VERSION_UNKNOWN' | 'MALFORMED';

/** What a decode found. */
export interface DecodeResult {
  readonly verdict: Verdict;
  /**
   * Every field, or null.
   *
   * Populated ONLY where the MAC verified and the version is one this build
   * understands — that is, for VALID, and for a MALFORMED verdict reached by an
   * internal consistency check rather than by bad characters. A MAC that did
   * not verify means the bits are not trustworthy, so nothing is reported from
   * them: §8.5 forbids partially reporting a MAC_FAIL code as if it were valid.
   */
  readonly fields: CompletionPayload | null;
  /** Consistency checks that failed. Empty unless the MAC verified. */
  readonly failures: readonly ConsistencyFailure[];
  /** The code with separators stripped and confusables folded, or null. */
  readonly normalized: string | null;
  /** One sentence a teacher can read. */
  readonly detail: string;
}

/**
 * Decode a completion code as typed.
 *
 * PRECONDITION: `secret` is the same build secret the code was minted with.
 * Case, hyphen placement and whitespace are all irrelevant; O reads as zero and
 * I and L read as one, per Crockford.
 *
 * NEVER REPAIRS. A code that fails any stage comes back with a verdict saying
 * which stage, and no fields it has not earned the right to report.
 */
export function decodeCompletionCode(code: string, secret: string): DecodeResult {
  const stripped = stripSeparators(code);
  if (stripped.length === 0) {
    return { verdict: 'MALFORMED', fields: null, failures: [], normalized: null, detail: 'the code is empty' };
  }
  if (stripped.length !== CODE_CHARS) {
    return {
      verdict: 'MALFORMED',
      fields: null,
      failures: [],
      normalized: null,
      detail: `a completion code is ${CODE_CHARS} characters; this one has ${stripped.length}`,
    };
  }

  const decoded = decodeBits(code, TOTAL_BITS);
  if (!decoded.ok) {
    return {
      verdict: 'MALFORMED',
      fields: null,
      failures: [],
      normalized: null,
      detail: `"${decoded.character}" at position ${decoded.offset + 1} is not a character a code contains`,
    };
  }

  const { bytes, normalized } = decoded;
  const payload = unpackPayload(bytes);

  const expected = hmacSha256(
    macKey(secret, payload.assignmentKeyId),
    bytes.slice(0, MAC_INPUT_BITS / 8),
  );
  const macBytes = MAC_BITS / 8;
  let mismatch = 0;
  for (let i = 0; i < macBytes; i += 1) {
    mismatch |= (bytes[MAC_INPUT_BITS / 8 + i] as number) ^ (expected[i] as number);
  }
  if (mismatch !== 0) {
    return {
      verdict: 'MAC_FAIL',
      fields: null,
      failures: [],
      normalized,
      detail: 'the check characters do not match the rest of the code — it was mistyped or edited',
    };
  }

  if (payload.version !== CODE_VERSION) {
    return {
      verdict: 'VERSION_UNKNOWN',
      fields: null,
      failures: [],
      normalized,
      detail: `this code is format version ${payload.version}; this build reads version ${CODE_VERSION}`,
    };
  }

  const failures = checkConsistency(payload);
  if (failures.length > 0) {
    return {
      verdict: 'MALFORMED',
      fields: payload,
      failures,
      normalized,
      detail: `the code verifies but contradicts itself: ${failures.map((f) => f.detail).join('; ')}`,
    };
  }

  return { verdict: 'VALID', fields: payload, failures: [], normalized, detail: 'valid' };
}

/** Every character a code may contain, for a teacher-facing hint. */
export const CODE_ALPHABET = CROCKFORD_ALPHABET;
