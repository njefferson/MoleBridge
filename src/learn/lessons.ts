/**
 * lessons.ts — the seven links in the chain, in the order they depend on each
 * other.
 *
 * ## Why seven and not one tutorial
 *
 * The app's six gated stages assume formulas, molar mass, the mole, balancing,
 * the mole ratio, limiting reagent and percent yield are ALL already understood.
 * A student who has none of them cannot be taught by being shown the whole
 * thing at once — each link has to be taught and drilled on its own before a
 * whole problem means anything.
 *
 * ## Nothing is locked
 *
 * Any lesson opens at any time, from a first run. A student who already knows
 * molar mass and is made to sit through it is the one you lose; a student who
 * jumps to the end and cannot do it has learned something true about themselves
 * for free. It is also what makes the progress code a bookmark rather than a
 * credential — see `progress.ts`.
 *
 * ## EVERY NUMBER HERE IS COMPUTED, NOT TYPED
 *
 * A worked example with a hand-typed molar mass is a worked example that can
 * disagree with what the app grades — silently, forever, and in the one place a
 * student is being told how it works. So the content calls `molarMass()` and
 * the same significant-figure code the grader uses. If the element data is ever
 * corrected, these move with it.
 *
 * `lessons.test.ts` asserts that every drill's own stated answer passes its own
 * checker, which catches the other half: prose that drifted from its numbers.
 */

import { molarMass } from '../chem/molarmass.ts';
import { parseFormula } from '../chem/formula.ts';
import { elementBySymbol } from '../chem/elements.ts';
import { formatSigFigs, parseQuantity } from '../chem/sigfig.ts';
import { DISTINGUISHABLE_RELATIVE } from '../engine/tolerance.ts';
import { AVOGADRO, STP_MOLAR_VOLUME_L } from '../chem/constants.ts';
import type { ErrorClass } from '../engine/taxonomy.ts';

/** One thing a student types, and what counts as right. */
export interface Drill {
  readonly ask: string;
  /** The answer, as the lesson would write it. Also what the test checks. */
  readonly answer: string;
  /** Why that is the answer. Shown after an attempt, never before. */
  readonly because: string;
  /**
   * Numeric drills accept anything within a hair of the value; word drills
   * compare case-insensitively with whitespace collapsed. Which one applies is
   * decided by whether `answer` parses as a number, so a drill cannot declare
   * one kind and behave as the other.
   */
  readonly unit?: string;
}

export interface LessonBlock {
  readonly heading?: string;
  /** Paragraphs. Short on purpose — this is read on a phone between classes. */
  readonly paragraphs: readonly string[];
  /** An optional worked line, shown as a step somebody could copy. */
  readonly worked?: readonly string[];
}

export interface Lesson {
  readonly id: string;
  readonly title: string;
  /** One line, on the menu, saying what you will be able to do afterwards. */
  readonly promise: string;
  readonly blocks: readonly LessonBlock[];
  readonly drills: readonly Drill[];
  /** The error classes this lesson is the answer to. Links the two directions. */
  readonly answers: readonly ErrorClass[];
}

/* ------------------------------------------------------------------ */
/* Numbers, computed from the same code that grades                    */
/* ------------------------------------------------------------------ */

const mm = (formula: string): string => {
  const mass = molarMass(formula);
  return formatSigFigs(mass.value, mass.sigFigs);
};

/** Grams per mole to the figures the grader would use, as a bare number. */
const mmValue = (formula: string): number => molarMass(formula).value;

/**
 * "How many oxygen atoms in Al₂(SO₄)₃?" and its answer, from ONE source.
 *
 * Computing the answer alone is not enough, and a planted fault proved it:
 * swapping the symbol from O to S made the count self-consistently 3 while the
 * question still said oxygen, and every test passed. The prose and the
 * arithmetic have to come from the same place or one of them can drift while
 * the other stays honest — so the element's NAME is looked up from the same
 * symbol the count is taken with, and the sentence is generated.
 */
const atomCountDrill = (formula: string, written: string, symbol: string, because: string): Drill => {
  const element = elementBySymbol(symbol);
  if (element === undefined) throw new Error(`no element ${symbol}`);
  return {
    ask: `How many ${element.name.toLowerCase()} atoms in ${written}?`,
    answer: String(parseFormula(formula).counts.get(symbol) ?? 0),
    because,
  };
};

/** Every atom a formula names, of any element. */
const allAtoms = (formula: string): number =>
  [...parseFormula(formula).counts.values()].reduce((sum, n) => sum + n, 0);

/** Round for display without pretending to significant figures. */
const to = (value: number, places: number): string =>
  String(Math.round(value * 10 ** places) / 10 ** places);

/* ------------------------------------------------------------------ */
/* Checking                                                            */
/* ------------------------------------------------------------------ */

/** `g/mol` and `%` both carry characters a regular expression would read. */
function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Does this typed answer count?
 *
 * Numeric comparison is on the VALUE rather than the string, so `18.02`,
 * `18.020` and `1.802e1` all pass — a student who is right about the chemistry
 * should not be marked wrong about formatting in a lesson. Significant figures
 * are graded in the app's last stage, which is where they belong; a drill that
 * enforced them here would be teaching two things at once and blaming the first
 * for the second.
 */
export function drillIsRight(drill: Drill, typed: string): boolean {
  const text = typed.trim();
  if (text === '') return false;

  const expected = Number(drill.answer.replace(/,/g, ''));
  if (Number.isFinite(expected)) {
    // `parseQuantity` THROWS on anything it cannot read rather than returning a
    // verdict, which is right for the grader and means the catch here is the
    // whole of "they typed something that is not a number".
    const withoutUnit =
      drill.unit === undefined ? text : text.replace(new RegExp(`\\s*${escapeForRegExp(drill.unit)}$`, 'i'), '');
    let value: number;
    try {
      value = parseQuantity(withoutUnit.trim()).value;
    } catch {
      return false;
    }
    if (expected === 0) return Math.abs(value) < DISTINGUISHABLE_RELATIVE;
    return Math.abs(value - expected) / Math.abs(expected) < 5e-3;
  }

  const tidy = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();
  return tidy(text) === tidy(drill.answer);
}

/* ------------------------------------------------------------------ */
/* The seven                                                           */
/* ------------------------------------------------------------------ */

export const LESSONS: readonly Lesson[] = [
  {
    id: 'formulas',
    title: 'Reading a formula',
    promise: 'Know exactly how many atoms of each element a formula names.',
    answers: ['E-MM-PARSE', 'E-BAL-SUBSCRIPT'],
    blocks: [
      {
        paragraphs: [
          'A formula is a count. H₂O says two hydrogen atoms and one oxygen, and nothing else about it is negotiable.',
          'A small number after a symbol counts only that symbol. A small number after a bracket counts everything inside the bracket.',
        ],
        worked: [
          'Ca(NO₃)₂  →  the bracket holds N and O₃',
          '           →  two of those: 2 N and 6 O',
          '           →  1 Ca, 2 N, 6 O',
        ],
      },
      {
        heading: 'The dot means separate',
        paragraphs: [
          'CuSO₄·5H₂O is copper sulfate with five waters attached. The waters are part of the mass and are counted separately, which is exactly why they are written on their own.',
          'Leaving the water out is one of the mistakes MoleBridge can name when it happens to you.',
        ],
      },
    ],
    drills: [
      atomCountDrill('Al2(SO4)3', 'Al₂(SO₄)₃', 'O', 'Three SO₄ groups, four oxygen each.'),
      { ask: 'How many atoms in total in Ca(NO₃)₂?', answer: String(allAtoms('Ca(NO3)2')), because: '1 calcium + 2 nitrogen + 6 oxygen.' },
      atomCountDrill('CuSO4*5H2O', 'CuSO₄·5H₂O', 'H', 'Five waters, two hydrogen each.'),
    ],
  },

  {
    id: 'molar-mass',
    title: 'Molar mass',
    promise: 'Turn any formula into grams per mole.',
    answers: ['E-MM-ARITH', 'E-MM-HYDRATE'],
    blocks: [
      {
        paragraphs: [
          'Molar mass is the mass of one mole of something, in grams. You get it by adding up the atomic weight of every atom the formula names.',
          'That is all it is. There is no trick, and the only thing that goes wrong is the counting you learned in the last lesson.',
        ],
        worked: [
          `H₂O  →  2 × 1.008  +  1 × 15.999`,
          `     →  ${mm('H2O')} g/mol`,
        ],
      },
      {
        heading: 'Hydrates',
        paragraphs: [
          'The waters count. Every one of them.',
        ],
        worked: [
          `CuSO₄       →  ${mm('CuSO4')} g/mol`,
          `CuSO₄·5H₂O  →  ${mm('CuSO4*5H2O')} g/mol`,
          `the difference is five waters, and forgetting it is a named mistake`,
        ],
      },
    ],
    drills: [
      { ask: 'Molar mass of NaCl?', answer: String(Math.round(mmValue('NaCl') * 100) / 100), unit: 'g/mol', because: 'Sodium plus chlorine.' },
      { ask: 'Molar mass of CO₂?', answer: String(Math.round(mmValue('CO2') * 100) / 100), unit: 'g/mol', because: 'Carbon plus two oxygen.' },
      { ask: 'Molar mass of Ca(OH)₂?', answer: String(Math.round(mmValue('Ca(OH)2') * 100) / 100), unit: 'g/mol', because: 'One calcium, two oxygen, two hydrogen.' },
    ],
  },

  {
    id: 'the-mole',
    title: 'Grams and moles',
    promise: 'Go from a mass to a number of moles, and back, without guessing which way up to put it.',
    answers: ['E-MOL-INVERTED', 'E-MOL-GRAMS'],
    blocks: [
      {
        paragraphs: [
          'Molar mass is grams per mole. That phrase tells you the arithmetic: to get moles, divide grams BY grams-per-mole.',
          'The units are the check. Write them down and the wrong way up cancels to something that is not moles, which is how you catch it before the answer is marked.',
        ],
        worked: [
          `36.0 g of H₂O  ÷  ${mm('H2O')} g/mol`,
          `  g ÷ (g/mol) = mol   ✓`,
          `  = ${formatSigFigs(36.0 / mmValue('H2O'), 3)} mol`,
        ],
      },
      {
        heading: 'The other way',
        paragraphs: ['Moles to grams is the same relationship used forwards: multiply.'],
        worked: [
          `2.50 mol of CO₂  ×  ${mm('CO2')} g/mol  =  ${formatSigFigs(2.5 * mmValue('CO2'), 3)} g`,
        ],
      },
    ],
    drills: [
      {
        ask: 'How many moles in 58.44 g of NaCl?',
        answer: String(Math.round((58.44 / mmValue('NaCl')) * 1000) / 1000),
        unit: 'mol',
        because: 'Grams divided by grams per mole. It comes out near 1, which is the point of the number chosen.',
      },
      {
        ask: 'What is the mass of 0.500 mol of CO₂, in grams?',
        answer: String(Math.round(0.5 * mmValue('CO2') * 100) / 100),
        unit: 'g',
        because: 'Moles times grams per mole.',
      },
    ],
  },

  {
    id: 'balancing',
    title: 'Balancing an equation',
    promise: 'Make both sides have the same atoms, in the smallest whole numbers.',
    answers: ['E-BAL-UNBALANCED', 'E-BAL-NOTLOWEST'],
    blocks: [
      {
        paragraphs: [
          'Atoms are not created or destroyed, so every element must appear the same number of times on both sides.',
          'You change the big numbers IN FRONT. You never change the small numbers inside a formula — that would make it a different substance.',
        ],
        worked: [
          'H₂ + O₂ → H₂O          not balanced: 2 O on the left, 1 on the right',
          '2H₂ + O₂ → 2H₂O        4 H and 2 O on each side  ✓',
        ],
      },
      {
        heading: 'Smallest whole numbers',
        paragraphs: [
          '4H₂ + 2O₂ → 4H₂O is balanced and is still wrong, because every coefficient divides by two. MoleBridge tells these two mistakes apart, and they mean different things about what you were doing.',
        ],
      },
    ],
    /*
      THESE COEFFICIENTS ARE DECLARED RATHER THAN SOLVED, and that is a rule
      rather than laziness: `solveBalance` must not be reachable from any
      student-facing path, and this file ships to the browser. Importing the
      solver to generate a lesson answer would put a working balancer in the
      bundle — the exact thing the header of `balance.ts` forbids.

      So they are data here and VERIFIED IN THE TEST, which does not ship:
      `lessons.test.ts` runs the solver over each equation and asserts these are
      the unique lowest-terms answer. The constraint pushed this from deriving
      to checking, and checking is the stronger of the two anyway.
    */
    drills: [
      {
        ask: 'Balance: __ N₂ + __ H₂ → __ NH₃. Give the three coefficients separated by spaces.',
        answer: '1 3 2',
        because: 'Two nitrogen on each side, six hydrogen on each side, and nothing divides further.',
      },
      {
        ask: 'Balance: __ CH₄ + __ O₂ → __ CO₂ + __ H₂O. Four coefficients, separated by spaces.',
        answer: '1 2 1 2',
        because: 'One carbon, four hydrogen, four oxygen on each side.',
      },
    ],
  },

  {
    id: 'mole-ratio',
    title: 'The mole ratio',
    promise: 'Use the balanced equation to get from moles of one substance to moles of another.',
    answers: ['E-RATIO-INVERTED', 'E-RATIO-MASS', 'E-RATIO-UNBALANCED'],
    blocks: [
      {
        paragraphs: [
          'The coefficients in a balanced equation are a ratio of MOLES. That is the only thing they are, and it is the whole reason balancing came first.',
          'They are not a ratio of grams. Using masses here is a named mistake, and it is the most common one there is.',
        ],
        worked: [
          '2H₂ + O₂ → 2H₂O',
          '  2 mol H₂ makes 2 mol H₂O',
          '  so 3.00 mol H₂ makes 3.00 × (2/2) = 3.00 mol H₂O',
          '  and 3.00 mol O₂ would make 3.00 × (2/1) = 6.00 mol H₂O',
        ],
      },
      {
        heading: 'Which way up',
        paragraphs: [
          'The substance you HAVE goes on the bottom. The substance you WANT goes on top. Getting that backwards gives a number that is wrong by exactly the square of the ratio, which is why the app can spot it.',
        ],
      },
    ],
    drills: [
      {
        ask: 'For 2H₂ + O₂ → 2H₂O: how many moles of H₂O from 5.00 mol of O₂?',
        answer: to(5.0 * (2 / 1), 3),
        unit: 'mol',
        because: 'Two H₂O per one O₂.',
      },
      {
        ask: 'For N₂ + 3H₂ → 2NH₃: how many moles of NH₃ from 6.00 mol of H₂?',
        answer: to(6.0 * (2 / 3), 3),
        unit: 'mol',
        because: 'Two NH₃ per three H₂, so 6.00 × 2/3.',
      },
    ],
  },

  {
    id: 'limiting',
    title: 'The limiting reactant',
    promise: 'Work out which reactant runs out first, and why the bigger mass is often not it.',
    answers: ['E-LIM-BYMASS', 'E-LIM-WRONG'],
    blocks: [
      {
        paragraphs: [
          'When you are given amounts of two reactants, one of them runs out first. That one decides how much product you can possibly get; the other is left over.',
          'YOU CANNOT TELL BY LOOKING AT THE MASSES. A hundred grams of one thing can be fewer moles than ten grams of another, and the reaction counts in moles.',
        ],
        worked: [
          'Turn each mass into moles.',
          'Divide each by its coefficient in the balanced equation.',
          'The smallest answer is the limiting one.',
        ],
      },
      {
        heading: 'Why the app asks',
        paragraphs: [
          'Choosing by mass and choosing wrongly after correct arithmetic are two different mistakes, and MoleBridge separates them, because they need different things said about them.',
        ],
      },
    ],
    drills: [
      {
        ask: 'For 2H₂ + O₂ → 2H₂O with 4.0 mol H₂ and 4.0 mol O₂, which is limiting? Answer H2 or O2.',
        answer: 'H2',
        because: '4.0 ÷ 2 = 2.0 for hydrogen; 4.0 ÷ 1 = 4.0 for oxygen. The smaller one runs out first.',
      },
      {
        ask: 'For N₂ + 3H₂ → 2NH₃ with 2.0 mol N₂ and 3.0 mol H₂, which is limiting? Answer N2 or H2.',
        answer: 'H2',
        because: '2.0 ÷ 1 = 2.0 for nitrogen; 3.0 ÷ 3 = 1.0 for hydrogen.',
      },
    ],
  },

  {
    id: 'other-units',
    title: 'Litres, particles and other units',
    promise: 'Turn moles of something into whatever unit the question actually asked for.',
    answers: ['E-CONV-FACTOR', 'E-CONV-INVERTED'],
    blocks: [
      {
        paragraphs: [
          'Every stoichiometry problem runs through moles in the middle, and then has to come back out into whatever unit was asked for. Grams is the common one. It is not the only one.',
          'Each of these is the same move: multiply the moles by a factor with the wanted unit on top and moles underneath, so the moles cancel and the wanted unit is what is left.',
        ],
        worked: [
          `moles \u00d7 (grams per mole)          \u2192 grams`,
          `moles \u00d7 (${to(STP_MOLAR_VOLUME_L, 1)} L per mole, at STP)  \u2192 litres of gas`,
          `moles \u00d7 (${AVOGADRO.toExponential(3)} per mole)   \u2192 particles`,
        ],
      },
      {
        heading: 'Litres of a gas, at STP',
        paragraphs: [
          `One mole of ANY gas takes up about ${to(STP_MOLAR_VOLUME_L, 1)} litres at standard temperature and pressure. It does not matter which gas — that is the useful part, and it is why the number is worth remembering.`,
          'It only holds for a GAS, and only at STP. A question that does not say STP is not asking for this factor.',
        ],
      },
      {
        heading: 'Particles',
        paragraphs: [
          `A mole is a count. It is ${AVOGADRO.toExponential(3)} of whatever you are counting — atoms, molecules, formula units — in the same way a dozen is twelve of whatever you are counting.`,
          'Answers here are enormous, and they should be. If your answer to a particle question is a small number, the factor went the wrong way round.',
        ],
      },
      {
        heading: 'Which way up',
        paragraphs: [
          'Going FROM moles you multiply. Going TO moles you divide. If you cannot remember which, write the factor as a fraction with its units and see which arrangement cancels.',
          'Then check the size before you write it down. Moles to litres makes the number much bigger; litres to moles makes it much smaller. An answer that moved the wrong way is the factor upside down.',
        ],
      },
      {
        heading: 'Percentages are the same move',
        paragraphs: [
          'A fraction times 100 is a percentage. It is the smallest conversion factor in the course and it is the one most often left off — an answer of 0.85 where the question asked for a percent is not a different mistake from forgetting to multiply by the molar mass.',
        ],
      },
    ],
    drills: [
      {
        ask: 'How many litres does 2.00 mol of oxygen gas occupy at STP?',
        answer: to(2 * STP_MOLAR_VOLUME_L, 1),
        unit: 'L',
        because: `one mole is ${to(STP_MOLAR_VOLUME_L, 1)} L at STP, so two moles is twice that. The gas being oxygen makes no difference.`,
      },
      {
        ask: `You have ${to(STP_MOLAR_VOLUME_L * 3, 1)} L of a gas at STP. How many moles is that?`,
        answer: '3',
        unit: 'mol',
        because: `going TO moles you divide: ${to(STP_MOLAR_VOLUME_L * 3, 1)} \u00f7 ${to(STP_MOLAR_VOLUME_L, 1)} = 3.`,
      },
      {
        ask: 'A reaction could have made 4.00 g and made 3.00 g. What is the percent yield?',
        answer: to((3 / 4) * 100, 0),
        unit: '%',
        because: 'actual over theoretical is 3.00 \u00f7 4.00 = 0.750, and a fraction is not a percentage until it is multiplied by 100.',
      },
    ],
  },

  {
    id: 'percent-yield',
    title: 'Percent yield',
    promise: 'Compare what you actually got with what the equation said you could get.',
    answers: ['E-CONV-INVERTED', 'E-ROUND-EARLY', 'E-SIG-FIGS'],
    blocks: [
      {
        paragraphs: [
          'The theoretical yield is what the equation promises if nothing goes wrong. The actual yield is what came out of the flask. Percent yield is the actual divided by the theoretical, times a hundred.',
          'Actual on top. It is the number you measured, and a percent yield over 100 means something is wrong with the measurement rather than with the chemistry.',
        ],
        worked: [
          'theoretical 25.0 g, actual 21.3 g',
          '  21.3 ÷ 25.0 = 0.852',
          '  × 100 = 85.2 %',
        ],
      },
      {
        heading: 'Round at the end, not on the way',
        paragraphs: [
          'Rounding an intermediate and carrying it forward changes the answer by more than you think. MoleBridge has a name for that mistake and will tell you when it is the one you made.',
        ],
      },
    ],
    drills: [
      {
        ask: 'Theoretical yield 40.0 g, actual yield 32.0 g. Percent yield?',
        answer: to((32.0 / 40.0) * 100, 3),
        unit: '%',
        because: '32.0 ÷ 40.0 = 0.800.',
      },
      {
        ask: 'Theoretical yield 12.5 g, actual yield 9.00 g. Percent yield, to three figures?',
        answer: to((9.0 / 12.5) * 100, 3),
        unit: '%',
        because: '9.00 ÷ 12.5 = 0.720.',
      },
    ],
  },
];
