/**
 * balance.ts — equation balancing, by exact nullspace.
 *
 * ================================================================
 *  SOLVING IS VALIDATION ONLY. `solveBalance` MUST NOT BE REACHABLE
 *  FROM ANY STUDENT-FACING SURFACE, in this session or a later one.
 * ================================================================
 *
 * The product's whole claim is that it attributes a wrong number to a
 * conceptual failure; it is not a solver, and a solver one import away from the
 * student screen is a solver. Two exports, deliberately named apart:
 *
 *   checkBalance   does THIS coefficient set conserve atoms and charge, and is
 *                  it the lowest such set? Safe: it grades an answer the
 *                  student has already committed to, which is what stage S1 is.
 *   solveBalance   what IS the answer? Used by the problem generator to prove a
 *                  generated reaction has exactly one balance, and by the tests.
 *                  Never by a screen.
 *
 * HOW IT SOLVES. Build the element-conservation matrix — one row per element,
 * one column per species, reactants positive and products negative, plus a
 * charge row where any species is charged. Reduce to row echelon form over the
 * RATIONALS using BigInt fractions, so a reaction needing a coefficient of 47
 * is exact rather than nearly right. The nullspace dimension then answers the
 * question outright: 0 means no balance exists, more than 1 means the equation
 * is underdetermined and the "answer" would be a choice rather than a fact, and
 * exactly 1 gives the single ray whose smallest positive integer point is the
 * balanced equation.
 *
 * FLOATING POINT IS NOT USED ANYWHERE IN THE SOLVE. Gaussian elimination in
 * doubles produces pivots that are 1e-16 instead of 0, and the difference
 * between "the nullspace is one-dimensional" and "it is two-dimensional" is
 * exactly that comparison.
 *
 * PURE. No I/O, no globals, no clock.
 */

import { parseFormula, type ParsedFormula, FormulaError } from './formula.ts';

/* ------------------------------------------------------------------ */
/* Exact rationals over BigInt                                         */
/* ------------------------------------------------------------------ */

interface Frac {
  readonly n: bigint;
  /** Always positive; the sign lives in `n`. */
  readonly d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function frac(n: bigint, d: bigint = 1n): Frac {
  if (d === 0n) throw new RangeError('a fraction with denominator zero');
  let nn = n;
  let dd = d;
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  if (nn === 0n) return { n: 0n, d: 1n };
  const g = gcd(nn, dd);
  return { n: nn / g, d: dd / g };
}

const fAdd = (a: Frac, b: Frac): Frac => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const fSub = (a: Frac, b: Frac): Frac => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const fMul = (a: Frac, b: Frac): Frac => frac(a.n * b.n, a.d * b.d);
const fDiv = (a: Frac, b: Frac): Frac => frac(a.n * b.d, a.d * b.n);
const isZero = (a: Frac): boolean => a.n === 0n;

/* ------------------------------------------------------------------ */
/* Equations                                                           */
/* ------------------------------------------------------------------ */

/** A parsed equation: species on each side, coefficients as written. */
export interface ParsedEquation {
  readonly source: string;
  readonly reactants: readonly ParsedFormula[];
  readonly products: readonly ParsedFormula[];
  /** Every species, reactants then products, in written order. */
  readonly species: readonly ParsedFormula[];
  /** Index in `species` at which the products start. */
  readonly firstProduct: number;
}

/** Why an equation could not be read. */
export type EquationErrorCode =
  | 'NO_ARROW'
  | 'MULTIPLE_ARROWS'
  | 'EMPTY_SIDE'
  | 'EMPTY_SPECIES'
  | 'BAD_FORMULA';

/** A rejection from {@link parseEquation}, with an offset into the input. */
export class EquationError extends Error {
  readonly code: EquationErrorCode;
  readonly offset: number;
  readonly input: string;
  /** The parser's own error, where a single species failed to read. */
  override readonly cause?: FormulaError;

  constructor(code: EquationErrorCode, offset: number, input: string, detail: string, cause?: FormulaError) {
    super(`${code} at offset ${offset}: ${detail}`);
    this.name = 'EquationError';
    this.code = code;
    this.offset = offset;
    this.input = input;
    if (cause !== undefined) this.cause = cause;
  }
}

/** The arrows an equation may be written with, longest first. */
const ARROWS: readonly string[] = ['<=>', '-->', '<->', '->', '=>', '→', '⟶', '⇌', '='];

/**
 * Split one side of an equation on the `+` signs that separate species,
 * ignoring the `+` of a charge, which the formula parser requires be
 * introduced by `^`. Returns [text, offsetInSide] pairs.
 */
function splitSide(side: string): Array<{ text: string; at: number }> {
  const parts: Array<{ text: string; at: number }> = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < side.length; i += 1) {
    const c = side[i] as string;
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === '^') {
      // Consume the whole charge token so its sign is never a separator.
      i += 1;
      while (i < side.length && /[0-9+-]/.test(side[i] as string)) i += 1;
      i -= 1;
    } else if (c === '+' && depth === 0) {
      parts.push({ text: side.slice(start, i), at: start });
      start = i + 1;
    }
  }
  parts.push({ text: side.slice(start), at: start });
  return parts;
}

/**
 * Parse a full chemical equation.
 *
 * PRECONDITION: `text` contains exactly one arrow from {@link ARROWS}. Leading
 * coefficients are allowed and preserved as written — this function does not
 * balance anything, and a coefficient of 1 is indistinguishable from none.
 *
 * THROWS {@link EquationError}, whose `cause` carries the formula parser's own
 * offset when one species is the problem.
 */
export function parseEquation(text: string): ParsedEquation {
  let arrowAt = -1;
  let arrowLength = 0;
  for (const arrow of ARROWS) {
    const at = text.indexOf(arrow);
    if (at === -1) continue;
    if (text.indexOf(arrow, at + arrow.length) !== -1) {
      throw new EquationError('MULTIPLE_ARROWS', at, text, `"${arrow}" appears more than once`);
    }
    if (arrowAt === -1 || at < arrowAt) {
      arrowAt = at;
      arrowLength = arrow.length;
    }
  }
  if (arrowAt === -1) {
    throw new EquationError('NO_ARROW', 0, text, 'an equation needs an arrow between the two sides');
  }

  const sides = [
    { text: text.slice(0, arrowAt), at: 0, name: 'left' },
    { text: text.slice(arrowAt + arrowLength), at: arrowAt + arrowLength, name: 'right' },
  ];

  const parsedSides: ParsedFormula[][] = [];
  for (const side of sides) {
    if (side.text.trim().length === 0) {
      throw new EquationError('EMPTY_SIDE', side.at, text, `the ${side.name} side is empty`);
    }
    const out: ParsedFormula[] = [];
    for (const part of splitSide(side.text)) {
      const absolute = side.at + part.at;
      if (part.text.trim().length === 0) {
        throw new EquationError('EMPTY_SPECIES', absolute, text, 'a + with no species beside it');
      }
      try {
        out.push(parseFormula(part.text, { allowCoefficient: true }));
      } catch (error) {
        if (error instanceof FormulaError) {
          throw new EquationError(
            'BAD_FORMULA',
            absolute + error.offset,
            text,
            error.message,
            error,
          );
        }
        throw error;
      }
    }
    parsedSides.push(out);
  }

  const reactants = parsedSides[0] as ParsedFormula[];
  const products = parsedSides[1] as ParsedFormula[];
  return {
    source: text,
    reactants,
    products,
    species: [...reactants, ...products],
    firstProduct: reactants.length,
  };
}

/* ------------------------------------------------------------------ */
/* The conservation matrix                                             */
/* ------------------------------------------------------------------ */

/** Every element in the equation, in first-appearance order. */
function elementsOf(equation: ParsedEquation): string[] {
  const seen: string[] = [];
  for (const species of equation.species) {
    for (const symbol of species.counts.keys()) {
      if (!seen.includes(symbol)) seen.push(symbol);
    }
  }
  return seen;
}

/**
 * Rows are conservation laws — one per element, plus charge where any species
 * carries one. Reactants count positive, products negative, so a nullspace
 * vector IS a coefficient set.
 */
function conservationMatrix(equation: ParsedEquation): Frac[][] {
  const elements = elementsOf(equation);
  const anyCharge = equation.species.some((s) => s.charge !== 0);
  const rows: Frac[][] = [];

  for (const symbol of elements) {
    rows.push(
      equation.species.map((species, index) => {
        const count = species.counts.get(symbol) ?? 0;
        return frac(BigInt(index < equation.firstProduct ? count : -count));
      }),
    );
  }
  if (anyCharge) {
    rows.push(
      equation.species.map((species, index) =>
        frac(BigInt(index < equation.firstProduct ? species.charge : -species.charge)),
      ),
    );
  }
  return rows;
}

/** Reduce to reduced row echelon form in place; return the pivot column list. */
function rref(matrix: Frac[][], columns: number): number[] {
  const pivots: number[] = [];
  let row = 0;
  for (let col = 0; col < columns && row < matrix.length; col += 1) {
    let pivotRow = -1;
    for (let r = row; r < matrix.length; r += 1) {
      if (!isZero((matrix[r] as Frac[])[col] as Frac)) {
        pivotRow = r;
        break;
      }
    }
    if (pivotRow === -1) continue;

    const tmp = matrix[row] as Frac[];
    matrix[row] = matrix[pivotRow] as Frac[];
    matrix[pivotRow] = tmp;

    const pivot = (matrix[row] as Frac[])[col] as Frac;
    const current = matrix[row] as Frac[];
    for (let c = col; c < columns; c += 1) current[c] = fDiv(current[c] as Frac, pivot);

    for (let r = 0; r < matrix.length; r += 1) {
      if (r === row) continue;
      const factor = (matrix[r] as Frac[])[col] as Frac;
      if (isZero(factor)) continue;
      const target = matrix[r] as Frac[];
      for (let c = col; c < columns; c += 1) {
        target[c] = fSub(target[c] as Frac, fMul(factor, current[c] as Frac));
      }
    }
    pivots.push(col);
    row += 1;
  }
  return pivots;
}

/* ------------------------------------------------------------------ */
/* Solving                                                             */
/* ------------------------------------------------------------------ */

/** Why an equation has no single balance. */
export type BalanceErrorCode =
  | 'NO_SOLUTION'
  | 'UNDERDETERMINED'
  | 'NEGATIVE_COEFFICIENT'
  | 'ZERO_COEFFICIENT'
  | 'TOO_LARGE';

/** A balance that was found. */
export interface BalanceOk {
  readonly ok: true;
  /** One coefficient per species, reactants then products, lowest integer set. */
  readonly coefficients: readonly number[];
  readonly equation: ParsedEquation;
}

/** A balance that does not exist, or is not unique. */
export interface BalanceFail {
  readonly ok: false;
  readonly code: BalanceErrorCode;
  readonly equation: ParsedEquation;
  /** Dimension of the nullspace: 0 means over-constrained, >1 underdetermined. */
  readonly nullity: number;
  readonly detail: string;
}

/** The result of {@link solveBalance}. */
export type BalanceResult = BalanceOk | BalanceFail;

/**
 * Largest coefficient this will report. A balance needing more than this is a
 * generator bug or a nonsense equation, not a chemistry problem for a class.
 */
export const MAX_COEFFICIENT = 1_000_000;

/**
 * Find the one balanced coefficient set for an equation.
 *
 * VALIDATION ONLY — see the file header. Do not import this into a screen.
 *
 * PRECONDITION: `equation` came from {@link parseEquation}. Any coefficients
 * already written in the equation are IGNORED; this solves the skeleton.
 */
export function solveBalance(equation: ParsedEquation): BalanceResult {
  const columns = equation.species.length;
  if (columns === 0) {
    return { ok: false, code: 'NO_SOLUTION', equation, nullity: 0, detail: 'no species' };
  }

  const matrix = conservationMatrix(equation);
  const pivots = rref(matrix, columns);
  const free: number[] = [];
  for (let c = 0; c < columns; c += 1) if (!pivots.includes(c)) free.push(c);
  const nullity = free.length;

  if (nullity === 0) {
    return {
      ok: false,
      code: 'NO_SOLUTION',
      equation,
      nullity,
      detail: 'the only coefficient set that conserves every element is all zeros',
    };
  }
  if (nullity > 1) {
    return {
      ok: false,
      code: 'UNDERDETERMINED',
      equation,
      nullity,
      detail: `${nullity} independent balances exist, so no single answer is the answer`,
    };
  }

  // One free column: set it to 1, read the pivots off the reduced rows.
  const freeCol = free[0] as number;
  const solution: Frac[] = new Array<Frac>(columns).fill(frac(0n));
  solution[freeCol] = frac(1n);
  for (let r = 0; r < pivots.length; r += 1) {
    const col = pivots[r] as number;
    // Row r reads: x[col] + coeff * x[freeCol] = 0
    const coeff = (matrix[r] as Frac[])[freeCol] as Frac;
    solution[col] = fSub(frac(0n), coeff);
  }

  // Scale to the smallest positive integer set.
  let lcm = 1n;
  for (const f of solution) lcm = (lcm / gcd(lcm, f.d)) * f.d;
  const scaled = solution.map((f) => (f.n * lcm) / f.d);

  let divisor = 0n;
  for (const v of scaled) divisor = gcd(divisor, v);
  if (divisor === 0n) {
    return { ok: false, code: 'ZERO_COEFFICIENT', equation, nullity, detail: 'every coefficient is zero' };
  }
  let reduced = scaled.map((v) => v / divisor);
  if ((reduced[0] as bigint) < 0n) reduced = reduced.map((v) => -v);

  for (const v of reduced) {
    if (v === 0n) {
      return {
        ok: false,
        code: 'ZERO_COEFFICIENT',
        equation,
        nullity,
        detail: 'a species would need a coefficient of zero, so it is not in this reaction',
      };
    }
    if (v < 0n) {
      return {
        ok: false,
        code: 'NEGATIVE_COEFFICIENT',
        equation,
        nullity,
        detail: 'balancing would need a negative coefficient, which is not a reaction',
      };
    }
    if (v > BigInt(MAX_COEFFICIENT)) {
      return {
        ok: false,
        code: 'TOO_LARGE',
        equation,
        nullity,
        detail: `a coefficient past ${MAX_COEFFICIENT} is not a classroom equation`,
      };
    }
  }

  return { ok: true, coefficients: reduced.map(Number), equation };
}

/* ------------------------------------------------------------------ */
/* Checking a student's own coefficients                               */
/* ------------------------------------------------------------------ */

/** What a coefficient set does and does not get right. */
export interface BalanceCheck {
  /** Every element (and charge) is conserved. */
  readonly conserves: boolean;
  /** Conserves AND has no common factor above 1. */
  readonly isLowest: boolean;
  /** The common factor, where the set conserves but is a multiple. 1 otherwise. */
  readonly commonFactor: number;
  /** Element symbols that do not balance, in first-appearance order. */
  readonly unbalancedElements: readonly string[];
  /** True where charge is written but not conserved. */
  readonly chargeUnbalanced: boolean;
}

/**
 * Grade a coefficient set the student typed.
 *
 * SAFE FOR A STUDENT SURFACE. This grades an answer already committed to; it
 * cannot be run backwards to produce one.
 *
 * PRECONDITION: `coefficients` has one entry per species in
 * `equation.species`, each a positive integer. A zero or negative entry is
 * reported as non-conserving rather than throwing, because that is what a
 * student typing into six boxes will eventually produce.
 */
export function checkBalance(
  equation: ParsedEquation,
  coefficients: readonly number[],
): BalanceCheck {
  const unbalanced: string[] = [];
  for (const symbol of elementsOf(equation)) {
    let left = 0;
    let right = 0;
    equation.species.forEach((species, index) => {
      const contribution = (species.counts.get(symbol) ?? 0) * (coefficients[index] ?? 0);
      if (index < equation.firstProduct) left += contribution;
      else right += contribution;
    });
    if (left !== right) unbalanced.push(symbol);
  }

  let chargeLeft = 0;
  let chargeRight = 0;
  equation.species.forEach((species, index) => {
    const contribution = species.charge * (coefficients[index] ?? 0);
    if (index < equation.firstProduct) chargeLeft += contribution;
    else chargeRight += contribution;
  });

  const chargeUnbalanced = chargeLeft !== chargeRight;
  const positive = coefficients.every((c) => Number.isInteger(c) && c > 0);
  const conserves = positive && unbalanced.length === 0 && !chargeUnbalanced;

  let commonFactor = 0;
  for (const c of coefficients) commonFactor = Number(gcd(BigInt(Math.abs(c)), BigInt(commonFactor)));
  if (commonFactor === 0) commonFactor = 1;

  return {
    conserves,
    isLowest: conserves && commonFactor === 1,
    commonFactor: conserves ? commonFactor : 1,
    unbalancedElements: unbalanced,
    chargeUnbalanced,
  };
}

/**
 * Parse and solve in one step.
 *
 * VALIDATION ONLY — see the file header.
 *
 * PRECONDITION: as {@link parseEquation}.
 */
export function balanceEquation(text: string): BalanceResult {
  return solveBalance(parseEquation(text));
}
