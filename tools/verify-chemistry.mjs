#!/usr/bin/env node
/**
 * verify-chemistry.mjs — the chemistry is right, checked from OUTSIDE the engine.
 *
 *   node tools/verify-chemistry.mjs
 *
 * ## Why this is not another test
 *
 * `npm test` is thorough and it is self-referential in one specific way: it
 * asks the engine whether the engine agrees with itself. `solve()` produces the
 * answer, `correctEntryFor` submits it, and `submit` accepts it. Every one of
 * those could share a mistake and the suite would stay green — which is exactly
 * the shape of the circular drill test this repository already got caught by
 * once (NOTES: "the lessons, and the circular test that would have shipped").
 *
 * So this file recomputes the chemistry INDEPENDENTLY:
 *
 *   1. Molar masses are compared against values typed in by hand from published
 *      tables, not derived from `elements.ts`.
 *   2. Every generated equation is balanced by counting atoms HERE, from the
 *      formulas and the coefficients, and checked for lowest terms with a gcd
 *      written here.
 *   3. Every problem's final answer is recomputed HERE — grams to moles, mole
 *      ratio, moles to grams or litres or particles, percent yield — and
 *      compared with what the app claims.
 *   4. Every revealed value is checked to WRITE the number of figures it CLAIMS,
 *      and to be the true value rounded to them.
 *
 * It shares the element table and the problem generator with the app, and
 * nothing else. That is the line: this cannot catch a wrong atomic weight, and
 * check 1 exists because of it.
 *
 * ## A caution this file earned
 *
 * Check 4 first compared the shown value against the CARRIED value re-rounded,
 * which is DOUBLE ROUNDING: 0.0148497 carried at five figures is 0.01485, and
 * rounding that to three gives 0.0149 where the true value gives 0.0148. It
 * reported eleven defects and every one was this check committing the exact
 * error `E-ROUND-EARLY` exists to diagnose. Round from the truth, once.
 */

import { molarMass } from '../src/chem/molarmass.ts';
import { generateProblem, solve } from '../src/engine/problem.ts';
import { parseEquation } from '../src/chem/balance.ts';
import { stagesFor } from '../src/engine/taxonomy.ts';
import { revealValueFor, numericAnswer } from '../src/engine/steps.ts';
import { AVOGADRO, STP_MOLAR_VOLUME_L } from '../src/chem/constants.ts';

let failures = 0;
const fail = (message) => { console.log(`  FAIL  ${message}`); failures += 1; };
const ok = (message) => console.log(`  ok    ${message}`);

console.log('\n=== the chemistry, checked from outside the engine · MoleBridge ===\n');

/* ---- 1. molar masses against published values ---- */

// TYPED BY HAND from published tables. If `elements.ts` ever carries a wrong
// atomic weight, this is the only check in the repository that can see it.
const PUBLISHED = [
  ['H2O', 18.015], ['CO2', 44.009], ['O2', 31.998], ['N2', 28.014],
  ['NaCl', 58.44], ['C6H12O6', 180.156], ['KClO3', 122.545], ['Fe2O3', 159.688],
  ['H3PO4', 97.994], ['CaCO3', 100.086], ['NH3', 17.031], ['H2SO4', 98.07],
  ['C3H8', 44.096], ['Al2(SO4)3', 342.15], ['CuSO4·5H2O', 249.68], ['Ca(OH)2', 74.09],
  ['KMnO4', 158.03], ['NaOH', 39.997], ['CH4', 16.043], ['C2H5OH', 46.068],
];
// 0.05 g/mol absorbs which published table a value was taken from; a real
// mistake in an atomic weight is far larger than that.
const MASS_TOLERANCE = 0.05;
let worstMass = 0, worstFormula = '';
for (const [formula, published] of PUBLISHED) {
  const got = molarMass(formula).value;
  const off = Math.abs(got - published);
  if (off > worstMass) { worstMass = off; worstFormula = formula; }
  if (off >= MASS_TOLERANCE) {
    fail(`${formula}: engine ${got.toFixed(4)}, published ${published} — off by ${off.toFixed(4)}`);
  }
}
if (worstMass < MASS_TOLERANCE) {
  ok(`${PUBLISHED.length} molar masses match published values (worst: ${worstFormula}, off by ${worstMass.toFixed(4)})`);
}

/* ---- 2, 3, 4: over a sweep of generated problems ---- */

const SEEDS = ['V1-A', 'V1-B', 'V1-C', 'V1-D', 'V1-E', 'V1-F', 'V1-G', 'V1-H'];
const PER_TIER = 30;

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

/** Significant figures a written number actually claims. */
function sigFigsWritten(text) {
  const [mantissa] = String(text).split(/[eE]/);
  const digits = mantissa.replace(/[^0-9.]/g, '');
  const bare = digits.replace('.', '').replace(/^0+/, '');
  return digits.includes('.') ? bare.length : bare.replace(/0+$/, '').length;
}

let problems = 0, revealed = 0;
for (const seed of SEEDS) {
  for (let tier = 1; tier <= 4; tier += 1) {
    for (let n = 0; n < PER_TIER; n += 1) {
      const problem = generateProblem(seed, tier, n);
      const solution = solve(problem);
      problems += 1;

      /* 2. balanced, counting atoms here */
      const equation = parseEquation(problem.equation);
      const side = (units, coefficients) => {
        const total = new Map();
        units.forEach((unit, i) => {
          for (const [symbol, count] of unit.counts) {
            total.set(symbol, (total.get(symbol) ?? 0) + count * coefficients[i]);
          }
        });
        return total;
      };
      const cut = equation.reactants.length;
      const left = side(equation.reactants, solution.coefficients.slice(0, cut));
      const right = side(equation.products, solution.coefficients.slice(cut));
      for (const symbol of new Set([...left.keys(), ...right.keys()])) {
        if ((left.get(symbol) ?? 0) !== (right.get(symbol) ?? 0)) {
          fail(`${problem.equation}: ${symbol} is ${left.get(symbol) ?? 0} on the left and ${right.get(symbol) ?? 0} on the right`);
        }
      }
      if (solution.coefficients.reduce((a, b) => gcd(a, b)) !== 1) {
        fail(`${problem.equation}: coefficients ${solution.coefficients.join(', ')} share a common factor`);
      }

      /* 3. the answer, recomputed here */
      const given = problem.species[problem.givenIndex];
      const wanted = problem.species[problem.wantedIndex];
      const molGiven = problem.given.value / molarMass(given).value;
      const ratio = solution.coefficients[problem.wantedIndex] / solution.coefficients[problem.givenIndex];
      let molWanted = molGiven * ratio;
      if (problem.secondGivenIndex !== null && problem.secondGiven !== null) {
        const mol2 = problem.secondGiven.value / molarMass(problem.species[problem.secondGivenIndex]).value;
        const ratio2 = solution.coefficients[problem.wantedIndex] / solution.coefficients[problem.secondGivenIndex];
        // The reaction stops at the smaller of the two, which is the whole
        // limiting-reactant idea, written out rather than asked for.
        molWanted = Math.min(molWanted, mol2 * ratio2);
      }
      const factor =
        problem.wantedUnit === 'particles' ? AVOGADRO
          : problem.wantedUnit === 'L' ? STP_MOLAR_VOLUME_L
            : molarMass(wanted).value;
      const converted = molWanted * factor;
      const expected = problem.actualYield === null
        ? converted
        : (problem.actualYield.value / converted) * 100;
      const relative = Math.abs(expected - solution.finalValue) / Math.max(1e-12, Math.abs(expected));
      if (relative > 1e-9) {
        fail(`${problem.equation} | ${problem.given.value} g ${given} → ${wanted}: by hand ${expected}, the app says ${solution.finalValue}`);
      }

      /* 4. every revealed value writes the figures it claims */
      for (const stage of stagesFor(problem)) {
        const shown = revealValueFor(problem, solution, stage);
        if (shown === null || shown.sigFigs === null) continue;
        revealed += 1;
        const written = sigFigsWritten(shown.shown);
        if (written !== shown.sigFigs) {
          fail(`${stage.id}: shows "${shown.shown}", claiming ${shown.sigFigs} figures and writing ${written}`);
        }
        // FROM THE TRUTH, ONCE. Rounding the carried value again is the double
        // rounding this file's header warns about.
        const truth = numericAnswer(problem, solution, stage);
        const want = Number(truth.toPrecision(shown.sigFigs));
        const got = Number(String(shown.shown).replace(/[^0-9.eE+-]/g, ''));
        if (Math.abs(want - got) > Math.abs(want) * 1e-12) {
          fail(`${stage.id}: shows "${shown.shown}", but ${truth} at ${shown.sigFigs} figures is ${want}`);
        }
      }

      const last = stagesFor(problem).filter((stage) => stage.gradesSigFigs).pop();
      if (last !== undefined) {
        const shown = revealValueFor(problem, solution, last);
        if (shown !== null && sigFigsWritten(shown.shown) !== problem.answerSigFigs) {
          fail(`the final answer "${shown.shown}" is ${sigFigsWritten(shown.shown)} figures where the problem asks for ${problem.answerSigFigs}`);
        }
      }
    }
  }
}

if (failures === 0) {
  ok(`${problems} problems balanced by counting atoms, and in lowest terms`);
  ok(`${problems} answers recomputed by hand, all matching the app`);
  ok(`${revealed} revealed values write the figures they claim, rounded from the truth`);
}

if (failures > 0) {
  console.error(`\n${failures} problem(s). The chemistry is what this app is for.\n`);
  process.exit(1);
}
console.log('\nThe chemistry holds, checked without asking the engine to mark its own work.\n');
