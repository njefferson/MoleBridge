/**
 * progress.test.ts — the progress code carries what it says and refuses what it
 * should.
 *
 * The MAC here is anti-corruption rather than anti-cheat, so what is asserted
 * is that a MANGLED code is refused — not that a determined student cannot
 * forge one, which they can, and which does not matter because lessons are
 * never locked. See the header of `src/learn/progress.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_PROGRESS,
  LESSON_COUNT,
  MAX_PRACTICE,
  PROGRESS_CODE_CHARS,
  PROGRESS_VERSION,
  addsNothing,
  decodeProgress,
  encodeProgress,
  mergeProgress,
  type Progress,
} from '../src/learn/progress.ts';
import { ERROR_CLASSES } from '../src/engine/taxonomy.ts';
import { CROCKFORD_ALPHABET } from '../src/code/base32.ts';

const SECRET = 'progress-test-secret';

const sample: Progress = {
  version: PROGRESS_VERSION,
  lessonsDone: [0, 2, 6],
  practised: 37,
  weak: ['E-RATIO-INVERTED', 'E-MM-ARITH'],
};

test('a progress code round-trips everything it carries', () => {
  const code = encodeProgress(sample, SECRET);
  const verdict = decodeProgress(code, SECRET);
  assert.equal(verdict.kind, 'VALID');
  if (verdict.kind !== 'VALID') return;

  assert.deepEqual(verdict.progress.lessonsDone, [0, 2, 6]);
  assert.equal(verdict.progress.practised, 37);
  // Order comes back in ERROR_CLASSES order rather than the order given, which
  // is deliberate: a set has no order and pretending otherwise invites a test
  // that passes for the wrong reason.
  assert.deepEqual([...verdict.progress.weak].sort(), ['E-MM-ARITH', 'E-RATIO-INVERTED']);
});

test('it is short enough to write on the back of an exercise book', () => {
  const code = encodeProgress(sample, SECRET);
  assert.equal(code.replace(/-/g, '').length, PROGRESS_CODE_CHARS);
  assert.equal(PROGRESS_CODE_CHARS, 16, "sixteen characters, four groups of four");
  for (const character of code.replace(/-/g, '')) {
    assert.ok(CROCKFORD_ALPHABET.includes(character), `${character} is outside the alphabet`);
  }
});

test('EVERY single-character typo is refused, which is what the MAC is for', () => {
  // Exhaustive over the whole code rather than a sample: this is the property
  // the check characters exist to provide, and "we tried a few" is not it.
  const code = encodeProgress(sample, SECRET).replace(/-/g, '');
  let checked = 0;
  for (let at = 0; at < code.length; at += 1) {
    for (const replacement of CROCKFORD_ALPHABET) {
      if (replacement === code[at]) continue;
      const mangled = code.slice(0, at) + replacement + code.slice(at + 1);
      const verdict = decodeProgress(mangled, SECRET);
      assert.notEqual(
        verdict.kind,
        'VALID',
        `${mangled} differs from ${code} by one character and was accepted`,
      );
      checked += 1;
    }
  }
  assert.equal(checked, code.length * (CROCKFORD_ALPHABET.length - 1));
});

test('a code from a different build is refused rather than half-read', () => {
  const code = encodeProgress(sample, SECRET);
  const verdict = decodeProgress(code, 'a-different-build-secret');
  assert.equal(verdict.kind, 'CHECK_FAILED');
});

test('the wrong length is MALFORMED, and says so in numbers', () => {
  const short = decodeProgress('ABC', SECRET);
  assert.equal(short.kind, 'MALFORMED');
  if (short.kind === "MALFORMED") assert.match(short.why, /16 characters/);
});

test('the practice counter saturates rather than wrapping', () => {
  // Wrapping would show a student who practised a great deal that they had
  // practised almost none, which is the worst possible direction to be wrong in.
  const lots: Progress = { ...sample, practised: MAX_PRACTICE + 500 };
  const verdict = decodeProgress(encodeProgress(lots, SECRET), SECRET);
  assert.equal(verdict.kind, 'VALID');
  if (verdict.kind === 'VALID') assert.equal(verdict.progress.practised, MAX_PRACTICE);
});

test('every lesson and every error class survives the round trip', () => {
  const everything: Progress = {
    version: PROGRESS_VERSION,
    lessonsDone: Array.from({ length: LESSON_COUNT }, (_, i) => i),
    practised: MAX_PRACTICE,
    weak: ERROR_CLASSES,
  };
  const verdict = decodeProgress(encodeProgress(everything, SECRET), SECRET);
  assert.equal(verdict.kind, 'VALID');
  if (verdict.kind !== 'VALID') return;
  assert.equal(verdict.progress.lessonsDone.length, LESSON_COUNT);
  assert.equal(verdict.progress.weak.length, ERROR_CLASSES.length, 'no class is quietly dropped');
});

test('merging is a union, so an older code can never un-finish a lesson', () => {
  const onDevice: Progress = { ...EMPTY_PROGRESS, lessonsDone: [0, 1, 2, 3], practised: 40 };
  const olderCode: Progress = { ...EMPTY_PROGRESS, lessonsDone: [0, 1], practised: 5 };
  const merged = mergeProgress(onDevice, olderCode);
  assert.deepEqual(merged.lessonsDone, [0, 1, 2, 3], 'nothing is taken away');
  assert.equal(merged.practised, 40, 'and the greater count wins');
});

test('a code that adds nothing is recognised as adding nothing', () => {
  const onDevice: Progress = { ...EMPTY_PROGRESS, lessonsDone: [0, 1], practised: 9 };
  assert.ok(addsNothing(onDevice, { ...EMPTY_PROGRESS, lessonsDone: [0], practised: 2 }));
  assert.ok(!addsNothing(onDevice, { ...EMPTY_PROGRESS, lessonsDone: [0, 5], practised: 2 }));
});
