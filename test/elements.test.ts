/**
 * elements.test.ts — the element table, checked twice.
 *
 * A WRONG ATOMIC WEIGHT IS THE UNRECOVERABLE DEFECT. Every molar mass, every
 * mole count and every answer in the product depends on this one table, and a
 * transposed digit in it produces answers that are wrong by a fraction of a
 * percent — small enough that nothing looks broken and every student is marked
 * against it. So the weights are transcribed a SECOND time here, independently
 * of the source file, and the two must agree.
 *
 * The second transcription is not a proof: it is the same author reading the
 * same published table twice, so a misreading could survive both. What it does
 * catch is the realistic failure — a slipped digit, a shifted row, a value in
 * the wrong element's slot. The ORDERING test below catches the shifted-row
 * case a second way, from a completely different direction.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, elementBySymbol, elementByNumber } from '../src/chem/elements.ts';

/** Independent second reading of CIAAW 2021: symbol, weight. */
const WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['H', 1.008], ['He', 4.002602], ['Li', 6.94], ['Be', 9.0121831], ['B', 10.81],
  ['C', 12.011], ['N', 14.007], ['O', 15.999], ['F', 18.998403162], ['Ne', 20.1797],
  ['Na', 22.98976928], ['Mg', 24.305], ['Al', 26.9815384], ['Si', 28.085], ['P', 30.973761998],
  ['S', 32.06], ['Cl', 35.45], ['Ar', 39.95], ['K', 39.0983], ['Ca', 40.078],
  ['Sc', 44.955907], ['Ti', 47.867], ['V', 50.9415], ['Cr', 51.9961], ['Mn', 54.938043],
  ['Fe', 55.845], ['Co', 58.933194], ['Ni', 58.6934], ['Cu', 63.546], ['Zn', 65.38],
  ['Ga', 69.723], ['Ge', 72.63], ['As', 74.921595], ['Se', 78.971], ['Br', 79.904],
  ['Kr', 83.798], ['Rb', 85.4678], ['Sr', 87.62], ['Y', 88.905838], ['Zr', 91.224],
  ['Nb', 92.90637], ['Mo', 95.95], ['Tc', 98], ['Ru', 101.07], ['Rh', 102.90549],
  ['Pd', 106.42], ['Ag', 107.8682], ['Cd', 112.414], ['In', 114.818], ['Sn', 118.71],
  ['Sb', 121.76], ['Te', 127.6], ['I', 126.90447], ['Xe', 131.293], ['Cs', 132.90545196],
  ['Ba', 137.327], ['La', 138.90547], ['Ce', 140.116], ['Pr', 140.90766], ['Nd', 144.242],
  ['Pm', 145], ['Sm', 150.36], ['Eu', 151.964], ['Gd', 157.25], ['Tb', 158.925354],
  ['Dy', 162.5], ['Ho', 164.930329], ['Er', 167.259], ['Tm', 168.934219], ['Yb', 173.045],
  ['Lu', 174.9668], ['Hf', 178.486], ['Ta', 180.94788], ['W', 183.84], ['Re', 186.207],
  ['Os', 190.23], ['Ir', 192.217], ['Pt', 195.084], ['Au', 196.96657], ['Hg', 200.592],
  ['Tl', 204.38], ['Pb', 207.2], ['Bi', 208.9804], ['Po', 209], ['At', 210],
  ['Rn', 222], ['Fr', 223], ['Ra', 226], ['Ac', 227], ['Th', 232.0377],
  ['Pa', 231.03588], ['U', 238.02891], ['Np', 237], ['Pu', 244], ['Am', 243],
  ['Cm', 247], ['Bk', 247], ['Cf', 251], ['Es', 252], ['Fm', 257],
  ['Md', 258], ['No', 259], ['Lr', 266], ['Rf', 267], ['Db', 268],
  ['Sg', 269], ['Bh', 270], ['Hs', 269], ['Mt', 278], ['Ds', 281],
  ['Rg', 282], ['Cn', 285], ['Nh', 286], ['Fl', 289], ['Mc', 290],
  ['Lv', 293], ['Ts', 294], ['Og', 294],
];

test('all 118 elements are present, once each, in atomic-number order', () => {
  assert.equal(ELEMENTS.length, 118);
  ELEMENTS.forEach((element, index) => {
    assert.equal(element.z, index + 1, `${element.symbol} is out of order`);
  });
  assert.equal(new Set(ELEMENTS.map((e) => e.symbol)).size, 118);
  assert.equal(new Set(ELEMENTS.map((e) => e.name)).size, 118);
});

test('every weight matches an independent second transcription', () => {
  assert.equal(WEIGHTS.length, 118);
  WEIGHTS.forEach(([symbol, weight], index) => {
    const element = ELEMENTS[index];
    assert.notEqual(element, undefined);
    assert.equal(element?.symbol, symbol, `slot ${index + 1} holds the wrong element`);
    assert.equal(element?.weight, weight, `${symbol}'s weight does not match`);
  });
});

test('every symbol looks up to itself, and case is not folded', () => {
  for (const element of ELEMENTS) {
    assert.equal(elementBySymbol(element.symbol)?.z, element.z);
    assert.equal(elementByNumber(element.z)?.symbol, element.symbol);
  }
  // Co is cobalt. CO is carbon monoxide. Folding case turns one into the other.
  assert.equal(elementBySymbol('CO'), undefined);
  assert.equal(elementBySymbol('co'), undefined);
  assert.equal(elementBySymbol('Co')?.name, 'cobalt');
  assert.equal(elementByNumber(0), undefined);
  assert.equal(elementByNumber(119), undefined);
  assert.equal(elementByNumber(1.5), undefined);
});

test('the mass-order inversions are exactly the known ones', () => {
  // A shifted row or a transposed digit almost always shows up as a NEW
  // inversion of the weight sequence. The real periodic table has a small,
  // fixed set of them, so listing that set turns "did a value move" into a
  // question this test can answer without knowing what the value should be.
  // Ar/K, Co/Ni and Te/I are the classic three, where the heavier element sits
  // first because of isotopic abundance. The rest are among the bracketed mass
  // numbers, where the most stable isotope of the heavier element happens to be
  // lighter, or the same: Cm and Bk are both 247, Ts and Og are both 294.
  const expected = new Set([
    'Ar>K', 'Co>Ni', 'Te>I', 'Th>Pa', 'U>Np', 'Pu>Am', 'Cm>Bk', 'Bh>Hs', 'Ts>Og',
  ]);
  const found = new Set<string>();
  for (let i = 1; i < ELEMENTS.length; i += 1) {
    const previous = ELEMENTS[i - 1];
    const current = ELEMENTS[i];
    if (previous === undefined || current === undefined) continue;
    if (previous.weight >= current.weight) found.add(`${previous.symbol}>${current.symbol}`);
  }
  assert.deepEqual([...found].sort(), [...expected].sort());
});

test('significant figures match the digits actually published', () => {
  // A JavaScript number literal cannot hold a trailing zero: germanium is
  // published as 72.630 and stored as 72.63, which is why `sigFigs` is a
  // separate field rather than something to count off the value. So the check
  // is two-sided — no element may DECLARE fewer figures than it writes, and the
  // five that declare more are named here, because a sixth appearing would mean
  // somebody had padded a count rather than recorded one.
  const TRAILING_ZERO_ELEMENTS = new Set(['Ge', 'Sn', 'Sb', 'Te', 'Dy']);
  const surplus: string[] = [];
  for (const element of ELEMENTS) {
    assert.ok(element.sigFigs >= 2, `${element.symbol} claims fewer than two figures`);
    const written = String(element.weight).replace('-', '').replace('.', '').replace(/^0+/, '');
    assert.ok(
      written.length <= element.sigFigs,
      `${element.symbol} writes ${written.length} digits but declares only ${element.sigFigs}`,
    );
    if (written.length < element.sigFigs) surplus.push(element.symbol);
  }
  assert.deepEqual(surplus.sort(), [...TRAILING_ZERO_ELEMENTS].sort());
});

test('every element with no stable isotope carries a whole mass number', () => {
  const unstable = ELEMENTS.filter((e) => e.noStableIsotope).map((e) => e.symbol);
  // Technetium and promethium, then everything from polonium up EXCEPT thorium,
  // protactinium and uranium — those three occur in nature with a characteristic
  // composition, so CIAAW publishes a measured standard atomic weight for them
  // rather than a bracketed mass number. Bismuth is likewise not bracketed:
  // 209Bi decays, but on a timescale that leaves the element's composition
  // fixed for every purpose a chemistry class has.
  assert.deepEqual(unstable, [
    'Tc', 'Pm',
    'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac',
    'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr',
    'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
  ]);
  for (const symbol of unstable) {
    const element = elementBySymbol(symbol);
    assert.ok(Number.isInteger(element?.weight), `${symbol} is bracketed but not a whole number`);
  }
  assert.equal(elementBySymbol('Bi')?.noStableIsotope, false);
  assert.equal(elementBySymbol('U')?.noStableIsotope, false);
});
