/**
 * formula.test.ts — the parser, and the twenty-odd ways of getting it wrong.
 *
 * The rejections matter more than the acceptances. A parser that accepts a
 * malformed formula produces a plausible wrong molar mass, and a plausible
 * wrong molar mass is invisible: nothing crashes, the answer is simply wrong by
 * a few percent for everyone in the room. So each rejection below asserts the
 * CODE and the OFFSET, not merely that something was refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFormula,
  tryParseFormula,
  formatCounts,
  FormulaError,
  type FormulaErrorCode,
} from '../src/chem/formula.ts';

const counts = (formula: string): Record<string, number> =>
  Object.fromEntries(parseFormula(formula).counts);

test('simple formulas and subscripts', () => {
  assert.deepEqual(counts('NaCl'), { Na: 1, Cl: 1 });
  assert.deepEqual(counts('H2O'), { H: 2, O: 1 });
  assert.deepEqual(counts('C6H12O6'), { C: 6, H: 12, O: 6 });
  assert.deepEqual(counts('KMnO4'), { K: 1, Mn: 1, O: 4 });
  // The greedy read has to back off one letter: there is no element `Nacl`.
  assert.deepEqual(counts('CoCl2'), { Co: 1, Cl: 2 });
  assert.deepEqual(counts('CO'), { C: 1, O: 1 });
});

test('nested parentheses and square brackets', () => {
  assert.deepEqual(counts('Ca(NO3)2'), { Ca: 1, N: 2, O: 6 });
  assert.deepEqual(counts('(NH4)3PO4'), { N: 3, H: 12, P: 1, O: 4 });
  assert.deepEqual(counts('Al2(SO4)3'), { Al: 2, S: 3, O: 12 });
  assert.deepEqual(counts('[Cu(NH3)4]SO4'), { Cu: 1, N: 4, H: 12, S: 1, O: 4 });
  assert.deepEqual(counts('K4Fe(CN)6'), { K: 4, Fe: 1, C: 6, N: 6 });
  // Three deep, with a subscript at every level.
  assert.deepEqual(counts('Ca3(PO4)2'), { Ca: 3, P: 2, O: 8 });
  assert.deepEqual(counts('[Fe(H2O)6]Cl3'), { Fe: 1, H: 12, O: 6, Cl: 3 });
});

test('both hydrate separators mean the same thing', () => {
  const star = parseFormula('CuSO4*5H2O');
  const dot = parseFormula('CuSO4·5H2O');
  assert.deepEqual([...star.counts], [...dot.counts]);
  assert.equal(star.hydrateWaters, 5);
  assert.equal(dot.hydrateWaters, 5);
  assert.deepEqual(Object.fromEntries(star.counts), { Cu: 1, S: 1, O: 9, H: 10 });
  assert.deepEqual(Object.fromEntries(star.anhydrousCounts), { Cu: 1, S: 1, O: 4 });
  assert.equal(parseFormula('Na2CO3*10H2O').hydrateWaters, 10);
  // Space around the dot is how it gets typed, and is not an error.
  assert.equal(parseFormula('MgSO4 * 7H2O').hydrateWaters, 7);
});

test('charged species', () => {
  assert.equal(parseFormula('SO4^2-').charge, -2);
  assert.equal(parseFormula('Fe^3+').charge, 3);
  assert.equal(parseFormula('Cl^-').charge, -1);
  assert.equal(parseFormula('Na^+').charge, 1);
  assert.equal(parseFormula('PO4^-3').charge, -3);
  assert.equal(parseFormula('H2O').charge, 0);
  assert.deepEqual(Object.fromEntries(parseFormula('SO4^2-').counts), { S: 1, O: 4 });
});

test('a leading coefficient only where the caller asks for one', () => {
  assert.equal(parseFormula('3H2O', { allowCoefficient: true }).coefficient, 3);
  assert.equal(parseFormula('12 CO2', { allowCoefficient: true }).coefficient, 12);
  assert.equal(parseFormula('H2O', { allowCoefficient: true }).coefficient, 1);
  // The coefficient does NOT multiply the counts: it belongs to the equation.
  assert.deepEqual(
    Object.fromEntries(parseFormula('3H2O', { allowCoefficient: true }).counts),
    { H: 2, O: 1 },
  );
  const refused = tryParseFormula('3H2O');
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.error.code, 'COEFFICIENT_NOT_ALLOWED');
});

test('formatCounts round-trips a simple formula', () => {
  assert.equal(formatCounts(parseFormula('C6H12O6').counts), 'C6H12O6');
  assert.equal(formatCounts(parseFormula('NaCl').counts), 'NaCl');
});

/** Every rejection: input, expected code, expected offset. */
const REJECTIONS: ReadonlyArray<readonly [string, FormulaErrorCode, number]> = [
  ['', 'EMPTY', 0],
  ['   ', 'EMPTY', 0],
  ['Xx2', 'UNKNOWN_ELEMENT', 0],
  ['H2Zz', 'UNKNOWN_ELEMENT', 2],
  ['h2o', 'UNEXPECTED_CHAR', 0],
  ['H2O)', 'UNOPENED_GROUP', 3],
  ['(H2O', 'UNCLOSED_GROUP', 0],
  ['Ca(NO3', 'UNCLOSED_GROUP', 2],
  ['[Cu(NH3)4SO4', 'UNCLOSED_GROUP', 0],
  ['[H2O)', 'MISMATCHED_BRACKET', 4],
  ['(H2O]', 'MISMATCHED_BRACKET', 4],
  ['()', 'EMPTY_GROUP', 0],
  ['Ca()2', 'EMPTY_GROUP', 2],
  ['H0', 'ZERO_SUBSCRIPT', 1],
  ['H007', 'LEADING_ZERO', 1],
  ['C(NO3)02', 'LEADING_ZERO', 6],
  ['H99999', 'SUBSCRIPT_TOO_LARGE', 1],
  ['2H2O', 'COEFFICIENT_NOT_ALLOWED', 0],
  ['Fe3+', 'CHARGE_NEEDS_CARET', 3],
  ['SO4-', 'CHARGE_NEEDS_CARET', 3],
  ['Na+', 'CHARGE_NEEDS_CARET', 2],
  ['SO4^', 'BAD_CHARGE', 3],
  ['SO4^2', 'BAD_CHARGE', 3],
  ['H2O^x', 'BAD_CHARGE', 3],
  ['H2 O', 'TRAILING_CONTENT', 3],
  ['H2O^2-x', 'TRAILING_CONTENT', 6],
  ['H₂O', 'UNICODE_SUBSCRIPT', 1],
  ['CuSO4*', 'DANGLING_HYDRATE_SEPARATOR', 5],
  ['CuSO4·', 'DANGLING_HYDRATE_SEPARATOR', 5],
  ['*H2O', 'EMPTY', 0],
  ['Ca(NO3 )2', 'UNEXPECTED_CHAR', 6],
  ['H2O!', 'UNEXPECTED_CHAR', 3],
  ['2', 'COEFFICIENT_NOT_ALLOWED', 0],
];

test('every malformed input is rejected with the right code and offset', () => {
  assert.ok(REJECTIONS.length >= 20, 'the specification asks for at least twenty');
  for (const [input, code, offset] of REJECTIONS) {
    const result = tryParseFormula(input);
    assert.equal(result.ok, false, `"${input}" was accepted`);
    if (result.ok) continue;
    assert.equal(result.error.code, code, `"${input}" gave ${result.error.code}`);
    assert.equal(result.error.offset, offset, `"${input}" pointed at ${result.error.offset}`);
    assert.equal(result.error.input, input, 'the error must carry the input unmodified');
    assert.ok(result.error instanceof FormulaError);
  }
});

test('an offset always points inside the input, or just past its end', () => {
  for (const [input] of REJECTIONS) {
    const result = tryParseFormula(input);
    if (result.ok) continue;
    assert.ok(result.error.offset >= 0);
    assert.ok(result.error.offset <= input.length, `"${input}" points past the end`);
  }
});

test('surrounding whitespace is tolerated', () => {
  assert.deepEqual(counts('  H2O  '), { H: 2, O: 1 });
  assert.deepEqual(counts('\tNaCl'), { Na: 1, Cl: 1 });
});
