/**
 * formula.ts — chemical formula parser.
 *
 * Turns `Ca(NO3)2` into "one calcium, two nitrogen, six oxygen" and
 * `CuSO4*5H2O` into the pentahydrate WITH its water, keeping the waters
 * separable because omitting them is its own error class (E-MM-HYDRATE) and
 * the classifier has to be able to predict the wrong number a student who
 * dropped them would produce.
 *
 * WHAT IT ACCEPTS
 *   NaCl                simple
 *   H2O                 subscripts
 *   Ca(NO3)2            groups, nested to any depth
 *   (NH4)3PO4           a group first
 *   [Cu(NH3)4]SO4       square brackets, as coordination compounds are written
 *   CuSO4*5H2O          hydrate, ASCII star
 *   CuSO4·5H2O         hydrate, middle dot U+00B7
 *   SO4^2-  Fe^3+       charged species
 *   2 H2O               a leading coefficient, only where the caller asks for one
 *
 * WHAT IT REFUSES, AND WHY IT REFUSES RATHER THAN GUESSING
 *   A charge must be introduced by `^`. `Fe3+` is written by chemists meaning
 *   a 3+ cation, and it is also exactly what "three iron atoms, then a plus"
 *   looks like to a parser. There is no reading of that string that is right
 *   more often than it is wrong, so this parser will not pick one: it names the
 *   offset and says a caret is needed. A parser that guesses here produces a
 *   plausible wrong molar mass, and a plausible wrong molar mass is the failure
 *   this whole repository is built to prevent.
 *
 * PURE. No I/O, no globals, no clock.
 */

import { elementBySymbol } from './elements.ts';

/** Largest subscript or coefficient accepted. Beyond this the input is a typo. */
export const MAX_SUBSCRIPT = 9999;

/** The hydrate separators this parser understands. */
export const HYDRATE_SEPARATORS: readonly string[] = ['*', '·'];

/** Every way a formula can be rejected. Each names a character offset. */
export type FormulaErrorCode =
  | 'EMPTY'
  | 'UNEXPECTED_CHAR'
  | 'UNICODE_SUBSCRIPT'
  | 'UNKNOWN_ELEMENT'
  | 'UNCLOSED_GROUP'
  | 'UNOPENED_GROUP'
  | 'MISMATCHED_BRACKET'
  | 'EMPTY_GROUP'
  | 'ZERO_SUBSCRIPT'
  | 'LEADING_ZERO'
  | 'SUBSCRIPT_TOO_LARGE'
  | 'SUBSCRIPT_WITHOUT_ATOM'
  | 'COEFFICIENT_NOT_ALLOWED'
  | 'CHARGE_NEEDS_CARET'
  | 'BAD_CHARGE'
  | 'TRAILING_CONTENT'
  | 'DANGLING_HYDRATE_SEPARATOR'
  | 'EMPTY_HYDRATE_SEGMENT';

/** A rejection, carrying the offset into the ORIGINAL input string. */
export class FormulaError extends Error {
  readonly code: FormulaErrorCode;
  /** Zero-based index into the input string where the trouble is. */
  readonly offset: number;
  /** The input as given, unmodified. */
  readonly input: string;

  constructor(code: FormulaErrorCode, offset: number, input: string, detail: string) {
    super(`${code} at offset ${offset}: ${detail}`);
    this.name = 'FormulaError';
    this.code = code;
    this.offset = offset;
    this.input = input;
  }
}

/** One dot-separated part of a formula: the body, and the water in a hydrate. */
export interface FormulaSegment {
  /** The `5` of `*5H2O`. 1 where none was written. */
  readonly multiplier: number;
  /** Atom counts for ONE unit of this segment, before the multiplier. */
  readonly counts: ReadonlyMap<string, number>;
  /** The exact substring this segment was parsed from, multiplier included. */
  readonly text: string;
}

/** A parsed formula. */
export interface ParsedFormula {
  /** The input, unmodified. */
  readonly source: string;
  /** Leading equation coefficient. 1 where none was written. */
  readonly coefficient: number;
  /**
   * Total atom counts for ONE formula unit — every segment, each multiplied,
   * summed. Does NOT include `coefficient`.
   */
  readonly counts: ReadonlyMap<string, number>;
  /** Counts of the first segment alone: the anhydrous compound. */
  readonly anhydrousCounts: ReadonlyMap<string, number>;
  /** How many H2O the hydrate segments contribute. 0 where there is no hydrate. */
  readonly hydrateWaters: number;
  /** Every dot-separated segment, in written order. */
  readonly segments: readonly FormulaSegment[];
  /** Net charge. 0 for a neutral species, -2 for `SO4^2-`, +3 for `Fe^3+`. */
  readonly charge: number;
}

/** Options for {@link parseFormula}. */
export interface ParseOptions {
  /**
   * Allow a leading integer coefficient, as an equation side has. Off by
   * default: a bare `2H2O` typed into a molar-mass box is a mistake, not a
   * coefficient, and silently accepting it doubles the answer.
   */
  readonly allowCoefficient?: boolean;
}

const UNICODE_SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isUpper = (c: string): boolean => c >= 'A' && c <= 'Z';
const isLower = (c: string): boolean => c >= 'a' && c <= 'z';

function addCounts(
  into: Map<string, number>,
  from: ReadonlyMap<string, number>,
  factor: number,
): void {
  for (const [symbol, n] of from) into.set(symbol, (into.get(symbol) ?? 0) + n * factor);
}

/**
 * Parse a chemical formula.
 *
 * PRECONDITION: `input` is a single species — one side of an equation split on
 * `+` has already happened, and there is no `->` in it. Surrounding whitespace
 * is tolerated; whitespace inside a segment is not.
 *
 * THROWS {@link FormulaError} on anything it cannot read, naming the offset.
 */
export function parseFormula(input: string, options: ParseOptions = {}): ParsedFormula {
  const allowCoefficient = options.allowCoefficient ?? false;
  const n = input.length;

  let i = 0;
  const fail = (code: FormulaErrorCode, offset: number, detail: string): never => {
    throw new FormulaError(code, offset, input, detail);
  };

  const skipSpace = (): void => {
    while (i < n && (input[i] === ' ' || input[i] === '\t')) i += 1;
  };

  skipSpace();
  if (i >= n) fail('EMPTY', 0, 'there is nothing to parse');

  /** Read a run of digits as a positive integer, rejecting 0 and leading zeros. */
  const readNumber = (what: 'subscript' | 'coefficient'): number => {
    const start = i;
    while (i < n && isDigit(input[i] as string)) i += 1;
    const text = input.slice(start, i);
    if (text.length > 1 && text[0] === '0') {
      fail('LEADING_ZERO', start, `"${text}" has a leading zero`);
    }
    const value = Number(text);
    if (value === 0) fail('ZERO_SUBSCRIPT', start, `a ${what} of zero means the species is not there`);
    if (value > MAX_SUBSCRIPT) {
      fail('SUBSCRIPT_TOO_LARGE', start, `${value} is past the ${MAX_SUBSCRIPT} limit`);
    }
    return value;
  };

  /* ---- leading coefficient ---- */
  let coefficient = 1;
  if (isDigit(input[i] as string)) {
    const at = i;
    const value = readNumber('coefficient');
    if (!allowCoefficient) {
      fail('COEFFICIENT_NOT_ALLOWED', at, 'a leading number is a coefficient, and this reading does not take one');
    }
    coefficient = value;
    skipSpace();
    if (i >= n) fail('EMPTY', at, 'a coefficient with no formula after it');
  }

  /**
   * Parse a run of units until `stop` (a closing bracket) or the end of the
   * segment. Returns the counts for one unit of that run.
   */
  const parseUnits = (closer: ')' | ']' | null, openedAt: number): Map<string, number> => {
    const counts = new Map<string, number>();
    let sawAnything = false;

    for (;;) {
      if (i >= n) {
        if (closer !== null) {
          fail('UNCLOSED_GROUP', openedAt, `the group opened here is never closed`);
        }
        break;
      }
      const c = input[i] as string;

      if (c === closer) break;
      if (c === ')' || c === ']') {
        if (closer === null) fail('UNOPENED_GROUP', i, `"${c}" closes a group that was never opened`);
        fail('MISMATCHED_BRACKET', i, `"${c}" does not match the bracket this group was opened with`);
      }
      if (c === '^' || HYDRATE_SEPARATORS.includes(c)) break;
      // At the top level a bare sign or a space ends the run, so the caller
      // can say CHARGE_NEEDS_CARET or TRAILING_CONTENT rather than the useless
      // "that character means nothing". Inside a group neither is allowed:
      // breaking there would let the space be consumed as if it closed the
      // bracket, and `Ca(NO3 )2` would parse.
      if (closer === null && (c === '+' || c === '-' || c === ' ' || c === '\t')) break;

      if (c === '(' || c === '[') {
        const open = i;
        i += 1;
        const inner = parseUnits(c === '(' ? ')' : ']', open);
        if (i >= n) fail('UNCLOSED_GROUP', open, `"${c}" is never closed`);
        i += 1; // consume the closer
        if (inner.size === 0) fail('EMPTY_GROUP', open, 'a group with nothing in it');
        let mult = 1;
        if (i < n && isDigit(input[i] as string)) mult = readNumber('subscript');
        addCounts(counts, inner, mult);
        sawAnything = true;
        continue;
      }

      if (isUpper(c)) {
        const start = i;
        i += 1;
        while (i < n && isLower(input[i] as string)) i += 1;
        let symbol = input.slice(start, i);
        // `NaCl` is sodium chloride and there is no element `Nacl`, so the
        // greedy read has to be able to back off one lowercase letter — but
        // only one, and only when the shorter symbol is real.
        if (elementBySymbol(symbol) === undefined && symbol.length > 1) {
          const shorter = symbol.slice(0, symbol.length - 1);
          if (elementBySymbol(shorter) !== undefined) {
            i -= 1;
            symbol = shorter;
          }
        }
        if (elementBySymbol(symbol) === undefined) {
          fail('UNKNOWN_ELEMENT', start, `"${symbol}" is not an element symbol`);
        }
        let count = 1;
        if (i < n && isDigit(input[i] as string)) count = readNumber('subscript');
        counts.set(symbol, (counts.get(symbol) ?? 0) + count);
        sawAnything = true;
        continue;
      }

      if (isDigit(c)) {
        fail('SUBSCRIPT_WITHOUT_ATOM', i, `"${c}" is a subscript with no atom or group in front of it`);
      }
      if (UNICODE_SUBSCRIPTS.includes(c)) {
        fail('UNICODE_SUBSCRIPT', i, `"${c}" is a typographic subscript; type an ordinary digit`);
      }
      if (isLower(c)) {
        fail('UNEXPECTED_CHAR', i, `"${c}" starts nothing — element symbols begin with a capital`);
      }
      if (c === ' ' || c === '\t') {
        fail('UNEXPECTED_CHAR', i, 'a formula has no spaces inside it');
      }
      fail('UNEXPECTED_CHAR', i, `"${c}" has no meaning in a formula`);
    }

    // Point at the bracket that OPENED the group, not at the one that closed
    // it — the reader has to find the pair, and the opener is where the fix is.
    if (!sawAnything && closer !== null) fail('EMPTY_GROUP', openedAt, 'a group with nothing in it');
    return counts;
  };

  /* ---- segments, separated by hydrate dots ---- */
  const segments: FormulaSegment[] = [];
  for (;;) {
    skipSpace();
    const segStart = i;
    let multiplier = 1;
    if (segments.length > 0 && i < n && isDigit(input[i] as string)) {
      multiplier = readNumber('coefficient');
    }
    const counts = parseUnits(null, segStart);
    if (counts.size === 0) {
      fail(
        segments.length === 0 ? 'EMPTY' : 'EMPTY_HYDRATE_SEGMENT',
        segStart,
        'no atoms in this part of the formula',
      );
    }
    segments.push({ multiplier, counts, text: input.slice(segStart, i) });

    skipSpace();
    if (i < n && HYDRATE_SEPARATORS.includes(input[i] as string)) {
      const sep = i;
      i += 1;
      skipSpace();
      if (i >= n) fail('DANGLING_HYDRATE_SEPARATOR', sep, 'a hydrate dot with nothing after it');
      continue;
    }
    break;
  }

  /* ---- charge ---- */
  let charge = 0;
  if (i < n && input[i] === '^') {
    const at = i;
    i += 1;
    let magnitude: number | null = null;
    let sign = 0;
    if (i < n && isDigit(input[i] as string)) magnitude = readNumber('subscript');
    if (i < n && (input[i] === '+' || input[i] === '-')) {
      sign = input[i] === '+' ? 1 : -1;
      i += 1;
      if (magnitude === null && i < n && isDigit(input[i] as string)) magnitude = readNumber('subscript');
    }
    if (sign === 0) fail('BAD_CHARGE', at, 'a charge needs a + or a - after the ^');
    charge = sign * (magnitude ?? 1);
  }

  skipSpace();
  if (i < n) {
    const c = input[i] as string;
    if (c === '+' || c === '-') {
      fail('CHARGE_NEEDS_CARET', i, `write the charge as ^${c === '+' ? 'n+' : 'n-'} — a bare ${c} cannot be told from a subscript`);
    }
    fail(
      'TRAILING_CONTENT',
      i,
      `"${input.slice(i)}" is left over after the formula — a formula has no spaces inside it`,
    );
  }

  const total = new Map<string, number>();
  for (const seg of segments) addCounts(total, seg.counts, seg.multiplier);

  let hydrateWaters = 0;
  for (const seg of segments.slice(1)) {
    if (seg.counts.size === 2 && seg.counts.get('H') === 2 && seg.counts.get('O') === 1) {
      hydrateWaters += seg.multiplier;
    }
  }

  const first = segments[0] as FormulaSegment;
  const anhydrous = new Map<string, number>();
  addCounts(anhydrous, first.counts, first.multiplier);

  return {
    source: input,
    coefficient,
    counts: total,
    anhydrousCounts: anhydrous,
    hydrateWaters,
    segments,
    charge,
  };
}

/** A parse that succeeded. */
export interface ParseOk {
  readonly ok: true;
  readonly value: ParsedFormula;
}

/** A parse that failed, with the error it failed on. */
export interface ParseFail {
  readonly ok: false;
  readonly error: FormulaError;
}

/**
 * The non-throwing form of {@link parseFormula}, for callers validating input
 * rather than trusting it.
 *
 * PRECONDITION: as {@link parseFormula}.
 */
export function tryParseFormula(input: string, options: ParseOptions = {}): ParseOk | ParseFail {
  try {
    return { ok: true, value: parseFormula(input, options) };
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error };
    throw error;
  }
}

/**
 * Render atom counts back to a canonical string, symbols in the order given.
 * Used by tests and by the CLI; never shown to a student mid-problem.
 *
 * PRECONDITION: every count is a positive integer.
 */
export function formatCounts(counts: ReadonlyMap<string, number>): string {
  let out = '';
  for (const [symbol, count] of counts) out += count === 1 ? symbol : `${symbol}${count}`;
  return out;
}
