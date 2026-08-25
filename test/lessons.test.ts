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
import { parseEquation, solveBalance } from '../src/chem/balance.ts';

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

test('the lessons cover the chain in dependency order', () => {
  // Order is load-bearing: the mole ratio cannot be taught before balancing,
  // and limiting reactant cannot be taught before the ratio. Asserting the ids
  // in order is blunt, and blunt is right — a reordering should have to be
  // deliberate enough to edit a test.
  assert.deepEqual(
    LESSONS.map((l) => l.id),
    ['formulas', 'molar-mass', 'the-mole', 'balancing', 'mole-ratio', 'limiting', 'other-units', 'percent-yield'],
  );
});

test('the balancing drills are the unique lowest-terms answer, checked by the solver', () => {
  /*
    THE SOLVER IS IMPORTED HERE AND NOWHERE NEAR THE SHIPPED CODE. `solveBalance`
    must not be reachable from a student-facing path, and `lessons.ts` ships to
    the browser — so the coefficients are declared there and verified here,
    where a test file never reaches a student.

    This closes the gap the owner asked about: a drill answer that is merely a
    literal is only as right as whoever typed it, and the "its own checker
    accepts it" test is CIRCULAR for those — 13 oxygens would have passed it.
  */
  const equations: Record<string, string> = {
    'Balance: __ N₂ + __ H₂ → __ NH₃. Give the three coefficients separated by spaces.':
      'N2 + H2 -> NH3',
    'Balance: __ CH₄ + __ O₂ → __ CO₂ + __ H₂O. Four coefficients, separated by spaces.':
      'CH4 + O2 -> CO2 + H2O',
  };

  const balancing = LESSONS.find((l) => l.id === 'balancing');
  assert.ok(balancing !== undefined);
  assert.equal(balancing.drills.length, Object.keys(equations).length, 'a drill here has no equation to check it against');

  for (const drill of balancing.drills) {
    const source = equations[drill.ask];
    assert.ok(source !== undefined, `no equation recorded for "${drill.ask}"`);
    const solved = solveBalance(parseEquation(source));
    assert.equal(solved.ok, true, `${source} did not balance`);
    if (!solved.ok) continue;
    assert.deepEqual(
      drill.answer.split(/\s+/).map(Number),
      [...solved.coefficients],
      `the drill for ${source} declares ${drill.answer}`,
    );
  }
});

test('the limiting-reactant drills agree with moles over coefficient', () => {
  // Worked here rather than in the shipped file because the arithmetic is the
  // thing being taught: a student divides moles by coefficient and takes the
  // smallest. If that rule and these answers ever disagree, one of them is
  // teaching the wrong thing.
  const cases: Record<string, { readonly moles: readonly number[]; readonly coefficients: readonly number[]; readonly names: readonly string[] }> = {
    'For 2H₂ + O₂ → 2H₂O with 4.0 mol H₂ and 4.0 mol O₂, which is limiting? Answer H2 or O2.':
      { moles: [4.0, 4.0], coefficients: [2, 1], names: ['H2', 'O2'] },
    'For N₂ + 3H₂ → 2NH₃ with 2.0 mol N₂ and 3.0 mol H₂, which is limiting? Answer N2 or H2.':
      { moles: [2.0, 3.0], coefficients: [1, 3], names: ['N2', 'H2'] },
  };

  const limiting = LESSONS.find((l) => l.id === 'limiting');
  assert.ok(limiting !== undefined);
  assert.equal(limiting.drills.length, Object.keys(cases).length);

  for (const drill of limiting.drills) {
    const setup = cases[drill.ask];
    assert.ok(setup !== undefined, `no setup recorded for "${drill.ask}"`);
    const ratios = setup.moles.map((mol, i) => mol / (setup.coefficients[i] as number));
    let smallest = 0;
    for (let i = 1; i < ratios.length; i += 1) {
      if ((ratios[i] as number) < (ratios[smallest] as number)) smallest = i;
    }
    assert.equal(drill.answer, setup.names[smallest], `the drill for "${drill.ask}" declares ${drill.answer}`);
  }
});
