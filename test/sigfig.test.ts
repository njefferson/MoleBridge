/**
 * sigfig.test.ts — counting figures, and refusing to guess.
 *
 * The ambiguity tests are the point. `1500` is two, three or four significant
 * figures and the string does not say which; the engine must report BOTH
 * readings and keep reporting both through every operation that follows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addSubtract,
  exact,
  formatSigFigs,
  formatUnambiguous,
  isAmbiguous,
  lastPlaceOf,
  magnitudeOf,
  measured,
  multiplyDivide,
  parseQuantity,
  reportableSigFigs,
  roundToSigFigs,
  SigFigError,
  sigFigsFrom,
} from '../src/chem/sigfig.ts';

test('unambiguous counts', () => {
  const cases: ReadonlyArray<readonly [string, number, number]> = [
    ['1503', 4, 0],
    ['12.30', 4, -2],
    ['0.00450', 3, -5],
    ['0.500', 3, -3],
    ['2.50', 3, -2],
    ['5', 1, 0],
    ['1200.', 4, 0],
    ['1.20e3', 3, 1],
    ['1.20E3', 3, 1],
    ['1.20x10^3', 3, 1],
    ['1.20×10^3', 3, 1],
    ['-3.40E-2', 3, -4],
    ['6.02214076e23', 9, 15],
  ];
  for (const [text, sigFigs, lastPlace] of cases) {
    const q = parseQuantity(text);
    assert.equal(q.kind, 'measured', `${text} should not be ambiguous`);
    if (q.kind !== 'measured') continue;
    assert.equal(q.reading.sigFigs, sigFigs, text);
    assert.equal(q.reading.lastPlace, lastPlace, `${text} last place`);
  }
});

test('trailing zeros with no decimal point are FLAGGED, not guessed', () => {
  const cases: ReadonlyArray<readonly [string, number, number]> = [
    ['1500', 2, 4],
    ['100', 1, 3],
    ['250', 2, 3],
    ['1000000', 1, 7],
    ['1,500', 2, 4],
  ];
  for (const [text, low, high] of cases) {
    const q = parseQuantity(text);
    assert.equal(q.kind, 'ambiguous', `${text} should be ambiguous`);
    assert.equal(isAmbiguous(q), true);
    if (q.kind !== 'ambiguous') continue;
    assert.equal(q.low.sigFigs, low, `${text} low reading`);
    assert.equal(q.high.sigFigs, high, `${text} high reading`);
    // Nothing may collapse the band into one answer.
    assert.equal(reportableSigFigs(q), null, `${text} must not report a single count`);
  }
  // With the point written, the same digits are no longer ambiguous.
  assert.equal(parseQuantity('1500.').kind, 'measured');
  assert.equal(reportableSigFigs(parseQuantity('1500.')), 4);
});

test('values are read correctly, whatever the notation', () => {
  const cases: ReadonlyArray<readonly [string, number]> = [
    ['1500', 1500],
    ['12.30', 12.3],
    ['0.00450', 0.0045],
    ['1.20e3', 1200],
    ['1.20x10^3', 1200],
    ['-3.40E-2', -0.034],
    ['1,500', 1500],
    ['0.0', 0],
  ];
  for (const [text, value] of cases) {
    assert.equal(parseQuantity(text).value, value, text);
  }
});

test('multiplication and division take the FEWEST significant figures', () => {
  const a = parseQuantity('1.20');
  const b = parseQuantity('3.0');
  const product = multiplyDivide(1.2 * 3.0, [a, b]);
  assert.equal(reportableSigFigs(product), 2);

  // An exact value never limits anything.
  const withExact = multiplyDivide(1.2 * 3, [a, exact(3)]);
  assert.equal(reportableSigFigs(withExact), 3);

  // With no measured operand at all the result is exact.
  assert.equal(multiplyDivide(6, [exact(2), exact(3)]).kind, 'exact');
});

test('addition and subtraction take the COARSEST decimal place', () => {
  const sum = addSubtract(12.34 + 1.1, [parseQuantity('12.34'), parseQuantity('1.1')]);
  assert.equal(sum.kind, 'measured');
  if (sum.kind === 'measured') {
    assert.equal(sum.reading.lastPlace, -1);
    assert.equal(sum.reading.sigFigs, 3);
  }

  // 1500 (ambiguous) + 2.34 keeps the band: the coarse reading stops at the
  // hundreds, the fine one at the ones.
  const banded = addSubtract(1502.34, [parseQuantity('1500'), parseQuantity('2.34')]);
  assert.equal(banded.kind, 'ambiguous');
  if (banded.kind === 'ambiguous') {
    assert.equal(banded.low.lastPlace, 2);
    assert.equal(banded.high.lastPlace, 0);
  }
});

test('a mixed multiply-and-add chain carries the right precision', () => {
  // (12.34 + 1.1) x 2.0  ->  the sum has 3 figures, 2.0 has 2, so 2 figures.
  const sum = addSubtract(13.44, [parseQuantity('12.34'), parseQuantity('1.1')]);
  const product = multiplyDivide(13.44 * 2.0, [sum, parseQuantity('2.0')]);
  assert.equal(reportableSigFigs(product), 2);
  assert.equal(roundToSigFigs(product.value, 2), 27);

  // 100.0 / 3.00 x 6.0221e23 (exact) -> 3 figures from 3.00.
  const moles = multiplyDivide(100.0 / 3.0, [parseQuantity('100.0'), parseQuantity('3.00')]);
  assert.equal(reportableSigFigs(moles), 3);
  const particles = multiplyDivide(moles.value * 6.02214076e23, [moles, exact(6.02214076e23)]);
  assert.equal(reportableSigFigs(particles), 3);
});

test('an ambiguity survives while it still matters, and only then', () => {
  const ambiguous = parseQuantity('1500');

  // Against a more precise operand the band is still the band: whether 1500 is
  // two figures or four decides the answer, so both readings are carried.
  const stillOpen = multiplyDivide(1500 * 3.0, [ambiguous, parseQuantity('3.00000')]);
  assert.equal(stillOpen.kind, 'ambiguous');
  assert.equal(reportableSigFigs(stillOpen), null);
  const further = multiplyDivide(stillOpen.value * 2, [stillOpen, exact(2)]);
  assert.equal(further.kind, 'ambiguous');

  // Against an operand at least as coarse as the LOW reading it collapses, and
  // that is correct rather than a leak: 2.0 limits the answer to two figures
  // whichever way 1500 was meant, so there is nothing left to be ambiguous
  // about, and reporting a band here would be inventing doubt.
  const settled = multiplyDivide(1500 * 2.0, [ambiguous, parseQuantity('2.0')]);
  assert.equal(settled.kind, 'measured');
  assert.equal(reportableSigFigs(settled), 2);
});

test('magnitude and last place are computed by string, not by log10', () => {
  assert.equal(magnitudeOf(1000), 3);
  assert.equal(magnitudeOf(999.9999), 2);
  assert.equal(magnitudeOf(0.001), -3);
  assert.equal(magnitudeOf(-12.3), 1);
  assert.equal(lastPlaceOf(12.34, 4), -2);
  assert.equal(lastPlaceOf(1500, 2), 2);
  assert.equal(sigFigsFrom(1502.34, 0), 4);
  assert.equal(sigFigsFrom(0, -2), 1);
});

test('rounding uses the decimal round-trip, not a power-of-ten multiply', () => {
  assert.equal(roundToSigFigs(0.0045678, 3), 0.00457);
  assert.equal(roundToSigFigs(123456, 3), 123000);
  assert.equal(roundToSigFigs(0, 3), 0);
  assert.equal(roundToSigFigs(-2.34567, 3), -2.35);
  assert.equal(roundToSigFigs(6.02214076e23, 4), 6.022e23);

  // Scaling by a power of ten rounds twice, and the second rounding is not
  // free: the scale factor itself is not exactly representable, so the result
  // comes back with a tail on it. Rounding -445486.80 to two figures should be
  // -450000 exactly, and the scaled method makes it -450000.00000000006.
  const value = -445486.80237829743;
  const scaled = Math.round(value * 10 ** -4) / 10 ** -4;
  assert.equal(roundToSigFigs(value, 2), -450000);
  assert.notEqual(scaled, -450000);

  // What NEITHER method fixes, asserted so nobody later files it as a bug: a
  // literal written as 1.005 is stored a hair below it, so three figures is
  // 1.00. That is the number the machine has.
  assert.ok(1.005 < 1.005000000000001);
  assert.equal(roundToSigFigs(1.005, 3), 1);
});

test('formatting never produces a number nobody can read back', () => {
  assert.equal(formatSigFigs(0.0045678, 3), '0.00457');
  assert.equal(formatSigFigs(123456, 3), '1.23e5');
  assert.equal(formatSigFigs(2.5, 4), '2.500');
  assert.equal(formatSigFigs(0, 3), '0.00');

  // The whole point: 10.4 to two figures is `10.`, never `10`.
  assert.equal(formatUnambiguous(10.4, 2), '10.');
  assert.equal(parseQuantity(formatUnambiguous(10.4, 2)).kind, 'measured');
  assert.equal(reportableSigFigs(parseQuantity(formatUnambiguous(10.4, 2))), 2);

  // Values that round into a new decade: the count must not grow with the carry.
  assert.equal(formatUnambiguous(9.96, 2), '10.');
  assert.equal(formatUnambiguous(0.09999666, 4), '0.1000');
  assert.equal(formatUnambiguous(9.999, 2), '10.');
  assert.equal(formatUnambiguous(99.6, 2), '1.0e2');

  for (const [value, sigFigs] of [
    [10.4, 2], [1500.2, 2], [250.4, 3], [7.77, 3], [0.0102, 3],
    [9.96, 2], [0.09999666, 4], [9.999, 2], [99.6, 2], [999.9, 3], [0.99999, 3],
  ] as const) {
    const text = formatUnambiguous(value, sigFigs);
    const back = parseQuantity(text);
    assert.equal(back.kind, 'measured', `${text} came back ambiguous`);
    assert.equal(reportableSigFigs(back), sigFigs, text);
  }
});

test('measured and exact constructors agree with the parser', () => {
  const parsed = parseQuantity('12.30');
  const built = measured(12.3, 4);
  assert.equal(parsed.kind, 'measured');
  assert.equal(built.kind, 'measured');
  if (parsed.kind === 'measured' && built.kind === 'measured') {
    assert.deepEqual(built.reading, parsed.reading);
  }
  assert.equal(reportableSigFigs(exact(5)), null);
});

test('unreadable input is refused with an offset', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['abc', 'NO_DIGITS'],
    ['1.2.3', 'MULTIPLE_DECIMAL_POINTS'],
    ['1.2e', 'BAD_EXPONENT'],
    ['1.2 grams', 'TRAILING_CONTENT'],
    ['1,5', 'NOT_A_NUMBER'],
  ];
  for (const [text, code] of cases) {
    assert.throws(
      () => parseQuantity(text),
      (error: unknown) => error instanceof SigFigError && error.code === code,
      `${JSON.stringify(text)} should be ${code}`,
    );
  }
});
