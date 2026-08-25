/**
 * lessons.test.ts — the teaching content is held to the app's own chemistry.
 *
 * These are CONTENT tests, and that is deliberate. Prose is where this project
 * is least defended: nothing type-checks a paragraph, and a worked example that
 * disagrees with what the grader does is worse than no worked example at all,
 * because a student trusts it and the app then marks them wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LESSONS, drillIsRight } from '../src/learn/lessons.ts';
import { LESSON_COUNT } from '../src/learn/progress.ts';
import { ERROR_CLASSES } from '../src/engine/taxonomy.ts';
import { molarMass } from '../src/chem/molarmass.ts';

test('there are exactly as many lessons as the progress code has bits for', () => {
  // The progress code carries one bit per lesson. An eighth lesson added here
  // and nowhere else would be a lesson nobody could ever record finishing.
  assert.equal(LESSONS.length, LESSON_COUNT);
});

test('every lesson id is unique, and so is every title', () => {
  assert.equal(new Set(LESSONS.map((l) => l.id)).size, LESSONS.length);
  assert.equal(new Set(LESSONS.map((l) => l.title)).size, LESSONS.length);
});

test("EVERY drill's own stated answer passes its own checker", () => {
  // The cheapest possible content bug: an answer written in the prose that the
  // checker would reject. It costs a student their confidence rather than a
  // mark, which is worse.
  for (const lesson of LESSONS) {
    for (const drill of lesson.drills) {
      assert.ok(
        drillIsRight(drill, drill.answer),
        `${lesson.id}: "${drill.ask}" declares "${drill.answer}" and its own checker refuses it`,
      );
    }
  }
});

test('a drill with a unit accepts the answer written with the unit', () => {
  // Students type "18.02 g/mol" because that is what the lesson just showed
  // them. Refusing it would be teaching them to distrust their own working.
  for (const lesson of LESSONS) {
    for (const drill of lesson.drills) {
      if (drill.unit === undefined) continue;
      assert.ok(
        drillIsRight(drill, `${drill.answer} ${drill.unit}`),
        `${lesson.id}: "${drill.ask}" refuses its own answer when the unit is written out`,
      );
    }
  }
});

test('drills refuse an answer that is plainly wrong', () => {
  // A checker that accepts everything passes the test above too.
  for (const lesson of LESSONS) {
    for (const drill of lesson.drills) {
      const expected = Number(drill.answer);
      const wrong = Number.isFinite(expected)
        ? String(expected * 2 + 1)
        : `${drill.answer}-definitely-not`;
      assert.ok(
        !drillIsRight(drill, wrong),
        `${lesson.id}: "${drill.ask}" accepted "${wrong}"`,
      );
      assert.ok(!drillIsRight(drill, ''), `${lesson.id}: an empty answer was accepted`);
    }
  }
});

test('every lesson teaches something, and drills it', () => {
  for (const lesson of LESSONS) {
    assert.ok(lesson.blocks.length > 0, `${lesson.id} has no content`);
    assert.ok(lesson.drills.length > 0, `${lesson.id} has nothing to practise`);
    assert.ok(lesson.promise.trim() !== '', `${lesson.id} does not say what it is for`);
    for (const block of lesson.blocks) {
      assert.ok(block.paragraphs.length > 0, `${lesson.id} has an empty block`);
    }
  }
});

test('every error class a lesson claims to answer actually exists', () => {
  for (const lesson of LESSONS) {
    for (const name of lesson.answers) {
      assert.ok(
        ERROR_CLASSES.includes(name),
        `${lesson.id} claims to answer ${name}, which is not an error class`,
      );
    }
  }
});

test('the molar masses quoted in the lessons are the ones the grader computes', () => {
  // The lessons compute these rather than typing them, so this asserts that the
  // computing actually happened — a hard-coded number would sail past every
  // other test in this file while being exactly the drift they exist to stop.
  const water = molarMass('H2O');
  const quoted = LESSONS.find((l) => l.id === 'molar-mass');
  assert.ok(quoted !== undefined);
  const text = quoted.blocks.flatMap((b) => [...b.paragraphs, ...(b.worked ?? [])]).join(' ');
  assert.ok(
    text.includes(water.value.toPrecision(water.sigFigs).replace(/\.?0+$/, '')) ||
      text.includes(String(Math.round(water.value * 100) / 100)),
    `the molar mass lesson does not quote ${water.value} to ${water.sigFigs} figures`,
  );
});

test('the seven lessons cover the chain in dependency order', () => {
  // Order is load-bearing: the mole ratio cannot be taught before balancing,
  // and limiting reactant cannot be taught before the ratio. Asserting the ids
  // in order is blunt, and blunt is right — a reordering should have to be
  // deliberate enough to edit a test.
  assert.deepEqual(
    LESSONS.map((l) => l.id),
    ['formulas', 'molar-mass', 'the-mole', 'balancing', 'mole-ratio', 'limiting', 'percent-yield'],
  );
});
