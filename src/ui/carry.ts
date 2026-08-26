/**
 * carry.ts — the numbers a student has already committed, kept where they can see them.
 *
 * ## Why this exists
 *
 * Stoichiometry is a chain. The molar mass computed at step 2 is an input to
 * step 3; the moles from step 3 feed the ratio; the ratio feeds step 5. The app
 * asked for each one in turn and then took it off the screen, so a student four
 * steps in either remembered a nine-figure number or wrote it on paper.
 *
 * **The app was already instructing them to do the impossible.** A revealed
 * intermediate says to carry the unrounded value into the next step and round
 * once at the end. That instruction cannot be followed against a number that is
 * no longer on screen.
 *
 * ## What is shown is what THEY typed
 *
 * Not the exact value the grader holds. Two reasons, and the second is the
 * important one.
 *
 * A student whose entry was accepted inside tolerance typed something slightly
 * different from the exact value. Showing the exact value would silently
 * correct them, which is the app quietly doing a step it did not admit to.
 *
 * And rounding early is a NAMED ERROR CLASS in this taxonomy. A student who
 * rounds at step 3 and carries their own rounded number into step 5 produces
 * exactly the wrong answer that class predicts, and the app attributes it and
 * says so. If the log handed them the unrounded value instead, the app would be
 * silently repairing the mistake it exists to teach them about — and they would
 * never find out they had made it.
 *
 * ## Where it lives, and where it must never go
 *
 * In the UI, and in the saved session on this device. NOT in `Session`, whose
 * counters are what the completion code is built from — the code carries counts
 * and has never carried anything a student typed. NOT in the problem report,
 * which says in its own words that it contains no answers and no working. The
 * walk asserts both.
 */

/** One step the student has finished, and what they put in it. */
export interface Carried {
  /** The stage id, e.g. `S2`. */
  readonly stage: string;
  /** Exactly what the student typed and had accepted. Never the exact value. */
  readonly text: string;
}

/** Nothing carried is a valid state: it is every student's first step. */
export const NO_CARRY: readonly Carried[] = [];

/**
 * A `Carried[]` read back from storage, or null where it is anything else.
 *
 * STRICT, in the same way `isSavedSession` is: this comes off `localStorage`,
 * which anything on the device can write, and a half-valid array rendered into
 * the rail would put arbitrary text on the screen.
 */
export function isCarried(value: unknown): value is readonly Carried[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      typeof item === 'object'
      && item !== null
      && typeof (item as Carried).stage === 'string'
      && typeof (item as Carried).text === 'string'
      && (item as Carried).stage.length <= 8
      && (item as Carried).text.length <= 64,
  );
}

/**
 * The entry to put in a box, given what the calculator worked out and whatever
 * was in the box already.
 *
 * THE UNIT IS KEPT. A student partway through typing "12.5 g/mol" who opens the
 * calculator, computes the real molar mass and presses the button should get
 * "180.156 g/mol" back — not a bare number they then have to add a unit to,
 * which is the transcription this whole feature exists to remove. The unit is
 * whatever followed the number they had typed; where they had typed no unit,
 * none is invented, because inventing one would be the app answering a part of
 * the question it was not asked.
 *
 * PURE, so the interesting cases — an empty box, a bare number, a number with a
 * unit, a box holding only a unit — are tested without a browser.
 */
export function withNumber(existing: string, result: string): string {
  const unit = existing.replace(/^\s*[-+]?[\d.,]*(?:[eE][-+]?\d+)?\s*/, '').trim();
  return unit === '' ? result : `${result} ${unit}`;
}
