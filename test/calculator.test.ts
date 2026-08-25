/**
 * calculator.test.ts — the calculator does sums, and refuses chemistry.
 *
 * A box that takes `CuSO4·5H2O` and returns 249.68 deletes three error classes
 * from the taxonomy and, with them, every diagnosis MoleBridge could have given
 * a student who cannot do that step. The refusal is the feature; this is what
 * holds it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculate, formatCalc } from '../src/learn/calculator.ts';
import { ELEMENTS } from '../src/chem/elements.ts';

test('it does the arithmetic, with the ordinary precedence', () => {
  const value = (text: string): number => {
    const result = calculate(text);
    assert.equal(result.kind, 'VALUE', `${text} did not evaluate: ${JSON.stringify(result)}`);
    return result.kind === 'VALUE' ? result.value : Number.NaN;
  };
  assert.equal(value('2+3*4'), 14);
  assert.equal(value('(2+3)*4'), 20);
  assert.equal(value('10/4'), 2.5);
  assert.equal(value('-3 + 5'), 2);
  assert.equal(value('2.50 * 4'), 10);
  // A student converting to particles types this, and it has to work.
  assert.ok(Math.abs(value('6.022e23 * 2') - 1.2044e24) < 1e20);
  // The app's own buttons and a phone keyboard both produce these.
  assert.equal(value('6 × 7'), 42);
  assert.equal(value('84 ÷ 2'), 42);
  assert.equal(value('1,250 + 250'), 1500);
});

test('NO ELEMENT SYMBOL EVALUATES TO ANYTHING', () => {
  // Every one of the 118, because the refusal has to be structural rather than
  // a blocklist somebody forgot to extend. A symbol that evaluated would be a
  // molar mass by another name.
  for (const element of ELEMENTS) {
    const result = calculate(element.symbol);
    assert.equal(result.kind, 'ERROR', `${element.symbol} evaluated instead of being refused`);
    const withNumber = calculate(`${element.symbol}2`);
    assert.equal(withNumber.kind, 'ERROR', `${element.symbol}2 evaluated instead of being refused`);
  }
});

test('no formula reaches the parser', () => {
  for (const formula of ['H2O', 'CuSO4', 'Al2(SO4)3', 'CuSO4·5H2O', 'NaCl', 'C6H12O6', 'Fe2O3']) {
    const result = calculate(formula);
    assert.equal(result.kind, 'ERROR', `${formula} was evaluated`);
    // The message says WHY rather than "unexpected character", because a
    // student who typed a formula did something reasonable and needs to be told
    // what this box is for.
    assert.ok(
      result.kind === 'ERROR' && /molar mass|unit/i.test(result.why),
      `${formula} was refused without saying what this box is for`,
    );
  }
});

test('it refuses anything that is not arithmetic, without eval getting a look in', () => {
  for (const attempt of [
    'Math.sqrt(4)',
    'sqrt(4)',
    'window',
    'alert(1)',
    '(2+3',
    '2+',
    '**',
    '1/0',
  ]) {
    assert.equal(calculate(attempt).kind, 'ERROR', `"${attempt}" was not refused`);
  }
  assert.equal(calculate('').kind, 'EMPTY');
  assert.equal(calculate('   ').kind, 'EMPTY');
});

test('the display shows figures without deciding how many belong', () => {
  // Rounding to the problem's precision here would make the significant-figures
  // decision for the student, which is a graded step and its own error class.
  assert.equal(formatCalc(2.5), '2.5');
  assert.equal(formatCalc(0), '0');
  assert.match(formatCalc(1 / 3), /^0\.3333333333/);
  assert.match(formatCalc(6.022e23), /e\+23$/);
  // Ten figures is enough that carrying the full value through is possible,
  // which is what E-ROUND-EARLY is about.
  assert.ok(formatCalc(1 / 7).replace(/[^0-9]/g, '').length >= 10);
});
