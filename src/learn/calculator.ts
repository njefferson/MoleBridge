/**
 * calculator.ts — arithmetic, and DELIBERATELY NOTHING ELSE.
 *
 * ## What this must never be able to do
 *
 * A calculator that understands chemistry deletes the product. `E-MM-ARITH`,
 * `E-MM-PARSE` and `E-MM-HYDRATE` exist because working out a molar mass is a
 * thing a student does and gets wrong in recognisable ways; `E-CONV-FACTOR` and
 * `E-CONV-INVERTED` exist because choosing and applying a factor is. A box that
 * takes `CuSO4·5H2O` and returns 249.68 does not help a student who cannot do
 * that — it removes the step, and with it every diagnosis MoleBridge could have
 * given them about it.
 *
 * So this evaluates numbers and the four operations and nothing else. A letter
 * anywhere in the input is an error, not an identifier, and `calculator.test.ts`
 * feeds it every element symbol and a handful of real formulas to prove it.
 *
 * ## No `eval`, no `Function`
 *
 * Not primarily for safety — the input is the student's own and the CSP forbids
 * both anyway — but because `eval` would accept exactly the things this must
 * refuse. `Math.sqrt`, a variable name, a property access: all of them are valid
 * JavaScript and none of them belongs in a box that is meant to do sums. A
 * hand-written parser refuses by construction rather than by blocklist.
 */

/** What the box says back. */
export type CalcResult =
  | { readonly kind: 'VALUE'; readonly value: number }
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'ERROR'; readonly why: string };

/** Characters this understands. Everything else is an error by construction. */
const DIGIT = /[0-9]/;

interface Reader {
  readonly text: string;
  at: number;
}

const peek = (r: Reader): string => r.text[r.at] ?? '';
const skipSpace = (r: Reader): void => {
  while (peek(r) === ' ') r.at += 1;
};

/**
 * Evaluate a line of arithmetic.
 *
 * Precedence is the ordinary one: brackets, then × and ÷, then + and −. Written
 * as a recursive descent rather than a shunting yard because the whole grammar
 * is four operators and a bracket, and the descent reads like the grammar does.
 */
export function calculate(input: string): CalcResult {
  // × ÷ − come off a phone keyboard and out of the app's own buttons; a student
  // pasting from a lesson gets them too. Normalised rather than refused, since
  // refusing them would be pedantry about a character nobody chose.
  const text = input.replace(/[×xX]/g, '*').replace(/[÷]/g, '/').replace(/[−–—]/g, '-').replace(/,/g, '');
  if (text.trim() === '') return { kind: 'EMPTY' };

  // THE REFUSAL, AND IT IS FIRST. Anything alphabetic is rejected before parsing
  // rather than falling out of it, so the message can say WHY rather than
  // "unexpected character" — and so a formula cannot reach the parser at all.
  // `e` is the one exception, and only between digits: 6.022e23 is a number.
  const withoutExponents = text.replace(/(\d)[eE]([+-]?\d)/g, '$1$2');
  if (/[a-zA-Z]/.test(withoutExponents)) {
    return {
      kind: 'ERROR',
      why: 'This does numbers only — it will not work out a molar mass or convert a unit for you. That is the part you are practising.',
    };
  }

  const reader: Reader = { text, at: 0 };
  let value: number;
  try {
    value = parseSum(reader);
  } catch (error) {
    return { kind: 'ERROR', why: error instanceof Error ? error.message : 'That is not something this can work out.' };
  }
  skipSpace(reader);
  if (reader.at < text.length) {
    return { kind: 'ERROR', why: 'There is something extra on the end that this cannot read.' };
  }
  if (!Number.isFinite(value)) {
    return { kind: 'ERROR', why: 'That comes out as something this cannot show — usually a divide by zero.' };
  }
  return { kind: 'VALUE', value };
}

function parseSum(r: Reader): number {
  let value = parseProduct(r);
  for (;;) {
    skipSpace(r);
    const op = peek(r);
    if (op !== '+' && op !== '-') return value;
    r.at += 1;
    const right = parseProduct(r);
    value = op === '+' ? value + right : value - right;
  }
}

function parseProduct(r: Reader): number {
  let value = parseUnary(r);
  for (;;) {
    skipSpace(r);
    const op = peek(r);
    if (op !== '*' && op !== '/') return value;
    r.at += 1;
    const right = parseUnary(r);
    if (op === '/' && right === 0) throw new Error('That divides by zero, which has no answer.');
    value = op === '*' ? value * right : value / right;
  }
}

function parseUnary(r: Reader): number {
  skipSpace(r);
  if (peek(r) === '-') {
    r.at += 1;
    return -parseUnary(r);
  }
  if (peek(r) === '+') {
    r.at += 1;
    return parseUnary(r);
  }
  return parseAtom(r);
}

function parseAtom(r: Reader): number {
  skipSpace(r);
  if (peek(r) === '(') {
    r.at += 1;
    const value = parseSum(r);
    skipSpace(r);
    if (peek(r) !== ')') throw new Error('A bracket was opened and not closed.');
    r.at += 1;
    return value;
  }

  const start = r.at;
  while (DIGIT.test(peek(r))) r.at += 1;
  if (peek(r) === '.') {
    r.at += 1;
    while (DIGIT.test(peek(r))) r.at += 1;
  }
  if ((peek(r) === 'e' || peek(r) === 'E') && r.at > start) {
    const mark = r.at;
    r.at += 1;
    if (peek(r) === '+' || peek(r) === '-') r.at += 1;
    if (DIGIT.test(peek(r))) while (DIGIT.test(peek(r))) r.at += 1;
    else r.at = mark;
  }
  if (r.at === start) throw new Error('There is a number missing here.');
  const value = Number(r.text.slice(start, r.at));
  if (Number.isNaN(value)) throw new Error('That is not a number this can read.');
  return value;
}

/**
 * How many figures to show.
 *
 * NOT ROUNDED TO THE PROBLEM'S PRECISION, on purpose. Rounding here would do the
 * significant-figures decision for the student, which is a graded step and its
 * own error class — `E-SIG-FIGS` and `E-ROUND-EARLY` both live at exactly this
 * boundary. The calculator shows plenty of figures and says nothing about how
 * many belong in the answer.
 */
export const CALC_DISPLAY_FIGURES = 10;

/** The value as the box shows it. */
export function formatCalc(value: number): string {
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e12 || magnitude < 1e-4) return value.toExponential(6);
  const text = value.toPrecision(CALC_DISPLAY_FIGURES);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}
