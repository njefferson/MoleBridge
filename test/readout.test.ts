/**
 * readout.test.ts — a code says nothing a student was not shown.
 *
 * The screen used to carry a SENTENCE about the completion code — "counts only,
 * no answers, no name" — which was true and was written by whoever built it. A
 * student handing in something opaque and being reassured about it is not the
 * same as being shown it. So the readout decodes the code they are holding, and
 * this holds the readout to the codec: a field that exists and is not accounted
 * for fails the build.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIELDS, encodeCompletionCode, decodeCompletionCode, type CompletionPayload } from '../src/code/codec.ts';
import { completionReadout, progressReadout, NOT_SHOWN } from '../src/report/readout.ts';
import { EMPTY_PROGRESS } from '../src/learn/progress.ts';

const PAYLOAD: CompletionPayload = {
  version: 1,
  assignmentKeyId: 1234,
  rosterId: 42,
  attempted: 6,
  firstTryCorrect: 4,
  // EVERY STEP NONZERO, so the coverage check below can prove each step's name
  // is reachable. A fixture with zeros in it cannot tell "shown as none" from
  // "never described", which is what let the first version of this pass while
  // the molar-mass step had no words at all.
  errS1: 1, errS2: 3, errS3: 2, errS4: 1, errS5: 2, errS6: 1,
  algebraTriggers: 2,
  unclassified: 1,
  durationMin: 24,
  dayOffset: 3,
};

test('EVERY FIELD THE CODE CARRIES IS ACCOUNTED FOR', () => {
  /*
    The one that matters. A field added to the codec and forgotten here would be
    something a student hands over without being shown — which is the whole
    problem the readout exists to remove, reappearing silently.

    Accounted for means: named in a line, folded into the per-step wrong-answer
    line, or declared in NOT_SHOWN with a reason.
  */
  const readout = completionReadout(PAYLOAD, 'PERIOD3-OCT14');
  const text = readout.lines.map((line) => `${line.says}: ${line.value}`).join('\n');

  const covered: { readonly [K in string]?: (t: string) => boolean } = {
    assignmentKeyId: (t) => /assignment/i.test(t),
    rosterId: (t) => t.includes('42'),
    attempted: (t) => /finished/i.test(t),
    firstTryCorrect: (t) => /first time/i.test(t),
    errS1: (t) => /balancing/i.test(t),
    errS2: (t) => /molar mass/i.test(t),
    errS3: (t) => /grams to moles/i.test(t),
    errS4: (t) => /mole ratio/i.test(t),
    errS5: (t) => /how much is made/i.test(t),
    errS6: (t) => /final conversion/i.test(t),
    algebraTriggers: (t) => /algebra/i.test(t),
    unclassified: (t) => /could not explain/i.test(t),
    durationMin: (t) => /24 minutes/.test(t),
    dayOffset: (t) => /3 days after/.test(t),
  };

  for (const field of FIELDS) {
    const reason = NOT_SHOWN[field.name];
    if (reason !== undefined) {
      assert.ok(reason.length > 10, `${field.name} is declared not-shown without a reason worth reading`);
      continue;
    }
    const rule = covered[field.name];
    assert.ok(
      rule !== undefined,
      `${field.name} is carried by the code, is not declared in NOT_SHOWN, and this test does not check it`,
    );
    assert.ok(rule(text), `${field.name} is carried by the code and the readout does not show it:\n${text}`);
  }
});

test('the readout is what a DECODER returns, not what the app remembers', () => {
  // The guarantee is that a student sees what their teacher will see. That only
  // holds if the readout comes from decoding the code rather than from the
  // session that made it, so this goes the whole way round.
  const secret = 'walk-secret';
  const code = encodeCompletionCode(PAYLOAD, secret);
  const decoded = decodeCompletionCode(code, secret);
  assert.equal(decoded.verdict, 'VALID');
  const fromCode = completionReadout(decoded.fields as CompletionPayload, 'PERIOD3-OCT14');
  const fromPayload = completionReadout(PAYLOAD, 'PERIOD3-OCT14');
  assert.deepEqual(fromCode, fromPayload, 'the code does not decode to what the app thinks it says');
});

test('it says what is NOT in the code, as specific things', () => {
  const readout = completionReadout(PAYLOAD, 'PERIOD3-OCT14');
  const notIn = readout.notIn.join(' ');
  // A student worried about what they handed in is worried about particular
  // things. "Nothing personal" answers none of them.
  assert.match(notIn, /name/i);
  assert.match(notIn, /answer/i);
  assert.match(notIn, /working/i);
  assert.ok(readout.notIn.length >= 4, 'too vague to settle anything');
});

test('the progress code says what it carries too, and that it goes nowhere', () => {
  const readout = progressReadout(
    { ...EMPTY_PROGRESS, lessonsDone: [0, 2], practised: 17 },
    ['Reading a formula', 'Molar mass', 'Grams and moles'],
  );
  const text = readout.lines.map((line) => `${line.says}: ${line.value}`).join('\n');
  assert.match(text, /Reading a formula/);
  assert.match(text, /Grams and moles/);
  assert.match(text, /17/);
  assert.match(readout.notIn.join(' '), /stays on your device/i);
});

test('a clean session reads as clean, without inventing a problem', () => {
  const spotless = {
    ...PAYLOAD,
    errS1: 0, errS2: 0, errS3: 0, errS4: 0, errS5: 0, errS6: 0,
    algebraTriggers: 0, unclassified: 0,
  };
  const text = completionReadout(spotless, 'K').lines.map((l) => `${l.says}: ${l.value}`).join('\n');
  assert.match(text, /none at any step/);
  assert.match(text, /could not explain: none/);
});
