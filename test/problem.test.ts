/**
 * problem.test.ts — determinism, and the §6.3 guarantees.
 *
 * DETERMINISM IS THE FEATURE, not an implementation detail. A teacher puts one
 * key in Canvas and thirty Chromebooks have to produce the same thirty
 * problems, with no server and nothing stored. If that ever drifts, two
 * students comparing answers find they were not working the same problem, and
 * nothing in the product would say so.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REACTIONS,
  TIERS,
  checkGuarantees,
  generateProblem,
  generateSet,
  parseUnit,
  solve,
  type Guarantee,
} from '../src/engine/problem.ts';
import { parseEquation, solveBalance } from '../src/chem/balance.ts';
import { parseQuantity, reportableSigFigs } from '../src/chem/sigfig.ts';
import { hashString, makeRng, nextInt, pick } from '../src/engine/rng.ts';
import { MAX_ANSWER_SIG_FIGS, MIN_ANSWER_SIG_FIGS } from '../src/engine/tolerance.ts';

test('the seeded generator is a pure function of its seed', () => {
  const first = Array.from({ length: 12 }, makeRng('CHEM-A|1|0'));
  const again = Array.from({ length: 12 }, makeRng('CHEM-A|1|0'));
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, Array.from({ length: 12 }, makeRng('CHEM-A|1|1')));

  // Every draw is a uint32; a leak into floats or negatives would make the
  // stream platform-dependent, which is the whole thing being guarded against.
  for (const value of first) {
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffffff);
  }
  assert.equal(hashString(''), hashString(''));
  assert.notEqual(hashString('a'), hashString('b'));
});

test('nextInt is uniform enough not to bias which reactions a class sees', () => {
  const draws = 200_000;
  const counts = new Array<number>(10).fill(0);
  const rng = makeRng('uniformity');
  for (let i = 0; i < draws; i += 1) {
    const value = nextInt(rng, 0, 9);
    counts[value] = (counts[value] as number) + 1;
  }
  for (const count of counts) {
    assert.ok(Math.abs(count - draws / 10) < draws / 10 * 0.05, `bucket off by more than 5%: ${count}`);
  }
  assert.throws(() => nextInt(rng, 5, 4), RangeError);
  assert.throws(() => pick(rng, []), RangeError);
});

test('the same key, tier and index give a byte-identical problem across a thousand runs', () => {
  for (const [key, tier, index] of [['CHEM-A', 1, 0], ['CHEM-A', 3, 7], ['P4-2026', 4, 19]] as const) {
    const reference = JSON.stringify(generateProblem(key, tier, index));
    for (let run = 0; run < 1000; run += 1) {
      assert.equal(JSON.stringify(generateProblem(key, tier, index)), reference, `run ${run} differed`);
    }
  }
});

test('different keys, tiers and indices give different problems', () => {
  const one = JSON.stringify(generateProblem('CHEM-A', 1, 0));
  assert.notEqual(one, JSON.stringify(generateProblem('CHEM-B', 1, 0)));
  assert.notEqual(one, JSON.stringify(generateProblem('CHEM-A', 2, 0)));
  assert.notEqual(one, JSON.stringify(generateProblem('CHEM-A', 1, 1)));
});

test('extending a set does not move the problems already in it', () => {
  const five = generateSet('CHEM-A', 2, 5);
  const ten = generateSet('CHEM-A', 2, 10);
  assert.deepEqual(five, ten.slice(0, 5));
});

test('every reaction in the pool has one nonzero balance, and only one', () => {
  const ids = new Set<string>();
  for (const reaction of REACTIONS) {
    assert.equal(ids.has(reaction.id), false, `${reaction.id} is in the pool twice`);
    ids.add(reaction.id);
    const result = solveBalance(parseEquation(reaction.equation));
    assert.equal(result.ok, true, `${reaction.equation} does not balance uniquely`);
    if (!result.ok) continue;
    assert.ok(result.coefficients.every((c) => Number.isInteger(c) && c >= 1), reaction.equation);
  }
});

test('ten thousand generated problems break no §6.3 guarantee', () => {
  const perTier = 2500;
  const seen: Record<string, number> = {};
  const failures: Array<{ tier: number; index: number; broke: Guarantee[] }> = [];

  for (const tier of TIERS) {
    for (let index = 0; index < perTier; index += 1) {
      const problem = generateProblem('GUARANTEES', tier, index);
      seen[problem.kind] = (seen[problem.kind] ?? 0) + 1;
      const broke = checkGuarantees(problem);
      if (broke.length > 0) failures.push({ tier, index, broke });

      // The guarantees that matter most, re-asserted here directly rather than
      // trusting the function under test to be checking what it says it does.
      const solution = solve(problem);
      assert.notEqual(solution.ratio, 1, `tier ${tier} #${index}: a 1:1 ratio hides E-RATIO-INVERTED`);
      assert.ok(solution.mmGiven > 0 && solution.mmWanted > 0);
      assert.ok(solution.convertFactor > 0, 'a zero conversion factor is a division by zero waiting');
      const stated = parseQuantity(problem.given.text);
      assert.equal(stated.kind, 'measured', `tier ${tier} #${index}: "${problem.given.text}" is ambiguous`);
      assert.equal(reportableSigFigs(solution.finalQuantity), problem.answerSigFigs);
      assert.ok(problem.answerSigFigs >= MIN_ANSWER_SIG_FIGS);
      assert.ok(problem.answerSigFigs <= MAX_ANSWER_SIG_FIGS);
      assert.ok(problem.givenIndex !== problem.wantedIndex);
      assert.ok(Number.isFinite(solution.finalValue) && solution.finalValue > 0);
    }
  }

  assert.deepEqual(failures, [], `guarantees broken: ${JSON.stringify(failures.slice(0, 5))}`);
  // Every problem kind must actually appear: a kind that quietly stops being
  // generated leaves a tier looking healthy while covering less than it claims.
  for (const kind of ['MASS_TO_MASS', 'MASS_TO_PARTICLES', 'MASS_TO_VOLUME', 'LIMITING_REAGENT', 'PERCENT_YIELD']) {
    assert.ok((seen[kind] ?? 0) > 0, `no ${kind} problem was generated in ten thousand draws`);
  }
});

test('a limiting-reagent problem can never be got right by comparing masses', () => {
  for (let index = 0; index < 300; index += 1) {
    const problem = generateProblem('LIMITING', 3, index);
    const solution = solve(problem);
    const firstMass = problem.given.value;
    const secondMass = problem.secondGiven?.value as number;
    const lighter = firstMass <= secondMass ? problem.givenIndex : (problem.secondGivenIndex as number);
    assert.notEqual(
      lighter,
      solution.limitingIndex,
      `#${index}: the lighter reactant is also the limiting one, so E-LIM-BYMASS predicts the right answer`,
    );
  }
});

test('a percent-yield problem recovers less than it theoretically could', () => {
  for (let index = 0; index < 300; index += 1) {
    const problem = generateProblem('YIELD', 4, index);
    const solution = solve(problem);
    const actual = problem.actualYield?.value as number;
    assert.ok(actual > 0);
    assert.ok(actual < (solution.theoretical as number), `#${index}: more was recovered than could exist`);
    assert.ok((solution.percentYield as number) < 100);
  }
});

test('tier one keeps the molar mass whole-number friendly', () => {
  for (let index = 0; index < 200; index += 1) {
    const solution = solve(generateProblem('TIER1', 1, index));
    assert.ok(
      Math.abs(solution.mmGiven - Math.round(solution.mmGiven)) <= 0.2,
      `tier 1 #${index}: molar mass ${solution.mmGiven}`,
    );
  }
});

test('a broken problem is reported rather than posed', () => {
  const problem = generateProblem('CHEM-A', 1, 0);
  const sameSpecies = { ...problem, wantedIndex: problem.givenIndex };
  assert.ok(checkGuarantees(sameSpecies).includes('DISTINCT_SPECIES'));

  const impossible = { ...problem, equation: 'NaCl -> NaBr', species: ['NaCl', 'NaBr'], reactantCount: 1, givenIndex: 0, wantedIndex: 1 };
  assert.deepEqual(checkGuarantees(impossible), ['UNIQUE_BALANCE']);
  assert.throws(() => solve(impossible), /unique balance/);
});

test('units are read the way a student writes them', () => {
  assert.equal(parseUnit('g'), 'g');
  assert.equal(parseUnit('GRAMS'), 'g');
  assert.equal(parseUnit(' moles '), 'mol');
  assert.equal(parseUnit('g/mol'), 'g/mol');
  assert.equal(parseUnit('grams per mole'), 'g/mol');
  assert.equal(parseUnit('L'), 'L');
  assert.equal(parseUnit('litres'), 'L');
  assert.equal(parseUnit('molecules'), 'particles');
  assert.equal(parseUnit('%'), '%');
  assert.equal(parseUnit('bananas'), null);
  assert.equal(parseUnit(''), null);
});
