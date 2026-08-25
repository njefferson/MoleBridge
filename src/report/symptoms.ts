/**
 * symptoms.ts — what a student picks from, in their words.
 *
 * DOM-FREE and in its own directory rather than beside the panel. The test that
 * checks the report carries nothing identifying imports this, and `src/ui` is
 * compiled against the DOM while the tests are not — a list living next to the
 * panel would drag `HTMLInputElement` into a project that has never heard of it.
 *
 * The words are the STUDENT'S. A symptom list written in engineer's terms gets
 * the wrong one picked, which is worse than none being picked at all, and a
 * test refuses "exception", "stack", "console", "undefined" and "null".
 */

/** One thing that can go wrong, as a student would say it. */
export interface Symptom {
  /** Short and shouty, for whoever reads the report. */
  readonly tag: string;
  /** What the student sees on the radio button. */
  readonly said: string;
}

export const SYMPTOMS: readonly Symptom[] = [
  { tag: 'MARKED-WRONG-BUT-RIGHT', said: 'It said my answer was wrong and I think it was right' },
  { tag: 'STUCK', said: 'It will not let me go on to the next step' },
  { tag: 'NOTHING-HAPPENS', said: 'A button does nothing when I press it' },
  { tag: 'CANNOT-READ', said: 'Something is cut off, overlapping, or too small to read' },
  { tag: 'WRONG-EXPLANATION', said: 'The explanation it gave me does not match what I did' },
  { tag: 'CODE-PROBLEM', said: 'Something is wrong with a code — completion or progress' },
  { tag: 'CRASHED', said: 'The screen went blank or the app stopped working' },
  // There is always one the list did not predict, and a student who cannot find
  // theirs closes the tab rather than choosing the nearest wrong thing.
  { tag: 'OTHER', said: 'Something else' },
];
