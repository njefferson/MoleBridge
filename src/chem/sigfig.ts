/**
 * sigfig.ts — significant figures, counted and propagated.
 *
 * THE ONE RULE THAT SHAPES THIS FILE: an ambiguous number is reported as
 * ambiguous, never resolved. `1500` written with no decimal point may be two,
 * three or four significant figures and nothing in the string says which. A
 * library that picks one is inventing information about somebody's measurement,
 * and it will then mark a student wrong for the reading it did not pick. So an
 * ambiguous input becomes an ambiguous QUANTITY, carrying both readings, and
 * every operation propagates the band rather than collapsing it.
 *
 * PURE. No I/O, no globals, no clock.
 */

/** How a value was read: how many digits count, and where the last one sits. */
export interface Reading {
  /** Significant figure count. */
  readonly sigFigs: number;
  /**
   * Power of ten of the last significant digit. `12.34` is -2; `1500` read as
   * two significant figures is 2. This is what addition and subtraction limit.
   */
  readonly lastPlace: number;
}

/**
 * A number with its precision attached.
 *
 *   exact      a counted thing or a defined conversion — never limits anything
 *   measured   one unambiguous reading
 *   ambiguous  trailing zeros with no decimal point: two readings, both kept
 */
export type Quantity =
  | { readonly kind: 'exact'; readonly value: number }
  | { readonly kind: 'measured'; readonly value: number; readonly reading: Reading }
  | {
      readonly kind: 'ambiguous';
      readonly value: number;
      /** The fewest significant figures the text could mean. */
      readonly low: Reading;
      /** The most it could mean. */
      readonly high: Reading;
    };

/** Why a numeric string could not be read. */
export type SigFigErrorCode =
  | 'EMPTY'
  | 'NOT_A_NUMBER'
  | 'MULTIPLE_DECIMAL_POINTS'
  | 'NO_DIGITS'
  | 'BAD_EXPONENT'
  | 'TRAILING_CONTENT';

/** A rejection from {@link parseQuantity}, with the offset it happened at. */
export class SigFigError extends Error {
  readonly code: SigFigErrorCode;
  readonly offset: number;
  readonly input: string;

  constructor(code: SigFigErrorCode, offset: number, input: string, detail: string) {
    super(`${code} at offset ${offset}: ${detail}`);
    this.name = 'SigFigError';
    this.code = code;
    this.offset = offset;
    this.input = input;
  }
}

/** An exact quantity — a coefficient, a count, a defined conversion. */
export function exact(value: number): Quantity {
  return { kind: 'exact', value };
}

/**
 * A measured quantity stated directly rather than parsed from text.
 *
 * PRECONDITION: `sigFigs` is a positive integer.
 */
export function measured(value: number, sigFigs: number): Quantity {
  return { kind: 'measured', value, reading: { sigFigs, lastPlace: lastPlaceOf(value, sigFigs) } };
}

/**
 * Power of ten of the leading digit: 1 for 12.3, -3 for 0.00456, 0 for 5.
 *
 * PRECONDITION: `value` is finite and non-zero.
 *
 * Computed by string rather than by `Math.log10`, which returns 2.9999999999999996
 * for 1000 on some inputs and would put the leading digit one place out.
 */
export function magnitudeOf(value: number): number {
  const text = Math.abs(value).toExponential();
  const at = text.indexOf('e');
  return Number(text.slice(at + 1));
}

/**
 * Power of ten of the last significant digit, given a value and a digit count.
 *
 * PRECONDITION: `value` is finite; `sigFigs` is a positive integer. A value of
 * zero has no magnitude, and is treated as sitting at the ones place.
 */
export function lastPlaceOf(value: number, sigFigs: number): number {
  if (value === 0) return 1 - sigFigs;
  return magnitudeOf(value) - sigFigs + 1;
}

/**
 * Significant figure count implied by a value and the place its last digit
 * sits in — the inverse of {@link lastPlaceOf}, used after an addition.
 *
 * PRECONDITION: `value` is finite. Returns at least 1: a sum that lands on
 * zero, or below the precision of its own inputs, still reports one digit
 * rather than a nonsensical zero or negative count.
 */
export function sigFigsFrom(value: number, lastPlace: number): number {
  if (value === 0) return 1;
  return Math.max(1, magnitudeOf(value) - lastPlace + 1);
}

const isDigit = (c: string): boolean => c >= '0' && c <= '9';

/**
 * Read a decimal or scientific-notation string into a {@link Quantity}.
 *
 * Accepts `12.30`, `1500`, `0.00450`, `1.20e3`, `1.20E-3`, `1.20x10^3`,
 * `1.20×10^3` and `1.20*10^3`, each with an optional leading sign.
 *
 * PRECONDITION: none — every rejection is a {@link SigFigError} naming the
 * offset. Surrounding whitespace and thousands commas are tolerated; a comma
 * used as a decimal separator is not, because `1,5` and `1,500` cannot both
 * be read and only one of them is a thousand times wrong.
 *
 * A plain integer with trailing zeros and no decimal point comes back
 * `ambiguous`. That is the point of the file.
 */
export function parseQuantity(input: string): Quantity {
  const raw = input.trim();
  if (raw.length === 0) throw new SigFigError('EMPTY', 0, input, 'there is no number here');

  const offsetIn = input.indexOf(raw);
  const fail = (code: SigFigErrorCode, at: number, detail: string): never => {
    throw new SigFigError(code, offsetIn + at, input, detail);
  };

  let i = 0;
  let sign = 1;
  if (raw[i] === '+' || raw[i] === '-') {
    sign = raw[i] === '-' ? -1 : 1;
    i += 1;
  }

  // Mantissa. Commas are grouping separators only, and only between digits.
  let intPart = '';
  let rawIntPart = '';
  let fracPart = '';
  let sawPoint = false;
  let firstCommaAt = -1;
  const mantissaStart = i;
  for (; i < raw.length; i += 1) {
    const c = raw[i] as string;
    if (isDigit(c)) {
      if (sawPoint) fracPart += c;
      else {
        intPart += c;
        rawIntPart += c;
      }
      continue;
    }
    if (c === ',') {
      if (sawPoint) fail('NOT_A_NUMBER', i, 'a comma after the decimal point is not a separator this reads');
      if (firstCommaAt === -1) firstCommaAt = i;
      rawIntPart += c;
      continue;
    }
    if (c === '.') {
      if (sawPoint) fail('MULTIPLE_DECIMAL_POINTS', i, 'a number has one decimal point');
      sawPoint = true;
      continue;
    }
    break;
  }
  if (intPart.length === 0 && fracPart.length === 0) {
    fail('NO_DIGITS', mantissaStart, 'there are no digits in this number');
  }
  // A comma is a THOUSANDS separator or it is nothing. `1,500` reads as fifteen
  // hundred; `1,5` is a European decimal comma, and reading it as fifteen would
  // be wrong by a factor of ten while looking entirely reasonable. There is no
  // way to tell the two apart from the string, so the grouped form is the only
  // one accepted and everything else is refused where the writer can see it.
  if (firstCommaAt !== -1 && !/^\d{1,3}(?:,\d{3})+$/.test(rawIntPart)) {
    fail('NOT_A_NUMBER', firstCommaAt, 'a comma here cannot be told from a decimal point');
  }

  // Exponent, in any of the forms a student actually types.
  let exponent = 0;
  let explicitExponent = false;
  const rest = raw.slice(i);
  if (rest.length > 0) {
    const m = /^(?:[eE]|\s*(?:[x×*])\s*10\s*\^?)\s*([+-]?\d+)\s*$/.exec(rest);
    if (m === null) {
      const looksExponential = /^[eE]|^\s*[x×*]/.test(rest);
      fail(
        looksExponential ? 'BAD_EXPONENT' : 'TRAILING_CONTENT',
        i,
        `"${rest}" is not an exponent this reads`,
      );
    } else {
      exponent = Number(m[1]);
      explicitExponent = true;
    }
  }

  const digits = intPart + fracPart;
  const value =
    sign * Number(`${intPart === '' ? '0' : intPart}.${fracPart === '' ? '0' : fracPart}e${exponent}`);

  // Leading zeros are placeholders, never significant.
  const firstSignificant = digits.search(/[1-9]/);
  if (firstSignificant === -1) {
    // The number is zero however it was written. One digit, at the place the
    // last written digit sits — a zero still records where you stopped looking.
    const lastPlace = sawPoint || explicitExponent ? -fracPart.length + exponent : exponent;
    return { kind: 'measured', value: 0, reading: { sigFigs: 1, lastPlace } };
  }

  const significantRun = digits.slice(firstSignificant);
  const lastPlaceAll = -fracPart.length + exponent;

  if (sawPoint || explicitExponent) {
    // A decimal point, or an explicit exponent, makes every written digit
    // count — that is exactly what writing them was for.
    return {
      kind: 'measured',
      value,
      reading: { sigFigs: significantRun.length, lastPlace: lastPlaceAll },
    };
  }

  // A bare integer. Trailing zeros are the ambiguous case.
  const trimmed = significantRun.replace(/0+$/, '');
  if (trimmed.length === significantRun.length) {
    return {
      kind: 'measured',
      value,
      reading: { sigFigs: significantRun.length, lastPlace: lastPlaceAll },
    };
  }
  const trailingZeros = significantRun.length - trimmed.length;
  return {
    kind: 'ambiguous',
    value,
    low: { sigFigs: trimmed.length, lastPlace: lastPlaceAll + trailingZeros },
    high: { sigFigs: significantRun.length, lastPlace: lastPlaceAll },
  };
}

/** The low and high readings of a quantity. Exact quantities have neither. */
function readingsOf(q: Quantity): { low: Reading; high: Reading } | null {
  if (q.kind === 'exact') return null;
  if (q.kind === 'measured') return { low: q.reading, high: q.reading };
  return { low: q.low, high: q.high };
}

function build(value: number, low: Reading, high: Reading): Quantity {
  if (low.sigFigs === high.sigFigs && low.lastPlace === high.lastPlace) {
    return { kind: 'measured', value, reading: low };
  }
  return { kind: 'ambiguous', value, low, high };
}

/**
 * Attach precision to the result of a multiplication or division: the fewest
 * significant figures among the measured operands.
 *
 * PRECONDITION: `value` is the arithmetic result, computed at full precision by
 * the caller — this function does not multiply anything, it only says how many
 * digits of the answer are real. Exact operands are ignored, per §5.5. With no
 * measured operand at all the result is exact.
 */
export function multiplyDivide(value: number, operands: readonly Quantity[]): Quantity {
  let lowSf = Infinity;
  let highSf = Infinity;
  for (const q of operands) {
    const r = readingsOf(q);
    if (r === null) continue;
    lowSf = Math.min(lowSf, r.low.sigFigs);
    highSf = Math.min(highSf, r.high.sigFigs);
  }
  if (lowSf === Infinity) return { kind: 'exact', value };
  return build(
    value,
    { sigFigs: lowSf, lastPlace: lastPlaceOf(value, lowSf) },
    { sigFigs: highSf, lastPlace: lastPlaceOf(value, highSf) },
  );
}

/**
 * Attach precision to the result of an addition or subtraction: the coarsest
 * last decimal place among the measured operands.
 *
 * PRECONDITION: as {@link multiplyDivide} — `value` is already computed.
 */
export function addSubtract(value: number, operands: readonly Quantity[]): Quantity {
  let lowPlace = -Infinity;
  let highPlace = -Infinity;
  for (const q of operands) {
    const r = readingsOf(q);
    if (r === null) continue;
    lowPlace = Math.max(lowPlace, r.low.lastPlace);
    highPlace = Math.max(highPlace, r.high.lastPlace);
  }
  if (lowPlace === -Infinity) return { kind: 'exact', value };
  return build(
    value,
    { sigFigs: sigFigsFrom(value, lowPlace), lastPlace: lowPlace },
    { sigFigs: sigFigsFrom(value, highPlace), lastPlace: highPlace },
  );
}

/**
 * Round to a significant figure count.
 *
 * PRECONDITION: `sigFigs` is an integer in 1..21, the range `toPrecision`
 * accepts.
 *
 * Uses the decimal round-trip rather than `Math.round(v * 10**k) / 10**k`,
 * which introduces a second rounding of its own when the scale factor is not
 * exactly representable — at six figures and above the two disagree.
 *
 * WHAT IT DOES NOT FIX, stated so nobody later believes it does: a decimal
 * written as 1.005 is STORED slightly below 1.005, so it rounds down to 1.00 at
 * three figures. That is the value the machine holds, not a rounding bug, and
 * no choice of rounding function changes it.
 */
export function roundToSigFigs(value: number, sigFigs: number): number {
  if (value === 0) return 0;
  return Number(value.toPrecision(sigFigs));
}

/**
 * Render a value to a fixed significant figure count, as a student would write
 * it — scientific notation only where a plain decimal cannot carry the digits.
 *
 * PRECONDITION: `sigFigs` is an integer in 1..21.
 */
export function formatSigFigs(value: number, sigFigs: number): string {
  if (value === 0) return sigFigs <= 1 ? '0' : `0.${'0'.repeat(sigFigs - 1)}`;
  // ROUND FIRST, then measure. Rounding can carry into a new decade — 9.96 at
  // two figures is 10 — and taking the magnitude from the value as given
  // produces one digit too many: `10.0`, which reads as three figures. That
  // defect shipped here and was caught by a taxonomy fixture that fed a
  // predicted wrong value back in and got E-UNCLASSIFIED, because the entry
  // written at four figures had silently become five.
  const rounded = Number(value.toPrecision(sigFigs));
  const magnitude = magnitudeOf(rounded);
  if (magnitude >= sigFigs || magnitude < -3) {
    // `toExponential` writes `1.23e+5`; a student writes `1.23e5`. The minus
    // sign stays, because dropping it changes the number.
    return rounded.toExponential(sigFigs - 1).replace('e+', 'e');
  }
  const decimals = sigFigs - 1 - magnitude;
  return rounded.toFixed(Math.max(0, decimals));
}

/**
 * Render a value to a fixed significant figure count in a form that CANNOT be
 * read as ambiguous.
 *
 * PRECONDITION: `sigFigs` is an integer in 1..21.
 *
 * `toPrecision(2)` writes 10 for a value of 10.4, and `10` could be one, two or
 * three significant figures — the exact ambiguity this file exists to refuse to
 * resolve. Written as `10.` it is unmistakably two. The trailing point looks odd
 * until you remember that the alternative is a number nobody can read.
 */
export function formatUnambiguous(value: number, sigFigs: number): string {
  const text = formatSigFigs(value, sigFigs);
  if (text.includes('.') || text.includes('e')) return text;
  return /0$/.test(text) ? `${text}.` : text;
}

/**
 * The significant figure count a quantity should be reported to. Ambiguous
 * quantities have no single answer and return null — the caller must say so
 * rather than pick.
 *
 * PRECONDITION: none.
 */
export function reportableSigFigs(q: Quantity): number | null {
  if (q.kind === 'exact') return null;
  if (q.kind === 'measured') return q.reading.sigFigs;
  return null;
}

/** True where the quantity carries a trailing-zero ambiguity. */
export function isAmbiguous(q: Quantity): boolean {
  return q.kind === 'ambiguous';
}
