/**
 * carry.test.ts — the number goes back in the box, with its unit.
 *
 * `withNumber` is the whole of the calculator hand-back that can be wrong
 * without a browser noticing: an empty box, a bare number, a number with a
 * unit, a box holding only a unit, and a number in scientific notation, which
 * this app produces constantly because Avogadro's number is in half its
 * problems.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import { isCarried, withNumber } from '../src/ui/carry.ts';
import { startSession } from '../src/engine/steps.ts';

test('an empty box takes the number and nothing else', () => {
  assert.equal(withNumber('', '180.156'), '180.156');
  assert.equal(withNumber('   ', '180.156'), '180.156');
});

test('a unit already typed is kept, because retyping it is the same chore', () => {
  assert.equal(withNumber('12.5 g/mol', '180.156'), '180.156 g/mol');
  assert.equal(withNumber('0.5 mol', '0.0663836'), '0.0663836 mol');
  // Partway through typing: a unit and no number yet.
  assert.equal(withNumber('g/mol', '180.156'), '180.156 g/mol');
});

test('a bare number is replaced by a bare number — no unit is invented', () => {
  // Inventing one would be the app answering a part of the question it was not
  // asked, and this app grades the unit.
  assert.equal(withNumber('42', '180.156'), '180.156');
  assert.equal(withNumber('-3.5', '7'), '7');
});

test('scientific notation on either side survives', () => {
  assert.equal(withNumber('1.2e24 particles', '1.408e24'), '1.408e24 particles');
  assert.equal(withNumber('', '6.022e23'), '6.022e23');
});

test('what comes back off the device is checked before it reaches a screen', () => {
  // Storage is writable by anything on the machine, and these strings are
  // rendered into the rail.
  assert.ok(isCarried([]));
  assert.ok(isCarried([{ stage: 'S2', text: '180.156 g/mol' }]));
  assert.ok(!isCarried('S2'));
  assert.ok(!isCarried([{ stage: 'S2' }]));
  assert.ok(!isCarried([{ stage: 'S2', text: 42 }]));
  assert.ok(!isCarried([{ stage: 'S2', text: 'x'.repeat(65) }]), 'a long string is refused');
  assert.ok(!isCarried([null]));
});

test('NOTHING A STUDENT TYPED CAN REACH THE COMPLETION CODE', () => {
  // The rail keeps what they typed. The codec must not.
  //
  // STRUCTURAL, NOT A WORD SEARCH. The first version of this grepped the
  // sources for "carried" and failed on two comments about significant-figure
  // guard digits — a predicate that did not match its own sentence, which is
  // the exact shape hub LESSONS 153 is about. What actually has to be true is
  // that the grader, the codec and the report cannot SEE this module.
  for (const file of ['src/engine/steps.ts', 'src/code/codec.ts', 'src/report/render.ts']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(
      !/from '[^']*carry\.ts'/.test(source),
      `${file} imports the carried values — they are UI state and must never reach the code, the report or the grader`,
    );
  }

  // And the running session itself has no room for one. The completion code is
  // built from these fields; a field holding an answer would be in it.
  const session = startSession(
    {
      mode: 'practice',
      assignmentKey: 'CARRY-TEST',
      assignmentKeyId: 1,
      rosterId: 1,
      tier: 2,
      problemCount: 1,
      assignmentEpochMs: 0,
    },
    { now: () => 0 },
  );
  for (const key of Object.keys(session)) {
    assert.ok(
      !/carr|entry|entries|answer|typed|working/i.test(key),
      `Session.${key} looks like somewhere a student's own text could live`,
    );
  }
});
