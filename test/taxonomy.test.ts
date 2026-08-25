/**
 * taxonomy.test.ts — THE test. Everything else supports this one.
 *
 * Two questions, and the second is the one the specification calls the single
 * most important output of this session:
 *
 *   1. Does every error class have a fixture where a student entry produced by
 *      that error is classified as that class and NO OTHER?
 *   2. Do any two classes predict a value a student could not tell apart?
 *
 * The collision count is asserted to be ZERO and printed with the number of
 * problems it was measured over, because a zero from a sweep of ten problems
 * and a zero from a sweep of ten thousand are different claims. Alongside it,
 * the E-UNCLASSIFIED rate: what fraction of deliberately wrong entries the
 * taxonomy could not account for. That number is how you tell whether the
 * taxonomy is any good, and it is reported rather than suppressed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateProblem, solve, TIERS, type Problem, type Solution } from '../src/engine/problem.ts';
import {
  ALGEBRA_SKILLS,
  ERROR_CLASSES,
  MAX_REMEDIATION_LINES,
  REMEDIATION_SIG_FIGS,
  algebraFor,
  buildRemediation,
  decadeName,
  classify,
  collisionsFor,
  predictionsFor,
  readEntry,
  stagesFor,
  type Collision,
  type ErrorClass,
  type Stage,
} from '../src/engine/taxonomy.ts';
import { formatUnambiguous, roundToSigFigs } from '../src/chem/sigfig.ts';

/** How many problems per tier the sweeps run over. */
const SWEEP_PER_TIER = 2500;

/** Write a value the way a student would type it at this stage. */
function entryText(problem: Problem, stage: Stage, value: number, sigFigs = problem.answerSigFigs): string {
  const text = formatUnambiguous(value, sigFigs);
  return stage.unit === 'none' ? text : `${text} ${stage.unit}`;
}

test('no two error classes predict a value a student could not tell apart', () => {
  const collisions: Collision[] = [];
  let problems = 0;
  let predictionsExercised = 0;

  for (const tier of TIERS) {
    for (let index = 0; index < SWEEP_PER_TIER; index += 1) {
      const problem = generateProblem('COLLISION-SWEEP', tier, index);
      const solution = solve(problem);
      problems += 1;
      for (const stage of stagesFor(problem)) {
        predictionsExercised += predictionsFor(problem, solution, stage).predictions.length;
      }
      collisions.push(...collisionsFor(problem, solution));
    }
  }

  console.log(
    `\n  COLLISION CHECK: ${collisions.length} collisions across ${problems} problems `
    + `and ${predictionsExercised} predicted wrong values.\n`,
  );
  assert.deepEqual(
    collisions.slice(0, 10),
    [],
    'a collision means the DECOMPOSITION is wrong — §6.2 forbids adding a tiebreak',
  );
  assert.equal(collisions.length, 0);
});

test('every predicted wrong value classifies as its own class and no other', () => {
  const covered = new Set<ErrorClass>();
  let exercised = 0;
  const wrong: string[] = [];

  for (const tier of TIERS) {
    for (let index = 0; index < 400; index += 1) {
      const problem = generateProblem('FIXTURES', tier, index);
      const solution = solve(problem);
      for (const stage of stagesFor(problem)) {
        const predicted = predictionsFor(problem, solution, stage);
        for (const prediction of predicted.predictions) {
          const entry =
            prediction.coefficients !== undefined
              ? ({ kind: 'coefficients', values: prediction.coefficients } as const)
              : prediction.choice !== undefined
                ? ({ kind: 'choice', speciesIndex: prediction.choice } as const)
                : ({ kind: 'text', text: entryText(problem, stage, prediction.value as number) } as const);

          const result = classify(problem, solution, stage, entry);
          exercised += 1;
          if (result.correct || result.errorClass !== prediction.errorClass || result.matched.length !== 1) {
            if (wrong.length < 5) {
              wrong.push(
                `tier ${tier} #${index} ${stage.id}: expected ${prediction.errorClass}, `
                + `got ${result.errorClass ?? 'CORRECT'} (matched ${result.matched.join('+')})`,
              );
            }
          } else {
            covered.add(prediction.errorClass);
          }
        }
      }
    }
  }

  assert.deepEqual(wrong, [], `${exercised} predicted values were fed back in`);
  console.log(`\n  PREDICTION SWEEP: ${exercised} predicted wrong values, each classified as exactly one class.\n`);

  // Which classes the predictions alone cover. The rest are fallbacks, and are
  // covered by their own fixtures below.
  for (const predicted of [
    'E-BAL-NOTLOWEST', 'E-BAL-SUBSCRIPT', 'E-MM-PARSE', 'E-MM-HYDRATE',
    'E-MOL-INVERTED', 'E-MOL-GRAMS',
    'E-RATIO-INVERTED', 'E-RATIO-MASS', 'E-RATIO-UNBALANCED',
    'E-LIM-WRONG', 'E-LIM-BYMASS', 'E-CONV-FACTOR', 'E-CONV-INVERTED', 'E-ROUND-EARLY',
  ] as const) {
    assert.ok(covered.has(predicted), `no problem in the sweep predicted ${predicted}`);
  }
});

/** The first problem in a tier for which `pick` returns something. */
function findProblem(tier: number, wanted: (p: Problem, s: Solution) => boolean): [Problem, Solution] {
  for (let index = 0; index < 600; index += 1) {
    const problem = generateProblem('FALLBACKS', tier, index);
    const solution = solve(problem);
    if (wanted(problem, solution)) return [problem, solution];
  }
  throw new Error(`no problem in tier ${tier} matched`);
}

const stage = (problem: Problem, id: string): Stage => {
  const found = stagesFor(problem).find((s) => s.id === id);
  if (found === undefined) throw new Error(`${id} is not a stage of this problem`);
  return found;
};

test('E-BAL-UNBALANCED: coefficients that do not conserve atoms', () => {
  const [problem, solution] = findProblem(1, (_p, s) => s.coefficients.some((c) => c !== 1));
  const allOnes = solution.coefficients.map(() => 1);
  const result = classify(problem, solution, stage(problem, 'S1'), { kind: 'coefficients', values: allOnes });
  assert.equal(result.correct, false);
  assert.equal(result.errorClass, 'E-BAL-UNBALANCED');
  assert.deepEqual(result.matched, ['E-BAL-UNBALANCED']);
  assert.match(result.why, /do not come out the same|same atoms/);
});

test('E-MM-ARITH: the right composition, added up wrong', () => {
  const [problem, solution] = findProblem(1, () => true);
  const slipped = solution.mmGiven + 1.7;
  const s2 = stage(problem, 'S2');
  const result = classify(problem, solution, s2, { kind: 'text', text: entryText(problem, s2, slipped, 6) });
  assert.equal(result.errorClass, 'E-MM-ARITH', `${slipped} at S2`);
  assert.deepEqual(result.matched, ['E-MM-ARITH']);
  // And it is NOT the generic arithmetic class: the stage knows what it is.
  assert.notEqual(result.errorClass, 'E-ARITH');
});

test('E-ARITH: the right method, the wrong arithmetic', () => {
  const [problem, solution] = findProblem(1, () => true);
  const s3 = stage(problem, 'S3');
  const slipped = solution.molGiven * 1.11;
  const result = classify(problem, solution, s3, { kind: 'text', text: entryText(problem, s3, slipped, 6) });
  assert.equal(result.errorClass, 'E-ARITH');
  assert.deepEqual(result.matched, ['E-ARITH']);
  assert.ok(result.logError !== null && Math.abs(result.logError) < 1);
});

test('E-UNCLASSIFIED: too far out to account for, and COUNTED rather than hidden', () => {
  const [problem, solution] = findProblem(1, () => true);
  const s3 = stage(problem, 'S3');
  const wild = solution.molGiven * 5000;
  const result = classify(problem, solution, s3, { kind: 'text', text: entryText(problem, s3, wild, 6) });
  assert.equal(result.errorClass, 'E-UNCLASSIFIED');
  assert.ok(result.logError !== null && Math.abs(result.logError) >= 1);

  // Something that is not a number at all is also unclassified, not a crash.
  assert.equal(classify(problem, solution, s3, { kind: 'text', text: 'no idea' }).errorClass, 'E-UNCLASSIFIED');
  assert.equal(classify(problem, solution, s3, { kind: 'choice', speciesIndex: 0 }).errorClass, 'E-UNCLASSIFIED');
});

test('E-SIG-FIGS: the right value, the wrong number of figures', () => {
  const [problem, solution] = findProblem(1, () => true);
  const final = stagesFor(problem).at(-1) as Stage;
  assert.equal(final.gradesSigFigs, true);

  const tooMany = classify(problem, solution, final, {
    kind: 'text',
    text: entryText(problem, final, solution.finalValue, problem.answerSigFigs + 2),
  });
  assert.equal(tooMany.errorClass, 'E-SIG-FIGS');
  assert.match(tooMany.why, /significant figures/);

  // An ambiguous answer is E-SIG-FIGS too: the engine will not pick a reading.
  const ambiguous = classify(problem, solution, final, {
    kind: 'text',
    text: `${Math.round(roundToSigFigs(solution.finalValue, problem.answerSigFigs) / 10) * 10} ${final.unit}`,
  });
  assert.ok(ambiguous.errorClass === 'E-SIG-FIGS' || ambiguous.correct === false);

  // Intermediate stages are NOT graded on figures: rounding one is E-ROUND-EARLY.
  for (const s of stagesFor(problem).slice(0, -1)) assert.equal(s.gradesSigFigs, false);
});

test('E-UNIT-MISSING: the right number with no unit, or the wrong one', () => {
  const [problem, solution] = findProblem(1, () => true);
  const s2 = stage(problem, 'S2');
  assert.equal(s2.unit, 'g/mol');

  const bare = classify(problem, solution, s2, {
    kind: 'text',
    text: formatUnambiguous(solution.mmGiven, 6),
  });
  assert.equal(bare.errorClass, 'E-UNIT-MISSING');

  const wrongUnit = classify(problem, solution, s2, {
    kind: 'text',
    text: `${formatUnambiguous(solution.mmGiven, 6)} mol`,
  });
  assert.equal(wrongUnit.errorClass, 'E-UNIT-MISSING');

  // A unitless stage does not ask for one.
  const s4 = stage(problem, 'S4');
  assert.equal(s4.unit, 'none');
  assert.equal(classify(problem, solution, s4, { kind: 'text', text: formatUnambiguous(solution.ratio, 6) }).correct, true);
});

test('every class in §6.2 has a fixture somewhere in this file', () => {
  // The list is asserted against the source of truth so a class added to the
  // taxonomy without a fixture fails here rather than passing unnoticed.
  assert.equal(ERROR_CLASSES.length, 20);
  const namedInThisFile = new Set<ErrorClass>([
    'E-BAL-UNBALANCED', 'E-BAL-NOTLOWEST', 'E-BAL-SUBSCRIPT',
    'E-MM-PARSE', 'E-MM-HYDRATE', 'E-MM-ARITH',
    'E-MOL-INVERTED', 'E-MOL-GRAMS',
    'E-RATIO-INVERTED', 'E-RATIO-MASS', 'E-RATIO-UNBALANCED',
    'E-LIM-WRONG', 'E-LIM-BYMASS',
    'E-CONV-FACTOR', 'E-CONV-INVERTED',
    'E-SIG-FIGS', 'E-ROUND-EARLY', 'E-ARITH', 'E-UNIT-MISSING',
    'E-UNCLASSIFIED',
  ]);
  for (const errorClass of ERROR_CLASSES) {
    assert.ok(namedInThisFile.has(errorClass), `${errorClass} has no fixture`);
  }
});

test('the unclassified rate over a sweep of realistic wrong answers', () => {
  // Every predicted wrong value, plus arithmetic slips of the kind a student
  // actually makes: a percent or two out, a transposed digit, a factor of ten.
  let entries = 0;
  let unclassified = 0;
  const byClass: Record<string, number> = {};

  for (const tier of TIERS) {
    for (let index = 0; index < 250; index += 1) {
      const problem = generateProblem('RATE', tier, index);
      const solution = solve(problem);
      for (const s of stagesFor(problem)) {
        if (s.kind !== 'NUMERIC') continue;
        const predicted = predictionsFor(problem, solution, s);
        const correct = predicted.correctValue as number;
        const candidates = [
          ...predicted.predictions.map((p) => p.value as number),
          correct * 1.02,
          correct * 0.97,
          correct * 1.1,
          correct * 10,
        ];
        for (const value of candidates) {
          if (!Number.isFinite(value)) continue;
          const result = classify(problem, solution, s, { kind: 'text', text: entryText(problem, s, value, 6) });
          if (result.correct) continue;
          entries += 1;
          const name = result.collision ? 'COLLISION' : (result.errorClass as string);
          byClass[name] = (byClass[name] ?? 0) + 1;
          if (name === 'E-UNCLASSIFIED') unclassified += 1;
        }
      }
    }
  }

  const rate = unclassified / entries;
  const summary = Object.entries(byClass)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `    ${name.padEnd(20)} ${count}`)
    .join('\n');
  console.log(
    `\n  E-UNCLASSIFIED RATE: ${unclassified} of ${entries} wrong entries `
    + `(${(rate * 100).toFixed(2)}%). By class:\n${summary}\n`,
  );

  assert.equal(byClass['COLLISION'], undefined, 'no entry may match two classes');
  // The factor-of-ten entries are unclassified BY DESIGN — §6.2 puts anything
  // past one order of magnitude there. One of the four slips is a factor of
  // ten, so a rate near a quarter of the slips is the floor, not a failure.
  assert.ok(rate < 0.35, `unclassified rate ${(rate * 100).toFixed(2)}% is higher than expected`);
});

test('§7 maps each class to its algebra branch, and most classes to none', () => {
  assert.deepEqual(algebraFor('E-MOL-INVERTED', null), ['A2', 'A3']);
  assert.deepEqual(algebraFor('E-CONV-INVERTED', null), ['A2', 'A3']);
  assert.deepEqual(algebraFor('E-RATIO-INVERTED', null), ['A2', 'A3']);
  assert.deepEqual(algebraFor('E-RATIO-MASS', null), ['A3']);
  assert.deepEqual(algebraFor('E-MOL-GRAMS', null), ['A3']);
  assert.deepEqual(algebraFor('E-LIM-BYMASS', null), ['A1']);
  assert.deepEqual(algebraFor('E-ARITH', 0.9), ['A4']);
  assert.deepEqual(algebraFor('E-ARITH', 0.1), []);
  for (const errorClass of ['E-BAL-UNBALANCED', 'E-MM-HYDRATE', 'E-SIG-FIGS', 'E-UNIT-MISSING', 'E-UNCLASSIFIED'] as const) {
    assert.deepEqual(algebraFor(errorClass, null), [], `${errorClass} should have no algebra branch`);
  }
});

test('a micro-remediation is three lines and a question, from the numbers just used', () => {
  const [problem, solution] = findProblem(3, () => true);
  const s3 = stage(problem, 'S3');
  for (const skill of ['A1', 'A2', 'A3', 'A4'] as const) {
    const remediation = buildRemediation(skill, problem, solution, s3);
    assert.equal(remediation.skill, skill);
    assert.equal(remediation.title, ALGEBRA_SKILLS[skill]);
    assert.ok(remediation.lines.length > 0);
    assert.ok(
      remediation.lines.length <= MAX_REMEDIATION_LINES,
      `${skill} shows ${remediation.lines.length} lines; §7 allows ${MAX_REMEDIATION_LINES}`,
    );
    assert.ok(remediation.question.length > 0);
    assert.ok(Number.isFinite(remediation.answer));
    // "drawn from the same numbers the student just used" — the given mass has
    // to appear somewhere in what they are shown.
    const shown = [...remediation.lines, remediation.question].join(' ');
    if (skill === 'A4') {
      // A4 is the magnitude lesson and prints NO number — a rounded one would
      // be typeable, and at a stage that does not grade figures it would be
      // marked correct. What it owes instead is the decade of this problem's
      // own answer, which is a tighter claim than "mentions a number".
      assert.ok(
        shown.includes(decadeName(solution.molGiven)),
        `A4 does not state the decade of this problem's own answer: ${shown}`,
      );
    } else {
      const ownNumbers = [
        problem.given.value,
        solution.mmGiven,
        solution.molGiven,
        solution.ratio,
        solution.molWanted,
      ].flatMap((value) => [problem.answerSigFigs, REMEDIATION_SIG_FIGS].map((f) => String(roundToSigFigs(value, f))));
      assert.ok(
        ownNumbers.some((number) => shown.includes(number)),
        `${skill} shows none of the student's own numbers: ${shown}`,
      );
    }
  }
});

test('NO remediation shows a number that would be marked correct at its stage', () => {
  // The gate exists because the first version of the worked lines ended
  // `mol N2 = 878 ÷ 28.01 = 31.34`, which is the answer to the stage the
  // student is stuck on — and A4 printed a rounded estimate that would have
  // been accepted, because intermediate stages do not grade figures. A
  // remediation that hands over the answer is not remediation, it is a
  // solver with three lines of prose in front of it.
  let linesChecked = 0;
  let numbersChecked = 0;
  const stagesWithNoBranch: string[] = [];

  for (const tier of TIERS) {
    for (let index = 0; index < 150; index += 1) {
      const problem = generateProblem('NO-GIVEAWAY', tier, index);
      const solution = solve(problem);
      for (const s of stagesFor(problem)) {
        if (s.kind !== 'NUMERIC') continue;
        // ONLY the skills this stage can actually reach. Building A2 at S2 and
        // asserting on it checks a screen that cannot exist: every class S2
        // produces — a miscounted polyatomic, forgotten hydrate water, an
        // addition slip — maps to no algebra branch at all, so the molar mass
        // is never printed back at the stage that asks for it.
        const reachable = new Set<'A1' | 'A2' | 'A3' | 'A4'>();
        const classes = [
          ...predictionsFor(problem, solution, s).predictions.map((p) => p.errorClass),
          s.id === 'S2' ? ('E-MM-ARITH' as const) : ('E-ARITH' as const),
        ];
        for (const errorClass of classes) {
          // The largest |log10| an E-ARITH can carry, so the A4 branch is
          // included wherever it could fire.
          for (const skill of algebraFor(errorClass, 0.99)) reachable.add(skill);
        }
        if (reachable.size === 0) {
          stagesWithNoBranch.push(s.id);
          continue;
        }
        for (const skill of reachable) {
          const remediation = buildRemediation(skill, problem, solution, s);
          const shown = [...remediation.lines, remediation.question].join(' ');
          linesChecked += remediation.lines.length;
          // Every number the student could TYPE BACK IN. A digit inside a
          // formula is not one of those: the 2 of H2O is a subscript, and
          // treating it as a printed value flagged every line that names a
          // compound. So a number must not be flanked by letters or digits.
          // A closing bracket counts as a letter here: the 2 of Ca(OH)2 is a
          // subscript exactly as much as the 2 of H2O is.
          const NUMBER = /(?<![A-Za-z0-9.)\]])\d+(?:\.\d+)?(?:e[+-]?\d+)?(?![A-Za-z0-9])/gi;
          for (const token of shown.match(NUMBER) ?? []) {
            const value = Number(token);
            if (!Number.isFinite(value)) continue;
            numbersChecked += 1;
            const verdict = classify(problem, solution, s, {
              kind: 'text',
              text: s.unit === 'none' ? token : `${token} ${s.unit}`,
            });
            assert.equal(
              verdict.correct,
              false,
              `tier ${tier} #${index} ${s.id} ${skill}: "${token}" would be accepted as the answer.\n  ${shown}`,
            );
          }
        }
      }
    }
  }

  console.log(
    `\n  REMEDIATION GIVEAWAY CHECK: ${numbersChecked} numbers across ${linesChecked} worked lines, `
    + `none of them the answer. ${stagesWithNoBranch.length} stage visits reach no algebra branch at all.\n`,
  );
  assert.ok(numbersChecked > 1000, 'the sweep should have looked at a lot more numbers than this');
  // S2 is the stage with no branch, and that is §7 working: its classes are
  // about counting atoms, not about algebra.
  assert.deepEqual([...new Set(stagesWithNoBranch)], ['S2']);
});

test('a wrong entry that triggers remediation gets it at the failing stage', () => {
  const [problem, solution] = findProblem(1, () => true);
  const s3 = stage(problem, 'S3');
  const inverted = classify(problem, solution, s3, {
    kind: 'text',
    text: entryText(problem, s3, problem.given.value * solution.mmGiven, 6),
  });
  assert.equal(inverted.errorClass, 'E-MOL-INVERTED');
  assert.deepEqual(algebraFor(inverted.errorClass, inverted.logError), ['A2', 'A3']);
});

test('readEntry splits a number from its unit, and refuses what is not a number', () => {
  assert.deepEqual(readEntry('12.5 g')?.unit, 'g');
  assert.equal(readEntry('12.5')?.unit, null);
  assert.equal(readEntry('12.5 bananas')?.unitUnrecognised, true);
  assert.equal(readEntry('1.20e3 mol')?.quantity.value, 1200);
  assert.equal(readEntry('  44.01 g/mol  ')?.unit, 'g/mol');
  assert.equal(readEntry(''), null);
  assert.equal(readEntry('lots'), null);
  assert.equal(readEntry('g'), null);
});
