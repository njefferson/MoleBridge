/**
 * readout.ts — what a code says, in the words of the person holding it.
 *
 * ## The point, which is not "describe the code"
 *
 * A student types a short string into Canvas and has no idea what they just
 * handed over. The screen said the code "carries counts only, no answers, no
 * name" — a true SENTENCE about the code, written by whoever built it, and
 * exactly as trustworthy as any other sentence a piece of software tells you
 * about itself. A fifteen-year-old handing in something opaque and being
 * reassured about it is not the same as being shown it.
 *
 * So this DECODES THE CODE THE STUDENT IS HOLDING and lists what came out. Not
 * what was put in — what a decoder gets back, which is exactly what their
 * teacher's page will show. The readout cannot drift from the truth, because
 * the readout IS the truth, run in front of them.
 *
 * ## Every field is accounted for, and the test is what makes that true
 *
 * A code that carried something undescribed would be the original problem back
 * again. `readout.test.ts` walks `FIELDS` and requires each one to be either a
 * line here or named in `NOT_SHOWN` with a reason — so adding a field to the
 * codec and forgetting this file fails the build.
 *
 * ## DOM-free
 *
 * Same reasoning as `render.ts`: what the readout SAYS is worth testing, and a
 * test of it should not need a browser.
 */

import { FIELDS, totalStageErrors, type CompletionPayload, type FieldName } from '../code/codec.ts';
import type { Progress } from '../learn/progress.ts';

/** One thing the code says. */
export interface ReadoutLine {
  /** What it is, in the student's words. */
  readonly says: string;
  /** The value, already written out. */
  readonly value: string;
}

export interface Readout {
  readonly lines: readonly ReadoutLine[];
  /** What is NOT in it, said outright rather than left as an absence. */
  readonly notIn: readonly string[];
}

/**
 * Fields a student is not shown a line for, and why.
 *
 * DECLARED RATHER THAN DROPPED. A field quietly missing from this file is a
 * field the student was told about and was not; naming it here is what makes
 * the omission a decision somebody made.
 */
export const NOT_SHOWN: { readonly [K in string]?: string } = {
  // Which layout the code uses. It says nothing about the student and changes
  // only when the code's own format does.
  version: 'the code format, which is about MoleBridge rather than about you',
};

/** The steps, named as the app names them to a student. */
const STEP_NAMES: readonly string[] = [
  'balancing',
  'the molar mass',
  'grams to moles',
  'the mole ratio',
  'how much is made',
  'the final conversion',
];

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * What a completion code says.
 *
 * PRECONDITION: `payload` came out of `decodeCompletionCode` on the code the
 * student is looking at — not out of the session. Decoding is the whole point:
 * it is the same operation the teacher's page performs, so what the student
 * reads is what the teacher will read.
 */
export function completionReadout(payload: CompletionPayload, assignmentKey: string): Readout {
  const lines: ReadoutLine[] = [
    {
      says: 'Which assignment it is for',
      value: `${assignmentKey} — the code carries a number standing for this key, not the words`,
    },
    { says: 'Your roster number', value: String(payload.rosterId) },
    { says: 'Problems you finished', value: String(payload.attempted) },
    {
      says: 'Problems where every step was right first time',
      value: String(payload.firstTryCorrect),
    },
  ];

  const errors = totalStageErrors(payload);
  const perStep = ([payload.errS1, payload.errS2, payload.errS3, payload.errS4, payload.errS5, payload.errS6] as const)
    .map((count, at) => ({ count, name: STEP_NAMES[at] ?? `step ${at + 1}` }))
    .filter((step) => step.count > 0)
    .map((step) => `${step.count} at ${step.name}`);
  /*
    THE SHAPE IS SAID EVEN WHERE THE COUNT IS ZERO. Listing six lines of "0"
    is noise, and naming only the steps that went wrong leaves a student unable
    to tell whether the code has a slot for the others — which is the same
    not-knowing the readout exists to remove. So the steps that went wrong are
    named, and the sentence says a count is carried for all six either way.
  */
  lines.push({
    says: `Wrong answers — the code carries a count for each of the ${STEP_NAMES.length} steps (${STEP_NAMES.join(', ')})`,
    value: errors === 0 ? 'none at any step' : `${errors} in total — ${perStep.join(', ')}`,
  });

  lines.push({
    says: 'Times the algebra help appeared',
    value: String(payload.algebraTriggers),
  });
  lines.push({
    says: 'Answers MoleBridge could not explain',
    value:
      payload.unclassified === 0
        ? 'none'
        : `${payload.unclassified} — this counts against MoleBridge, not against you`,
  });
  lines.push({
    says: 'How long you had it open',
    value: plural(payload.durationMin, 'minute', 'minutes'),
  });
  lines.push({
    says: 'Which day you did it',
    value:
      payload.dayOffset === 0
        ? 'the day the assignment was set'
        : plural(payload.dayOffset, 'day after it was set', 'days after it was set'),
  });

  return { lines, notIn: NOT_IN_A_CODE };
}

/**
 * The same list for both codes, because it is the same promise.
 *
 * SAID AS SPECIFIC THINGS, not as "nothing personal". A student worried about
 * what they just handed in is worried about particular things, and a general
 * reassurance answers none of them.
 */
const NOT_IN_A_CODE: readonly string[] = [
  'your name — there is nowhere in MoleBridge to type one',
  'anything you typed as an answer',
  'any of your working',
  'anything about the device you used',
  'when you were working, beyond how long it took and which day',
];

/**
 * What a progress code says.
 *
 * A progress code is not handed to anybody, and it still gets typed into a box
 * on another machine — so the same question applies, and the answer is shorter.
 */
export function progressReadout(progress: Progress, lessonTitles: readonly string[]): Readout {
  const finished = progress.lessonsDone
    .map((index) => lessonTitles[index])
    .filter((title): title is string => title !== undefined);
  const lines: ReadoutLine[] = [
    {
      says: 'Lessons marked finished',
      value:
        finished.length === 0
          ? 'none yet'
          : `${finished.length} of ${lessonTitles.length} — ${finished.join(', ')}`,
    },
    { says: 'Problems you have practised', value: String(progress.practised) },
    {
      says: 'Things to come back to',
      value:
        progress.weak.length === 0
          ? 'none marked'
          : `${progress.weak.length} kind${progress.weak.length === 1 ? '' : 's'} of mistake you have made twice`,
    },
  ];
  return {
    lines,
    notIn: [
      'your name',
      'your roster number',
      'anything you typed as an answer',
      'which problems you got right or wrong',
      'anything that is sent anywhere — this code stays on your device unless you carry it',
    ],
  };
}

/** Every field the completion code carries, for the test that holds this honest. */
export const COMPLETION_FIELDS: readonly FieldName[] = FIELDS.map((field) => field.name);
