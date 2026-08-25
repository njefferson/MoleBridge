/**
 * table.test.ts — every element is placed, once, in the right group.
 *
 * The layout is computed from the atomic number rather than typed out, because
 * 118 hand-written positions are 118 chances to be wrong in a way that looks
 * plausible in a diff. This checks the landmarks a chemist would check.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ELEMENTS, elementBySymbol } from '../src/chem/elements.ts';
import { TABLE, cellFor, weightText, TABLE_COLUMNS } from '../src/learn/table.ts';
import * as tableModule from '../src/learn/table.ts';

const at = (symbol: string) => {
  const element = elementBySymbol(symbol);
  assert.ok(element !== undefined, `no element ${symbol}`);
  return cellFor(element);
};

test('every element is placed exactly once, in one cell', () => {
  assert.equal(TABLE.length, ELEMENTS.length);
  const seen = new Set<string>();
  for (const cell of TABLE) {
    const key = `${cell.row}:${cell.column}`;
    assert.ok(!seen.has(key), `${cell.element.symbol} shares a cell with something else`);
    seen.add(key);
    assert.ok(cell.column >= 1 && cell.column <= TABLE_COLUMNS, `${cell.element.symbol} is off the side`);
    assert.ok(cell.row >= 1, `${cell.element.symbol} is off the top`);
  }
});

test('the landmarks are where a chemist would look for them', () => {
  assert.deepEqual([at('H').row, at('H').column], [1, 1]);
  assert.deepEqual([at('He').row, at('He').column], [1, 18]);
  assert.deepEqual([at('Li').row, at('Li').column], [2, 1]);
  // The period-2 jump: beryllium in group 2, boron in group 13, nothing between.
  assert.deepEqual([at('Be').row, at('Be').column], [2, 2]);
  assert.deepEqual([at('B').row, at('B').column], [2, 13]);
  assert.deepEqual([at('C').row, at('C').column], [2, 14]);
  assert.deepEqual([at('O').row, at('O').column], [2, 16]);
  assert.deepEqual([at('Ne').row, at('Ne').column], [2, 18]);
  // Period 4 runs straight through, so the d-block starts at group 3.
  assert.deepEqual([at('K').row, at('K').column], [4, 1]);
  assert.deepEqual([at('Sc').row, at('Sc').column], [4, 3]);
  assert.deepEqual([at('Fe').row, at('Fe').column], [4, 8]);
  assert.deepEqual([at('Cu').row, at('Cu').column], [4, 11]);
  assert.deepEqual([at('Kr').row, at('Kr').column], [4, 18]);
  // Period 6 skips the f-block, so hafnium lands in group 4 and not group 19.
  assert.deepEqual([at('Cs').row, at('Cs').column], [6, 1]);
  assert.deepEqual([at('Hf').row, at('Hf').column], [6, 4]);
  assert.deepEqual([at('Au').row, at('Au').column], [6, 11]);
  assert.deepEqual([at('Rn').row, at('Rn').column], [6, 18]);
  assert.deepEqual([at('Og').row, at('Og').column], [7, 18]);
});

test('the f-block is lifted out, all thirty of it', () => {
  const f = TABLE.filter((cell) => cell.block === 'f');
  assert.equal(f.length, 30, 'the f-block is fifteen elements twice');
  // Numerically. A bare `.sort()` compares as text and puts 10 before 9.
  assert.deepEqual([...new Set(f.map((cell) => cell.row))].sort((a, b) => a - b), [9, 10]);
  assert.equal(at('La').block, 'f');
  assert.equal(at('Lu').block, 'f');
  assert.equal(at('Ac').block, 'f');
  assert.equal(at('Lr').block, 'f');
  // And nothing in the main table sits in the rows the f-block occupies.
  for (const cell of TABLE) {
    if (cell.row >= 9) assert.equal(cell.block, 'f', `${cell.element.symbol} is in an f-block row`);
  }
});

test('the weight is shown at the published figures, bracketed where it must be', () => {
  const carbon = elementBySymbol('C');
  assert.ok(carbon !== undefined);
  assert.equal(weightText(carbon), '12.011');
  const technetium = elementBySymbol('Tc');
  assert.ok(technetium !== undefined);
  assert.match(weightText(technetium), /^\[\d+\]$/, 'an element with no stable isotope is not bracketed');
});

test('NOTHING HERE TAKES A FORMULA', () => {
  // The same line the calculator draws. A periodic table that turns CuSO4 into
  // 159.61 is the calculator's forbidden feature wearing a different hat, and
  // it deletes the same error classes from the taxonomy.
  for (const [name, exported] of Object.entries(tableModule)) {
    if (typeof exported !== 'function') continue;
    assert.ok(
      !/formula|molar|compound|parse/i.test(name),
      `${name} sounds like it takes a formula, and this module must not`,
    );
  }
  assert.ok(
    !Object.keys(tableModule).some((name) => /molarMass|parseFormula/.test(name)),
    'this module re-exports something that computes a molar mass',
  );
});
