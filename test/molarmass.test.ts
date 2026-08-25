/**
 * molarmass.test.ts — thirty compounds against published values.
 *
 * ON THE TWO REFERENCE VALUES THAT LOOK WRONG. Widely quoted molar masses for
 * aluminium sulfate and a few other sulfates were computed with a sulfur weight
 * of 32.065, which CIAAW superseded; the conventional value is 32.06. The
 * references below are the CURRENT-weight values, and the arithmetic is written
 * out beside them so a reader can check it by hand rather than take this file's
 * word for it. Using the stale figure would fail a correct implementation,
 * which is the worst kind of test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { molarMass, molarMassOfParsed, MolarMassError } from '../src/chem/molarmass.ts';
import { parseFormula } from '../src/chem/formula.ts';

/** The tolerance §10 asks for. */
const TOLERANCE_G_PER_MOL = 0.01;

/** formula, published molar mass in g/mol. */
const KNOWN: ReadonlyArray<readonly [string, number]> = [
  ['H2O', 18.015],
  ['CO2', 44.009],
  ['NaCl', 58.44],
  ['C6H12O6', 180.156],
  ['H2SO4', 98.072],
  ['NH3', 17.031],
  ['CH4', 16.043],
  ['O2', 31.998],
  ['CaCO3', 100.086],
  ['NaOH', 39.997],
  ['KOH', 56.105],
  ['HCl', 36.458],
  ['HNO3', 63.012],
  ['H3PO4', 97.994],
  ['Fe2O3', 159.687],
  // 2(26.9815384) + 3(15.999) = 53.963 + 47.997
  ['Al2O3', 101.96],
  ['MgO', 40.304],
  ['KMnO4', 158.032],
  ['K2Cr2O7', 294.182],
  ['NaHCO3', 84.006],
  ['Na2CO3', 105.988],
  // polyatomic ions, four of them and then some
  ['Ca(OH)2', 74.092],
  ['Ca(NO3)2', 164.086],
  ['(NH4)3PO4', 149.087],
  // 2(26.9815384) + 3(32.06) + 12(15.999) = 53.963 + 96.18 + 191.988.
  // Quoted elsewhere as 342.15, which used the superseded sulfur weight.
  ['Al2(SO4)3', 342.131],
  ['Mg(OH)2', 58.319],
  ['Pb(NO3)2', 331.208],
  ['C12H22O11', 342.297],
  ['C2H5OH', 46.069],
  ['CH3COOH', 60.052],
  // hydrates, four of them
  ['CuSO4*5H2O', 249.677],
  ['MgSO4*7H2O', 246.466],
  ['Na2CO3*10H2O', 286.138],
  ['CaCl2*2H2O', 147.008],
  ['FeSO4*7H2O', 278.006],
  ['AgNO3', 169.872],
  ['ZnCl2', 136.28],
  ['K3PO4', 212.265],
  ['NH4NO3', 80.043],
  ['Ba(OH)2', 171.341],
];

test('thirty-plus known compounds land within 0.01 g/mol', () => {
  assert.ok(KNOWN.length >= 30, 'the specification asks for at least thirty');
  const hydrates = KNOWN.filter(([f]) => f.includes('*') || f.includes('·'));
  const polyatomics = KNOWN.filter(([f]) => f.includes('('));
  assert.ok(hydrates.length >= 4, 'at least four hydrates');
  assert.ok(polyatomics.length >= 4, 'at least four polyatomics');

  for (const [formula, published] of KNOWN) {
    const computed = molarMass(formula).value;
    const difference = Math.abs(computed - published);
    assert.ok(
      difference <= TOLERANCE_G_PER_MOL,
      `${formula}: computed ${computed.toFixed(4)}, published ${published}, off by ${difference.toFixed(4)}`,
    );
  }
});

test('hydrate water is included, and separable', () => {
  const pentahydrate = molarMass('CuSO4*5H2O');
  const anhydrous = molarMass('CuSO4');
  const water = molarMass('H2O');
  assert.ok(Math.abs(pentahydrate.anhydrousValue - anhydrous.value) < 1e-9);
  assert.ok(Math.abs(pentahydrate.hydrateValue - 5 * water.value) < 1e-9);
  assert.ok(Math.abs(pentahydrate.value - (anhydrous.value + 5 * water.value)) < 1e-9);
  // Omitting the water is a big enough error to be worth catching: it is a
  // third of the mass here, which is why E-MM-HYDRATE is its own class.
  assert.ok(pentahydrate.hydrateValue / pentahydrate.value > 0.3);
});

test('precision follows the least precise element, and the addition rule is reported too', () => {
  const water = molarMass('H2O');
  // Hydrogen is published to four figures and oxygen to five, so the
  // specification's rule gives four. The addition rule gives five, because both
  // are written to three decimal places. Both are reported; neither is guessed.
  assert.equal(water.sigFigs, 4);
  assert.equal(water.limitingElement, 'H');
  assert.equal(water.additionRuleSigFigs, 5);

  const salt = molarMass('NaCl');
  assert.equal(salt.limitingElement, 'Cl');
  assert.equal(salt.sigFigs, 4);
});

test('a leading coefficient does not change a molar mass', () => {
  const one = molarMassOfParsed(parseFormula('H2O'));
  const three = molarMassOfParsed(parseFormula('3H2O', { allowCoefficient: true }));
  assert.equal(one.value, three.value);
});

test('an element with no stable isotope is flagged, not silently averaged', () => {
  assert.equal(molarMass('H2O').containsUnstable, false);
  assert.equal(molarMass('TcO4').containsUnstable, true);
  assert.equal(molarMass('UO2').containsUnstable, false);
});

test('a hand-built count map naming an unknown element is refused', () => {
  const parsed = parseFormula('H2O');
  const broken = { ...parsed, counts: new Map([['Xx', 1]]) };
  assert.throws(() => molarMassOfParsed(broken), MolarMassError);
});
