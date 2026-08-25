/**
 * assignment.ts — one thing the teacher writes on the board.
 *
 * The completion code carries a 12-bit assignment id, and the problem generator
 * takes an assignment KEY as a string. Those are two different things, and
 * asking a teacher to hand out both — and a class of thirty to type both
 * correctly — is two chances to get it wrong for no benefit anybody can see.
 *
 * So the id is DERIVED from the key. One thing goes on the board, one thing
 * gets typed, and the teacher's decoder derives the same id from the same key.
 *
 * WHAT THIS IS NOT. Twelve bits is 4096 values, so different keys do collide.
 * That is fine and is not a security property: the id exists to bind a code to
 * an assignment so a code pasted into the wrong gradebook column is caught, and
 * a teacher comparing against their OWN key already knows which assignment they
 * are looking at. §9 is explicit that none of this resists a student who reads
 * the bundle.
 *
 * PURE. No I/O, no globals, no clock.
 */

import { hashString } from './rng.ts';

/** The assignment id is 12 bits, as §8.2 lays the code out. */
export const ASSIGNMENT_ID_MASK = 0xfff;

/**
 * The 12-bit assignment id for a key, as the completion code carries it.
 *
 * PRECONDITION: `key` is the assignment key exactly as typed, after
 * {@link normaliseAssignmentKey}. Two keys differing only in case or in
 * surrounding space are the SAME assignment, because a class of thirty will
 * type it thirty slightly different ways.
 */
export function assignmentKeyIdFor(key: string): number {
  return hashString(normaliseAssignmentKey(key)) & ASSIGNMENT_ID_MASK;
}

/**
 * Fold an assignment key to the form everything else uses.
 *
 * PRECONDITION: none. Trims, collapses inner runs of space, and upper-cases —
 * so `chem a`, `CHEM-A ` and `Chem  A` are one assignment, and every device in
 * the room generates the same problems from what is on the board.
 */
export function normaliseAssignmentKey(key: string): string {
  return key.trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Roster numbers a teacher may assign. Never a name — §2 of the specification. */
export const MIN_ROSTER_ID = 1;
/** The largest, set by the 12 bits the code gives it. */
export const MAX_ROSTER_ID = 4095;

/**
 * True where a roster number is one a teacher could have assigned.
 *
 * PRECONDITION: none.
 */
export function isValidRosterId(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_ROSTER_ID && value <= MAX_ROSTER_ID;
}
