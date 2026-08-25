/**
 * balance.test.ts — forty-four reactions, checked two ways.
 *
 * The coefficient sets below are asserted literally, and they are also checked
 * INDEPENDENTLY of the solver: every element is counted on both sides by this
 * file's own arithmetic, and the set is checked for a common factor. That
 * second check does not know how the answer was found, so a solver that
 * returned a plausible-looking wrong set would still fail it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  balanceEquation,
  checkBalance,
  parseEquation,
  solveBalance,
  EquationError,
} from '../src/chem/balance.ts';

/** equation, the lowest whole-number coefficient set. */
const REACTIONS: ReadonlyArray<readonly [string, readonly number[]]> = [
  ['H2 + O2 -> H2O', [2, 1, 2]],
  ['CH4 + O2 -> CO2 + H2O', [1, 2, 1, 2]],
  ['C2H6 + O2 -> CO2 + H2O', [2, 7, 4, 6]],
  ['C3H8 + O2 -> CO2 + H2O', [1, 5, 3, 4]],
  ['C4H10 + O2 -> CO2 + H2O', [2, 13, 8, 10]],
  ['C8H18 + O2 -> CO2 + H2O', [2, 25, 16, 18]],
  ['C2H5OH + O2 -> CO2 + H2O', [1, 3, 2, 3]],
  ['C6H12O6 + O2 -> CO2 + H2O', [1, 6, 6, 6]],
  ['CH3COOH + O2 -> CO2 + H2O', [1, 2, 2, 2]],
  ['N2 + H2 -> NH3', [1, 3, 2]],
  ['Fe + O2 -> Fe2O3', [4, 3, 2]],
  ['Al + O2 -> Al2O3', [4, 3, 2]],
  ['Mg + O2 -> MgO', [2, 1, 2]],
  ['Na + Cl2 -> NaCl', [2, 1, 2]],
  ['KClO3 -> KCl + O2', [2, 2, 3]],
  ['CaCO3 -> CaO + CO2', [1, 1, 1]],
  ['NaHCO3 -> Na2CO3 + H2O + CO2', [2, 1, 1, 1]],
  ['Zn + HCl -> ZnCl2 + H2', [1, 2, 1, 1]],
  ['Al + HCl -> AlCl3 + H2', [2, 6, 2, 3]],
  ['Mg + HCl -> MgCl2 + H2', [1, 2, 1, 1]],
  ['AgNO3 + NaCl -> AgCl + NaNO3', [1, 1, 1, 1]],
  ['Pb(NO3)2 + KI -> PbI2 + KNO3', [1, 2, 1, 2]],
  ['H2SO4 + NaOH -> Na2SO4 + H2O', [1, 2, 1, 2]],
  ['HCl + Ca(OH)2 -> CaCl2 + H2O', [2, 1, 1, 2]],
  ['H3PO4 + Ca(OH)2 -> Ca3(PO4)2 + H2O', [2, 3, 1, 6]],
  ['Fe2O3 + CO -> Fe + CO2', [1, 3, 2, 3]],
  ['NH3 + O2 -> NO + H2O', [4, 5, 4, 6]],
  ['Cu + AgNO3 -> Cu(NO3)2 + Ag', [1, 2, 1, 2]],
  ['Al + CuCl2 -> AlCl3 + Cu', [2, 3, 2, 3]],
  ['Na2CO3 + HCl -> NaCl + H2O + CO2', [1, 2, 2, 1, 1]],
  ['Al + Fe2O3 -> Al2O3 + Fe', [2, 1, 1, 2]],
  ['CuSO4·5H2O -> CuSO4 + H2O', [1, 1, 5]],
  ['MgSO4·7H2O -> MgSO4 + H2O', [1, 1, 7]],
  ['Na2CO3·10H2O -> Na2CO3 + H2O', [1, 1, 10]],
  ['CaCl2·2H2O -> CaCl2 + H2O', [1, 1, 2]],
  ['P4 + O2 -> P4O10', [1, 5, 1]],
  ['C2H2 + O2 -> CO2 + H2O', [2, 5, 4, 2]],
  ['NH4NO3 -> N2 + O2 + H2O', [2, 2, 1, 4]],
  // Coefficients above ten, which is what the specification asks for.
  ['KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2', [2, 16, 2, 2, 8, 5]],
  ['Cu + HNO3 -> Cu(NO3)2 + NO + H2O', [3, 8, 3, 2, 4]],
  ['FeS2 + O2 -> Fe2O3 + SO2', [4, 11, 2, 8]],
  ['Cr2O7^2- + Fe^2+ + H^+ -> Cr^3+ + Fe^3+ + H2O', [1, 6, 14, 2, 6, 7]],
  ['MnO4^- + Fe^2+ + H^+ -> Mn^2+ + Fe^3+ + H2O', [1, 5, 8, 1, 5, 4]],
  // The one every textbook uses to show a balancer earning its keep.
  [
    'K4Fe(CN)6 + KMnO4 + H2SO4 -> KHSO4 + Fe2(SO4)3 + MnSO4 + HNO3 + CO2 + H2O',
    [10, 122, 299, 162, 5, 122, 60, 60, 188],
  ],
];

const greatestCommonDivisor = (a: number, b: number): number => (b === 0 ? a : greatestCommonDivisor(b, a % b));

test('forty-plus reactions balance to the set given', () => {
  assert.ok(REACTIONS.length >= 40, 'the specification asks for at least forty');
  for (const [equation, expected] of REACTIONS) {
    const result = balanceEquation(equation);
    assert.equal(result.ok, true, `${equation} did not balance`);
    if (!result.ok) continue;
    assert.deepEqual(result.coefficients, expected, equation);
  }
});

test('every balance conserves every atom, counted independently of the solver', () => {
  for (const [equation, expected] of REACTIONS) {
    const parsed = parseEquation(equation);
    const symbols = new Set<string>();
    for (const species of parsed.species) for (const s of species.counts.keys()) symbols.add(s);

    for (const symbol of symbols) {
      let left = 0;
      let right = 0;
      parsed.species.forEach((species, index) => {
        const atoms = (species.counts.get(symbol) ?? 0) * (expected[index] as number);
        if (index < parsed.firstProduct) left += atoms;
        else right += atoms;
      });
      assert.equal(left, right, `${symbol} does not balance in ${equation}: ${left} against ${right}`);
    }

    let leftCharge = 0;
    let rightCharge = 0;
    parsed.species.forEach((species, index) => {
      const charge = species.charge * (expected[index] as number);
      if (index < parsed.firstProduct) leftCharge += charge;
      else rightCharge += charge;
    });
    assert.equal(leftCharge, rightCharge, `charge does not balance in ${equation}`);
  }
});

test('every set is the LOWEST whole-number set', () => {
  for (const [equation, expected] of REACTIONS) {
    let common = 0;
    for (const c of expected) {
      assert.ok(Number.isInteger(c) && c > 0, `${equation} has a coefficient of ${c}`);
      common = greatestCommonDivisor(common, c);
    }
    assert.equal(common, 1, `${equation} could be divided through by ${common}`);
  }
});

test('a combustion of a carbon-hydrogen-oxygen compound is in the set', () => {
  const ethanol = REACTIONS.find(([e]) => e.startsWith('C2H5OH'));
  assert.notEqual(ethanol, undefined);
  const glucose = balanceEquation('C6H12O6 + O2 -> CO2 + H2O');
  assert.equal(glucose.ok && glucose.coefficients.join(','), '1,6,6,6');
});

test('a coefficient above ten is handled exactly', () => {
  const big = REACTIONS.filter(([, c]) => c.some((n) => n > 10));
  assert.ok(big.length >= 4, 'at least a few need coefficients past ten');
  const hardest = balanceEquation(
    'K4Fe(CN)6 + KMnO4 + H2SO4 -> KHSO4 + Fe2(SO4)3 + MnSO4 + HNO3 + CO2 + H2O',
  );
  assert.equal(hardest.ok, true);
  assert.equal(hardest.ok && Math.max(...hardest.coefficients), 299);
});

test('an unbalanceable reaction is refused, and says why', () => {
  const impossible = balanceEquation('NaCl -> NaBr');
  assert.equal(impossible.ok, false);
  assert.equal(impossible.ok === false && impossible.code, 'NO_SOLUTION');
  assert.equal(impossible.ok === false && impossible.nullity, 0);

  const alsoImpossible = balanceEquation('H2O -> H2 + O2 + N2');
  assert.equal(alsoImpossible.ok, false);
});

test('an underdetermined system is refused with a DIFFERENT code', () => {
  const twoWays = balanceEquation('H2 + O2 -> H2O2 + H2O');
  assert.equal(twoWays.ok, false);
  assert.equal(twoWays.ok === false && twoWays.code, 'UNDERDETERMINED');
  assert.equal(twoWays.ok === false && twoWays.nullity, 2);
  // The two codes must not be the same code wearing two labels.
  const impossible = balanceEquation('NaCl -> NaBr');
  assert.notEqual(
    twoWays.ok === false && twoWays.code,
    impossible.ok === false && impossible.code,
  );
});

test('checkBalance grades a student set without being able to produce one', () => {
  const equation = parseEquation('CH4 + O2 -> CO2 + H2O');
  const right = checkBalance(equation, [1, 2, 1, 2]);
  assert.equal(right.conserves, true);
  assert.equal(right.isLowest, true);

  const doubled = checkBalance(equation, [2, 4, 2, 4]);
  assert.equal(doubled.conserves, true);
  assert.equal(doubled.isLowest, false);
  assert.equal(doubled.commonFactor, 2);

  const wrong = checkBalance(equation, [1, 1, 1, 1]);
  assert.equal(wrong.conserves, false);
  assert.deepEqual([...wrong.unbalancedElements].sort(), ['H', 'O']);

  // A zero or a negative is a student typing, not an exception.
  assert.equal(checkBalance(equation, [0, 2, 1, 2]).conserves, false);
  assert.equal(checkBalance(equation, [-1, -2, -1, -2]).conserves, false);
});

test('charge is conserved as well as atoms', () => {
  const redox = parseEquation('MnO4^- + Fe^2+ + H^+ -> Mn^2+ + Fe^3+ + H2O');
  assert.equal(checkBalance(redox, [1, 5, 8, 1, 5, 4]).conserves, true);
  // Atoms balance here and charge does not; the check must see it.
  const halfRight = checkBalance(parseEquation('Fe^2+ -> Fe^3+'), [1, 1]);
  assert.equal(halfRight.chargeUnbalanced, true);
  assert.equal(halfRight.conserves, false);
});

test('a malformed equation is refused with an offset into the whole equation', () => {
  assert.throws(() => parseEquation('H2 + O2'), EquationError);
  assert.throws(() => parseEquation('-> H2O'), EquationError);
  assert.throws(() => parseEquation('H2 + -> H2O'), EquationError);
  try {
    parseEquation('CH4 + Xx2 -> CO2 + H2O');
    assert.fail('an unknown element should be refused');
  } catch (error) {
    assert.ok(error instanceof EquationError);
    assert.equal(error.code, 'BAD_FORMULA');
    // The offset points at the `Xx`, not at the start of the equation.
    assert.equal('CH4 + Xx2 -> CO2 + H2O'.slice(error.offset, error.offset + 2), 'Xx');
    assert.equal(error.cause?.code, 'UNKNOWN_ELEMENT');
  }
});

test('several arrow spellings all read the same', () => {
  for (const arrow of ['->', '-->', '=', '→', '=>']) {
    const result = balanceEquation(`CH4 + O2 ${arrow} CO2 + H2O`);
    assert.equal(result.ok, true, arrow);
    assert.deepEqual(result.ok && result.coefficients, [1, 2, 1, 2]);
  }
});

test('a coefficient already written in the equation is ignored by the solver', () => {
  const written = solveBalance(parseEquation('5CH4 + 9O2 -> 3CO2 + 7H2O'));
  assert.equal(written.ok, true);
  assert.deepEqual(written.ok && written.coefficients, [1, 2, 1, 2]);
});
