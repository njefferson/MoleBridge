/**
 * progress.ts — what a student has done, and the code that carries it between
 * devices.
 *
 * ## Automatic first, portable second
 *
 * Progress lives in `localStorage`, which needs no code and no thought. The
 * code exists for the cases storage cannot cover: a shared Chromebook, a new
 * device, cleared site data, school machine to home machine. It is a BACKUP AND
 * A TRANSFER, never the primary route — a student who has to copy a string down
 * to keep their place will not keep their place.
 *
 * ## The MAC is anti-corruption, NOT anti-cheat, and this is the important part
 *
 * It is the same construction as the completion code's, so it catches the same
 * things: a typo, a slip in transcription, a character hand-edited on a whim. A
 * wrong code is REFUSED rather than silently loading somebody else's progress.
 *
 * It does not stop a student who opens the JavaScript, because the secret ships
 * in the bundle. §9 of the specification rules obfuscation out of scope and
 * that was the right call — every alternative costs real work and loses to one
 * determined reader.
 *
 * WHICH IS FINE, BECAUSE NOTHING HERE IS WITHHELD. Lessons are never locked:
 * any lesson opens at any time, from the first run. So this code is a BOOKMARK
 * rather than a credential, and forging one buys exactly what tapping a lesson
 * would have bought anyway. There is nothing to defeat. That is a design
 * decision doing the work a lock could not have done, and it is why no
 * obfuscation appears below.
 *
 * ## What it carries, and what it deliberately does not
 *
 * Lessons finished, how much practice has been done, and which error classes
 * keep recurring — the last of these is what makes "practise the thing you get
 * wrong" possible, and is the one thing this app has that nothing else does.
 *
 * NO ROSTER NUMBER AND NOTHING ABOUT WHO. A progress code is not an identity;
 * it says what somebody has done, never which somebody.
 */

import { encodeBits, decodeBits, stripSeparators } from '../code/base32.ts';
import { hmacSha256, utf8Bytes } from '../code/sha256.ts';
import { ERROR_CLASSES, type ErrorClass } from '../engine/taxonomy.ts';

/** Bumped when the layout below changes. An older code is refused, not guessed at. */
export const PROGRESS_VERSION = 2;

/** How many lessons there are. One bit each. */
export const LESSON_COUNT = 8;

/**
 * Layout, in bits. Kept small on purpose: this gets written on the back of an
 * exercise book and typed in one-handed.
 *
 *   version   3   room for seven layouts before anything has to be renamed
 *   lessons   8   one bit per lesson, finished or not
 *   practice 14   problems practised, saturating at 16383
 *   weak     20   one bit per error class, set once it has happened twice
 *   reserved 11   MUST be zero; room to grow, and a second corruption check
 *   ----
 *            56   payload, which is seven whole bytes
 *   mac      24   three whole bytes; ~1 in 16 million for a typo
 *   ----
 *            80   sixteen Crockford characters, four groups of four
 *
 * THE EIGHTH LESSON CAME OUT OF RESERVED, which is what reserved was for. It
 * cost a version bump, because the lesson field sits ahead of everything else
 * and widening it shifts every field after it — a version 1 code read under
 * this layout would report the wrong practice count rather than failing, which
 * is the worst of the two outcomes. `PROGRESS_VERSION` is 2 and a version 1
 * code is refused by name. Nothing was deployed carrying one.
 *
 * TWO CONSTRAINTS HAVE TO HOLD AT ONCE and the first attempt satisfied only
 * one: the total must divide by 5 for base32, AND the payload and the MAC must
 * each land on a byte boundary or the MAC is sliced at half a byte. 40 + 20 =
 * 60 divides by 5 and splits 5 bytes from 2.5, which threw at the first
 * encode. 56 + 24 = 80 satisfies both.
 */
const VERSION_BITS = 3;
const LESSON_BITS = LESSON_COUNT;
const PRACTICE_BITS = 14;
const WEAK_BITS = 20;
const RESERVED_BITS = 11;
export const PROGRESS_PAYLOAD_BITS =
  VERSION_BITS + LESSON_BITS + PRACTICE_BITS + WEAK_BITS + RESERVED_BITS;
export const PROGRESS_MAC_BITS = 24;
export const PROGRESS_TOTAL_BITS = PROGRESS_PAYLOAD_BITS + PROGRESS_MAC_BITS;
export const PROGRESS_CODE_CHARS = PROGRESS_TOTAL_BITS / 5;
export const PROGRESS_GROUPS: readonly number[] = [4, 4, 4, 4];

/** The most practice the counter can hold. Saturates rather than wrapping. */
export const MAX_PRACTICE = (1 << PRACTICE_BITS) - 1;

if (ERROR_CLASSES.length > WEAK_BITS) {
  // A build-time shout rather than a silent truncation. Adding a twentieth-first
  // error class must move the layout and the version, not quietly stop being
  // recorded — the weak-class set is the input to targeted practice, and one
  // missing bit is one thing a student never gets offered again.
  throw new Error(
    `${ERROR_CLASSES.length} error classes will not fit in ${WEAK_BITS} bits — widen the layout and bump PROGRESS_VERSION`,
  );
}

/** Everything a progress code carries. */
export interface Progress {
  readonly version: number;
  /** Lesson indices finished, ascending, each below LESSON_COUNT. */
  readonly lessonsDone: readonly number[];
  /** Problems practised, saturating at MAX_PRACTICE. */
  readonly practised: number;
  /** Error classes seen at least twice — what targeted practice is aimed at. */
  readonly weak: readonly ErrorClass[];
}

/** A progress record with nothing in it. What a first run starts from. */
export const EMPTY_PROGRESS: Progress = {
  version: PROGRESS_VERSION,
  lessonsDone: [],
  practised: 0,
  weak: [],
};

/* ------------------------------------------------------------------ */
/* Packing                                                             */
/* ------------------------------------------------------------------ */

function packProgress(progress: Progress): Uint8Array {
  const bytes = new Uint8Array(PROGRESS_TOTAL_BITS / 8);
  let bit = 0;
  const write = (value: number, width: number): void => {
    for (let k = width - 1; k >= 0; k -= 1) {
      if (((value >> k) & 1) === 1) {
        const index = bit;
        bytes[index >> 3] = (bytes[index >> 3] as number) | (1 << (7 - (index & 7)));
      }
      bit += 1;
    }
  };

  write(progress.version, VERSION_BITS);

  let lessons = 0;
  for (const index of progress.lessonsDone) {
    if (index >= 0 && index < LESSON_COUNT) lessons |= 1 << index;
  }
  write(lessons, LESSON_BITS);

  write(Math.max(0, Math.min(MAX_PRACTICE, Math.floor(progress.practised))), PRACTICE_BITS);

  let weak = 0;
  for (const name of progress.weak) {
    const at = ERROR_CLASSES.indexOf(name);
    if (at >= 0) weak |= 1 << at;
  }
  write(weak, WEAK_BITS);
  write(0, RESERVED_BITS);

  return bytes;
}

function unpackProgress(bytes: Uint8Array): Progress & { readonly reserved: number } {
  let bit = 0;
  const read = (width: number): number => {
    let value = 0;
    for (let k = 0; k < width; k += 1) {
      const index = bit;
      value = (value << 1) | (((bytes[index >> 3] as number) >> (7 - (index & 7))) & 1);
      bit += 1;
    }
    return value;
  };

  const version = read(VERSION_BITS);
  const lessons = read(LESSON_BITS);
  const practised = read(PRACTICE_BITS);
  const weak = read(WEAK_BITS);
  const reserved = read(RESERVED_BITS);

  const lessonsDone: number[] = [];
  for (let i = 0; i < LESSON_COUNT; i += 1) if (((lessons >> i) & 1) === 1) lessonsDone.push(i);

  const weakNames: ErrorClass[] = [];
  for (let i = 0; i < ERROR_CLASSES.length; i += 1) {
    if (((weak >> i) & 1) === 1) weakNames.push(ERROR_CLASSES[i] as ErrorClass);
  }

  return { version, lessonsDone, practised, weak: weakNames, reserved };
}

/**
 * The MAC key. A different derivation string from the completion code's, so a
 * progress code and a completion code can never be mistaken for one another
 * even by accident — they are different lengths as well, but two independent
 * reasons is the right number for something a student will paste into the
 * wrong box eventually.
 */
function progressKey(secret: string): Uint8Array {
  return utf8Bytes(`${secret}::progress::v${PROGRESS_VERSION}`);
}

/* ------------------------------------------------------------------ */
/* The code                                                            */
/* ------------------------------------------------------------------ */

/** Group a bare code for reading aloud and writing down. */
export function formatProgressCode(bare: string): string {
  const parts: string[] = [];
  let at = 0;
  for (const size of PROGRESS_GROUPS) {
    parts.push(bare.slice(at, at + size));
    at += size;
  }
  return parts.filter((part) => part !== '').join('-');
}

/** Turn progress into the code a student writes down. */
export function encodeProgress(progress: Progress, secret: string): string {
  const bytes = packProgress({ ...progress, version: PROGRESS_VERSION });
  const mac = hmacSha256(progressKey(secret), bytes.slice(0, PROGRESS_PAYLOAD_BITS / 8));
  // The payload is 56 bits — seven whole bytes — so the MAC starts on a byte
  // boundary and this is a straight copy rather than a shift.
  bytes.set(mac.slice(0, PROGRESS_MAC_BITS / 8), PROGRESS_PAYLOAD_BITS / 8);
  return formatProgressCode(encodeBits(bytes, PROGRESS_TOTAL_BITS));
}

export type ProgressVerdict =
  | { readonly kind: 'VALID'; readonly progress: Progress }
  /** Wrong length, or a character that is not in the alphabet. */
  | { readonly kind: 'MALFORMED'; readonly why: string }
  /** Well formed, but the check characters disagree — almost always a typo. */
  | { readonly kind: 'CHECK_FAILED' }
  /** From a version of the app that laid this out differently. */
  | { readonly kind: 'VERSION_UNKNOWN'; readonly version: number };

/**
 * Read a progress code back.
 *
 * The verdicts are separated because they need different sentences said to the
 * student: a typo is "check it and try again", an unknown version is "this came
 * from a different version of MoleBridge", and those are not the same problem.
 */
export function decodeProgress(text: string, secret: string): ProgressVerdict {
  const bare = stripSeparators(text);
  if (bare.length !== PROGRESS_CODE_CHARS) {
    return {
      kind: 'MALFORMED',
      why: `a progress code is ${PROGRESS_CODE_CHARS} characters, and this one is ${bare.length}`,
    };
  }
  const decoded = decodeBits(bare, PROGRESS_TOTAL_BITS);
  if (!decoded.ok) {
    return {
      kind: 'MALFORMED',
      why: `"${decoded.character}" at position ${decoded.offset + 1} is not part of a code`,
    };
  }

  const bytes = decoded.bytes;
  const expected = hmacSha256(progressKey(secret), bytes.slice(0, PROGRESS_PAYLOAD_BITS / 8));
  for (let i = 0; i < PROGRESS_MAC_BITS / 8; i += 1) {
    if (bytes[(PROGRESS_PAYLOAD_BITS / 8) + i] !== expected[i]) return { kind: 'CHECK_FAILED' };
  }

  const { reserved, ...progress } = unpackProgress(bytes);
  if (progress.version !== PROGRESS_VERSION) {
    return { kind: 'VERSION_UNKNOWN', version: progress.version };
  }
  // The reserved bits are written as zero, so anything else means a code from a
  // build that used them — refused rather than read as though the fields it did
  // not know about were simply absent.
  if (reserved !== 0) return { kind: 'VERSION_UNKNOWN', version: progress.version };
  return { kind: 'VALID', progress };
}

/* ------------------------------------------------------------------ */
/* Merging                                                             */
/* ------------------------------------------------------------------ */

/**
 * Combine what is on this device with what a code carries.
 *
 * ALWAYS THE UNION, NEVER A REPLACEMENT. A student who typed in a code older
 * than the device would otherwise lose everything done since, and they would
 * discover that only by noticing a lesson had un-finished itself. Nothing here
 * can ever be un-done, so taking the greater of each is both the safe answer
 * and the truthful one: they did do both.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const lessons = new Set([...a.lessonsDone, ...b.lessonsDone]);
  const weak = new Set<ErrorClass>([...a.weak, ...b.weak]);
  return {
    version: PROGRESS_VERSION,
    lessonsDone: [...lessons].sort((x, y) => x - y),
    practised: Math.min(MAX_PRACTICE, Math.max(a.practised, b.practised)),
    weak: ERROR_CLASSES.filter((name) => weak.has(name)),
  };
}

/** True where `incoming` adds nothing this device did not already have. */
export function addsNothing(existing: Progress, incoming: Progress): boolean {
  const merged = mergeProgress(existing, incoming);
  return (
    merged.lessonsDone.length === existing.lessonsDone.length &&
    merged.weak.length === existing.weak.length &&
    merged.practised === existing.practised
  );
}
