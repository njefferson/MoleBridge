/**
 * taxonomy.ts — attributing a wrong number to a conceptual failure.
 *
 * This is the product. Everything else in the repository exists so that this
 * file can say "the 44.0 you typed is what you get when you apply the mole
 * ratio upside down" instead of "incorrect".
 *
 * HOW IT WORKS. For each stage, the correct value is computed from the problem
 * parameters, and so is a set of PREDICTED WRONG VALUES — one or more per
 * plausible error class, each derived from the same parameters by making the
 * specific mistake. A student entry is matched against that set at the
 * student's own stated precision. One match is a diagnosis. No match falls back
 * to an arithmetic slip if the entry is within an order of magnitude, and to
 * E-UNCLASSIFIED otherwise — which is COUNTED and reported, because the
 * unclassified rate is the number that says whether this file is any good.
 *
 * TWO MATCHES IS A DEFECT, NOT A TIEBREAK. §6.2 is explicit: if a wrong value
 * is consistent with two classes, the decomposition is wrong. So a collision is
 * reported as a collision and fails the build; nothing here picks a winner.
 *
 * WHERE THE DECOMPOSITION HAD TO CHANGE, and it is worth reading before
 * touching the limiting-reagent stages. E-LIM-WRONG and E-LIM-BYMASS both
 * describe a student naming the wrong limiting reactant, and with exactly two
 * reactants there is exactly ONE wrong box to tick — so at a single stage they
 * are not two predictions, they are one observable event wearing two names.
 * Rather than add the tiebreak §6.2 forbids, the stages were separated:
 *
 *   S4c  the CHOICE of limiting reactant. A wrong choice is E-LIM-BYMASS,
 *        because comparing the two stated masses is the overwhelming reason a
 *        student picks wrong here, and because §7 routes that class to the
 *        proportion remediation, which is the one that helps.
 *   S5   the mole yield carried forward. Choosing correctly at S4c and then
 *        entering the OTHER reactant's yield is E-LIM-WRONG — a distinct,
 *        common and separately observable event.
 *
 * PURE. No I/O, no globals, no clock.
 */

import { molarMass } from '../chem/molarmass.ts';
import { parseEquation, solveBalance, checkBalance } from '../chem/balance.ts';
import { parseFormula } from '../chem/formula.ts';
import {
  magnitudeOf,
  parseQuantity,
  roundToSigFigs,
  SigFigError,
  type Quantity,
} from '../chem/sigfig.ts';
import { type Problem, type Solution, type Unit, parseUnit, solve } from './problem.ts';
import {
  DISTINGUISHABLE_RELATIVE,
  FLOAT_SLOP_RELATIVE,
  ORDER_OF_MAGNITUDE_LIMIT,
  SCINOT_TRIGGER_LOG10,
} from './tolerance.ts';

/* ------------------------------------------------------------------ */
/* Classes and stages                                                  */
/* ------------------------------------------------------------------ */

/** Every error class in §6.2, plus the one that means "we do not know". */
export type ErrorClass =
  | 'E-BAL-UNBALANCED'
  | 'E-BAL-NOTLOWEST'
  | 'E-BAL-SUBSCRIPT'
  | 'E-MM-PARSE'
  | 'E-MM-HYDRATE'
  | 'E-MM-ARITH'
  | 'E-MOL-INVERTED'
  | 'E-MOL-GRAMS'
  | 'E-RATIO-INVERTED'
  | 'E-RATIO-MASS'
  | 'E-RATIO-UNBALANCED'
  | 'E-LIM-WRONG'
  | 'E-LIM-BYMASS'
  | 'E-CONV-FACTOR'
  | 'E-CONV-INVERTED'
  | 'E-SIG-FIGS'
  | 'E-ROUND-EARLY'
  | 'E-ARITH'
  | 'E-UNIT-MISSING'
  | 'E-UNCLASSIFIED';

/** Every class §6.2 names, for a test that insists each has a fixture. */
export const ERROR_CLASSES: readonly ErrorClass[] = [
  'E-BAL-UNBALANCED', 'E-BAL-NOTLOWEST', 'E-BAL-SUBSCRIPT',
  'E-MM-PARSE', 'E-MM-HYDRATE', 'E-MM-ARITH',
  'E-MOL-INVERTED', 'E-MOL-GRAMS',
  'E-RATIO-INVERTED', 'E-RATIO-MASS', 'E-RATIO-UNBALANCED',
  'E-LIM-WRONG', 'E-LIM-BYMASS',
  'E-CONV-FACTOR', 'E-CONV-INVERTED',
  'E-SIG-FIGS', 'E-ROUND-EARLY', 'E-ARITH', 'E-UNIT-MISSING',
  'E-UNCLASSIFIED',
];

/** The gated stages. `b` and `c` stages appear only where a problem needs them. */
export type StageId = 'S1' | 'S2' | 'S3' | 'S3b' | 'S4' | 'S4b' | 'S4c' | 'S5' | 'S6' | 'S7';

/** Which of the six code counters a stage reports into. */
export type CounterStage = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

/** What a stage asks the student to enter. */
export type StageKind = 'COEFFICIENTS' | 'NUMERIC' | 'CHOICE';

/** One gated stage of a problem. */
export interface Stage {
  readonly id: StageId;
  readonly kind: StageKind;
  /** The completion code has six counters; the inserted stages fold into these. */
  readonly counter: CounterStage;
  /** The unit the answer must carry. `none` means the answer is a bare number. */
  readonly unit: Unit;
  /** Only the last stage is graded on significant figures — see the note below. */
  readonly gradesSigFigs: boolean;
  /** What the student is asked, in their words. */
  readonly prompt: string;
}

/**
 * Build the stage list for a problem.
 *
 * PRECONDITION: `problem` came from the generator.
 *
 * SIGNIFICANT FIGURES ARE GRADED ONLY AT THE LAST STAGE, and that is a
 * chemistry decision rather than a leniency. Rounding an intermediate is
 * E-ROUND-EARLY — an error in its own right — so a stage machine that demanded
 * a rounded intermediate would be marking students down for doing the thing it
 * elsewhere calls a mistake.
 */
export function stagesFor(problem: Problem): Stage[] {
  const given = problem.species[problem.givenIndex] as string;
  const wanted = problem.species[problem.wantedIndex] as string;
  const isLimiting = problem.kind === 'LIMITING_REAGENT';
  const isYield = problem.kind === 'PERCENT_YIELD';
  const wantedUnitWord =
    problem.wantedUnit === 'particles' ? 'particles' : problem.wantedUnit === 'L' ? 'litres at STP' : 'grams';

  const stages: Stage[] = [
    {
      id: 'S1',
      kind: 'COEFFICIENTS',
      counter: 'S1',
      unit: 'none',
      gradesSigFigs: false,
      prompt: `Balance ${problem.equation}. Enter a coefficient for every species, including the ones that are 1.`,
    },
    {
      id: 'S2',
      kind: 'NUMERIC',
      counter: 'S2',
      unit: 'g/mol',
      gradesSigFigs: false,
      prompt: `What is the molar mass of ${given}?`,
    },
    {
      id: 'S3',
      kind: 'NUMERIC',
      counter: 'S3',
      unit: 'mol',
      gradesSigFigs: false,
      prompt: `How many moles is ${problem.given.text} g of ${given}?`,
    },
  ];

  if (isLimiting) {
    const second = problem.species[problem.secondGivenIndex as number] as string;
    stages.push({
      id: 'S3b',
      kind: 'NUMERIC',
      counter: 'S3',
      unit: 'mol',
      gradesSigFigs: false,
      prompt: `How many moles is ${(problem.secondGiven as { text: string }).text} g of ${second}?`,
    });
  }

  stages.push({
    id: 'S4',
    kind: 'NUMERIC',
    counter: 'S4',
    unit: 'none',
    gradesSigFigs: false,
    prompt: `What is the mole ratio of ${wanted} to ${given}? Enter it as a single number.`,
  });

  if (isLimiting) {
    const second = problem.species[problem.secondGivenIndex as number] as string;
    stages.push({
      id: 'S4b',
      kind: 'NUMERIC',
      counter: 'S4',
      unit: 'mol',
      gradesSigFigs: false,
      prompt: `How many moles of ${wanted} could the ${second} make on its own?`,
    });
    stages.push({
      id: 'S4c',
      kind: 'CHOICE',
      counter: 'S4',
      unit: 'none',
      gradesSigFigs: false,
      prompt: 'Which reactant runs out first?',
    });
  }

  stages.push({
    id: 'S5',
    kind: 'NUMERIC',
    counter: 'S5',
    unit: 'mol',
    gradesSigFigs: false,
    prompt: `How many moles of ${wanted} does the reaction actually make?`,
  });

  stages.push({
    id: 'S6',
    kind: 'NUMERIC',
    counter: 'S6',
    unit: problem.wantedUnit,
    gradesSigFigs: !isYield,
    prompt: `Convert that to ${wantedUnitWord}.`,
  });

  if (isYield) {
    stages.push({
      id: 'S7',
      kind: 'NUMERIC',
      counter: 'S6',
      unit: '%',
      gradesSigFigs: true,
      prompt: `The reaction recovered ${(problem.actualYield as { text: string }).text} g. What is the percent yield?`,
    });
  }

  return stages;
}

/* ------------------------------------------------------------------ */
/* Entries                                                             */
/* ------------------------------------------------------------------ */

/** What the student typed. */
export type StudentEntry =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'coefficients'; readonly values: readonly number[] }
  | { readonly kind: 'choice'; readonly speciesIndex: number };

/** A numeric entry, split into what it said and how precisely. */
export interface ReadEntry {
  readonly quantity: Quantity;
  /** The unit written after the number, or null where none was. */
  readonly unit: Unit | null;
  /** True where the text named something this does not recognise as a unit. */
  readonly unitUnrecognised: boolean;
}

/**
 * Split a typed answer into a number and a unit.
 *
 * PRECONDITION: none. Returns null where there is no number to read at all.
 */
export function readEntry(text: string): ReadEntry | null {
  const trimmed = text.trim();
  const match = /^([+-]?[\d.,]+(?:\s*(?:[eE][+-]?\d+|[x×*]\s*10\s*\^?\s*[+-]?\d+))?)\s*(.*)$/.exec(trimmed);
  if (match === null) return null;
  let quantity: Quantity;
  try {
    quantity = parseQuantity(match[1] as string);
  } catch (error) {
    if (error instanceof SigFigError) return null;
    throw error;
  }
  const tail = (match[2] as string).trim();
  if (tail.length === 0) return { quantity, unit: null, unitUnrecognised: false };
  const unit = parseUnit(tail);
  return unit === null
    ? { quantity, unit: null, unitUnrecognised: true }
    : { quantity, unit, unitUnrecognised: false };
}

/* ------------------------------------------------------------------ */
/* Predictions                                                         */
/* ------------------------------------------------------------------ */

/** A value a specific mistake would produce. */
export interface Prediction {
  readonly errorClass: ErrorClass;
  /** The number this mistake produces, for a NUMERIC stage. */
  readonly value?: number;
  /** The coefficient set this mistake produces, for S1. */
  readonly coefficients?: readonly number[];
  /** The species index this mistake picks, for S4c. */
  readonly choice?: number;
  /** What the mistake was, for the remediation. Never shown before the attempt. */
  readonly why: string;
}

/** A prediction that was dropped because it is not distinguishable from correct. */
export interface DroppedPrediction {
  readonly errorClass: ErrorClass;
  readonly why: string;
  readonly reason: 'INDISTINGUISHABLE_FROM_CORRECT';
}

/** Predictions for one stage, plus what could not be predicted and why. */
export interface StagePredictions {
  readonly stage: StageId;
  readonly correctValue: number | null;
  readonly correctCoefficients: readonly number[] | null;
  readonly correctChoice: number | null;
  readonly predictions: readonly Prediction[];
  readonly dropped: readonly DroppedPrediction[];
}

const relativeClose = (a: number, b: number, tolerance: number): boolean => {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return true;
  return Math.abs(a - b) / scale <= tolerance;
};

/** Two values a student could not tell apart, written to `sigFigs` figures. */
function sameAtPrecision(a: number, b: number, sigFigs: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return relativeClose(roundToSigFigs(a, sigFigs), roundToSigFigs(b, sigFigs), FLOAT_SLOP_RELATIVE);
}

/**
 * A molar mass computed with a specific parsing mistake, or null where the
 * formula has no place for that mistake to happen.
 */
function misparsedMolarMass(formula: string, mode: 'GROUP_LAST_ONLY' | 'GROUP_IGNORED'): number | null {
  // Find the outermost group and its subscript, as written.
  const match = /[([]([^()[\]]*)[)\]](\d*)/.exec(formula);
  if (match === null) return null;
  const inner = match[1] as string;
  const subscript = (match[2] as string) === '' ? 1 : Number(match[2]);
  if (subscript <= 1) return null;

  let replacement: string;
  if (mode === 'GROUP_IGNORED') {
    replacement = inner;
  } else {
    // The outer subscript distributed to the LAST element inside the group only,
    // which is what happens when the eye stops at the closing bracket.
    const parts = /^(.*?)([A-Z][a-z]?)(\d*)$/.exec(inner);
    if (parts === null) return null;
    const existing = (parts[3] as string) === '' ? 1 : Number(parts[3]);
    replacement = `${parts[1] as string}${parts[2] as string}${existing * subscript}`;
  }
  const variant = formula.slice(0, match.index) + replacement + formula.slice(match.index + match[0].length);
  try {
    return molarMass(variant).value;
  } catch {
    return null;
  }
}

/** The molar mass a student gets by ignoring the last element's own subscript. */
function droppedSubscriptMolarMass(formula: string): number | null {
  const match = /^(.*[A-Z][a-z]?)(\d+)$/.exec(formula.trim());
  if (match === null) return null;
  try {
    return molarMass(match[1] as string).value;
  } catch {
    return null;
  }
}

/** The balance of the equation with one product subscript altered. */
function subscriptVariantBalance(problem: Problem): number[] | null {
  const wanted = problem.species[problem.wantedIndex] as string;
  const bumped = /(\d+)$/.test(wanted)
    ? wanted.replace(/(\d+)$/, (d) => String(Number(d) + 1))
    : `${wanted}2`;
  const species = problem.species.slice();
  species[problem.wantedIndex] = bumped;
  const equation = `${species.slice(0, problem.reactantCount).join(' + ')} -> ${species.slice(problem.reactantCount).join(' + ')}`;
  try {
    const result = solveBalance(parseEquation(equation));
    return result.ok ? result.coefficients.slice() : null;
  } catch {
    return null;
  }
}

/** Recompute the chain with every intermediate rounded to the answer's figures. */
function roundEarlyValue(problem: Problem, solution: Solution, upTo: StageId): number {
  const sf = problem.answerSigFigs;
  const mm = roundToSigFigs(solution.mmGiven, sf);
  const mol = roundToSigFigs(problem.given.value / mm, sf);
  const ratio = roundToSigFigs(solution.ratio, sf);
  let molWanted = roundToSigFigs(mol * ratio, sf);
  if (problem.kind === 'LIMITING_REAGENT') {
    const mm2 = roundToSigFigs(solution.mmSecond as number, sf);
    const mol2 = roundToSigFigs((problem.secondGiven as { value: number }).value / mm2, sf);
    const other = roundToSigFigs(mol2 * roundToSigFigs(solution.ratioSecond as number, sf), sf);
    molWanted = Math.min(molWanted, other);
  }
  if (upTo === 'S5') return molWanted;
  const converted = roundToSigFigs(molWanted * roundToSigFigs(solution.convertFactor, sf), sf);
  if (upTo === 'S6') return converted;
  return ((problem.actualYield as { value: number }).value / converted) * 100;
}

/**
 * Every predicted wrong value for one stage.
 *
 * ANSWER KEY. Do not render this before the student has committed to the stage.
 *
 * PRECONDITION: `stage` is one of {@link stagesFor}'s stages for `problem`, and
 * `solution` is {@link solve}'s output for it.
 *
 * A prediction that lands on the correct value at the problem's own precision
 * is DROPPED rather than reported: for that problem that mistake is invisible,
 * and saying otherwise would mark a correct answer wrong.
 */
export function predictionsFor(problem: Problem, solution: Solution, stage: Stage): StagePredictions {
  const sf = problem.answerSigFigs;
  const raw: Prediction[] = [];
  let correctValue: number | null = null;
  let correctCoefficients: readonly number[] | null = null;
  let correctChoice: number | null = null;

  const given = problem.species[problem.givenIndex] as string;
  const wanted = problem.species[problem.wantedIndex] as string;

  switch (stage.id) {
    case 'S1': {
      correctCoefficients = solution.coefficients;
      raw.push({
        errorClass: 'E-BAL-NOTLOWEST',
        coefficients: solution.coefficients.map((c) => c * 2),
        why: 'every coefficient is doubled — the equation balances, but this is not the lowest whole-number set',
      });
      const variant = subscriptVariantBalance(problem);
      if (variant !== null) {
        raw.push({
          errorClass: 'E-BAL-SUBSCRIPT',
          coefficients: variant,
          why: `these coefficients balance a different equation — one where ${wanted}'s subscript was changed. Subscripts are part of the substance; only the coefficients in front may move`,
        });
      }
      break;
    }

    case 'S2': {
      correctValue = solution.mmGiven;
      const parsed = parseFormula(given);
      if (parsed.hydrateWaters > 0) {
        raw.push({
          errorClass: 'E-MM-HYDRATE',
          value: molarMass(given).anhydrousValue,
          why: `the ${parsed.hydrateWaters} waters of hydration were left out — they are part of the substance you weigh`,
        });
      }
      for (const mode of ['GROUP_LAST_ONLY', 'GROUP_IGNORED'] as const) {
        const value = misparsedMolarMass(given, mode);
        if (value !== null) {
          raw.push({
            errorClass: 'E-MM-PARSE',
            value,
            why:
              mode === 'GROUP_IGNORED'
                ? 'the subscript outside the bracket was not applied at all'
                : 'the subscript outside the bracket reached only the last element inside it',
          });
        }
      }
      const dropped = droppedSubscriptMolarMass(given);
      if (dropped !== null) {
        raw.push({
          errorClass: 'E-MM-PARSE',
          value: dropped,
          why: 'the last subscript in the formula was counted as one',
        });
      }
      break;
    }

    case 'S3':
    case 'S3b': {
      const isSecond = stage.id === 'S3b';
      const mass = isSecond ? (problem.secondGiven as { value: number }).value : problem.given.value;
      const mm = isSecond ? (solution.mmSecond as number) : solution.mmGiven;
      correctValue = mass / mm;
      raw.push({
        errorClass: 'E-MOL-INVERTED',
        value: mass * mm,
        why: 'grams were MULTIPLIED by the molar mass. Grams divided by grams-per-mole leaves moles; grams times grams-per-mole leaves nothing',
      });
      raw.push({
        errorClass: 'E-MOL-GRAMS',
        value: mass,
        why: 'this is the mass again, not the number of moles',
      });
      break;
    }

    case 'S4': {
      correctValue = solution.ratio;
      raw.push({
        errorClass: 'E-RATIO-INVERTED',
        value: 1 / solution.ratio,
        why: 'the ratio is upside down — it is the wanted coefficient over the given coefficient',
      });
      raw.push({
        errorClass: 'E-RATIO-MASS',
        value: solution.mmWanted / solution.mmGiven,
        why: 'this is the ratio of the two molar MASSES. The mole ratio comes from the balanced coefficients, not from the masses',
      });
      raw.push({
        errorClass: 'E-RATIO-UNBALANCED',
        value: 1,
        why: 'this is the ratio you get from the equation as it was written, before it was balanced',
      });
      break;
    }

    case 'S4b': {
      correctValue = solution.molWantedFromSecond as number;
      const ratioSecond = solution.ratioSecond as number;
      raw.push({
        errorClass: 'E-RATIO-INVERTED',
        value: (solution.molSecond as number) / ratioSecond,
        why: 'the ratio is upside down for this reactant too',
      });
      raw.push({
        errorClass: 'E-RATIO-UNBALANCED',
        value: solution.molSecond as number,
        why: 'no ratio was applied — that is the equation as written, before balancing',
      });
      break;
    }

    case 'S4c': {
      correctChoice = solution.limitingIndex;
      const firstMass = problem.given.value;
      const secondMass = (problem.secondGiven as { value: number }).value;
      const lighter = firstMass <= secondMass ? problem.givenIndex : (problem.secondGivenIndex as number);
      raw.push({
        errorClass: 'E-LIM-BYMASS',
        choice: lighter,
        why: 'that is the reactant with the smaller MASS. Which one runs out first is about moles of reaction, not grams on the balance',
      });
      break;
    }

    case 'S5': {
      correctValue = solution.molWanted;
      if (problem.kind === 'LIMITING_REAGENT') {
        const fromFirst = solution.molGiven * solution.ratio;
        const fromSecond = solution.molWantedFromSecond as number;
        raw.push({
          errorClass: 'E-LIM-WRONG',
          value: Math.max(fromFirst, fromSecond),
          why: 'this is what the reactant that does NOT run out could have made. The reaction stops at the smaller of the two',
        });
      }
      raw.push({
        errorClass: 'E-MOL-GRAMS',
        value: problem.given.value * solution.ratio,
        why: 'the ratio was applied to the grams instead of to the moles',
      });
      raw.push({
        errorClass: 'E-ROUND-EARLY',
        value: roundEarlyValue(problem, solution, 'S5'),
        why: 'the intermediates were rounded before the end. Round once, at the answer',
      });
      break;
    }

    case 'S6': {
      correctValue = solution.converted;
      raw.push({
        errorClass: 'E-CONV-INVERTED',
        value: solution.molWanted / solution.convertFactor,
        why: `moles were DIVIDED by ${solution.convertFactorName} instead of multiplied`,
      });
      const wrongFactor = problem.wantedUnit === 'g' ? solution.mmGiven : solution.mmWanted;
      raw.push({
        errorClass: 'E-CONV-FACTOR',
        value: solution.molWanted * wrongFactor,
        why:
          problem.wantedUnit === 'g'
            ? `that used ${given}'s molar mass. The conversion at the end belongs to ${wanted}`
            : `that used a molar mass. This step needs ${solution.convertFactorName}`,
      });
      raw.push({
        errorClass: 'E-ROUND-EARLY',
        value: roundEarlyValue(problem, solution, 'S6'),
        why: 'the intermediates were rounded before the end. Round once, at the answer',
      });
      break;
    }

    case 'S7': {
      correctValue = solution.percentYield as number;
      const actual = (problem.actualYield as { value: number }).value;
      const theoretical = solution.theoretical as number;
      raw.push({
        errorClass: 'E-CONV-INVERTED',
        value: (theoretical / actual) * 100,
        why: 'the fraction is upside down. Percent yield is what you got over what you could have got',
      });
      raw.push({
        errorClass: 'E-CONV-FACTOR',
        value: actual / theoretical,
        why: 'that is the fraction, not the percentage — it still needs multiplying by 100',
      });
      raw.push({
        errorClass: 'E-ROUND-EARLY',
        value: roundEarlyValue(problem, solution, 'S7'),
        why: 'the intermediates were rounded before the end. Round once, at the answer',
      });
      break;
    }
  }

  // Drop anything a student could not tell from the right answer.
  const predictions: Prediction[] = [];
  const dropped: DroppedPrediction[] = [];
  for (const prediction of raw) {
    let indistinct = false;
    if (prediction.value !== undefined && correctValue !== null) {
      indistinct = !Number.isFinite(prediction.value) || sameAtPrecision(prediction.value, correctValue, sf);
    } else if (prediction.coefficients !== undefined && correctCoefficients !== null) {
      indistinct = sameCoefficients(prediction.coefficients, correctCoefficients);
    } else if (prediction.choice !== undefined && correctChoice !== null) {
      indistinct = prediction.choice === correctChoice;
    }
    if (indistinct) {
      dropped.push({
        errorClass: prediction.errorClass,
        why: prediction.why,
        reason: 'INDISTINGUISHABLE_FROM_CORRECT',
      });
    } else {
      predictions.push(prediction);
    }
  }

  return { stage: stage.id, correctValue, correctCoefficients, correctChoice, predictions, dropped };
}

function sameCoefficients(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/* ------------------------------------------------------------------ */
/* Collisions                                                          */
/* ------------------------------------------------------------------ */

/** Two classes that predict an entry a student could not distinguish. */
export interface Collision {
  readonly stage: StageId;
  readonly classes: readonly [ErrorClass, ErrorClass];
  readonly value: string;
}

/**
 * Find every pair of DIFFERENT classes whose predictions a student could not
 * tell apart at this problem's precision.
 *
 * PRECONDITION: as {@link predictionsFor}.
 *
 * A non-empty result is a DEFECT in the decomposition, not something to work
 * around. §6.2: fix the decomposition, do not add a tiebreak heuristic.
 */
export function collisionsFor(problem: Problem, solution: Solution): Collision[] {
  const found: Collision[] = [];
  const sf = problem.answerSigFigs;

  for (const stage of stagesFor(problem)) {
    const { predictions } = predictionsFor(problem, solution, stage);
    for (let i = 0; i < predictions.length; i += 1) {
      for (let j = i + 1; j < predictions.length; j += 1) {
        const a = predictions[i] as Prediction;
        const b = predictions[j] as Prediction;
        if (a.errorClass === b.errorClass) continue;
        let clash = false;
        let shown = '';
        if (a.value !== undefined && b.value !== undefined) {
          clash = sameAtPrecision(a.value, b.value, sf);
          shown = String(roundToSigFigs(a.value, sf));
        } else if (a.coefficients !== undefined && b.coefficients !== undefined) {
          clash = sameCoefficients(a.coefficients, b.coefficients);
          shown = a.coefficients.join(',');
        } else if (a.choice !== undefined && b.choice !== undefined) {
          clash = a.choice === b.choice;
          shown = String(a.choice);
        }
        if (clash) found.push({ stage: stage.id, classes: [a.errorClass, b.errorClass], value: shown });
      }
    }
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/** What the classifier decided about one entry. */
export interface Classification {
  readonly stage: StageId;
  readonly correct: boolean;
  /** The single class, or null where the entry was correct. */
  readonly errorClass: ErrorClass | null;
  /** Every class that matched. More than one is a collision and a defect. */
  readonly matched: readonly ErrorClass[];
  readonly collision: boolean;
  /** log10(entry / correct), where both are numbers and neither is zero. */
  readonly logError: number | null;
  /** Why, in the student's words. Empty where the entry was correct. */
  readonly why: string;
}

/**
 * True where the entry could be this candidate, judged at the precision the
 * student themselves wrote.
 *
 * FOR DIAGNOSIS, NOT FOR GRADING. Matching a predicted wrong value should be
 * generous: the point is to recognise the mistake, and a student who rounded
 * their wrong answer still made that mistake. Grading uses
 * {@link entryIsCorrect}, which is strict, and the two are separate on purpose.
 */
function entryMatches(quantity: Quantity, candidate: number): boolean {
  const readings =
    quantity.kind === 'exact'
      ? []
      : quantity.kind === 'measured'
        ? [quantity.reading.sigFigs]
        : [quantity.low.sigFigs, quantity.high.sigFigs];
  if (readings.length === 0) return relativeClose(quantity.value, candidate, DISTINGUISHABLE_RELATIVE);
  return readings.some((sigFigs) => sameAtPrecision(quantity.value, candidate, sigFigs));
}

/**
 * True where the entry IS the correct value, judged at no less than the
 * precision the problem works to.
 *
 * WHY THE FLOOR. Judging only at the precision the student wrote accepts an
 * answer of 2 for a value of 1.627, because at one significant figure they
 * agree — and no intermediate stage grades figures, so nothing else was going
 * to catch it. An answer 23% out was being marked correct at every stage but
 * the last. Found by the remediation giveaway sweep, which flagged the `2` in a
 * worked line and turned out to be right about it for a reason that had nothing
 * to do with remediation.
 *
 * The floor is the problem's OWN stated precision rather than a fixed number,
 * which is what makes it work at the graded final stage too: a problem that
 * asks for two figures accepts two, and a ratio of exactly 2 still matches
 * however few figures it is written to.
 *
 * PRECONDITION: `sigFigs` is the problem's `answerSigFigs`.
 */
function entryIsCorrect(quantity: Quantity, candidate: number, sigFigs: number): boolean {
  const readings =
    quantity.kind === 'exact'
      ? []
      : quantity.kind === 'measured'
        ? [quantity.reading.sigFigs]
        : [quantity.low.sigFigs, quantity.high.sigFigs];
  if (readings.length === 0) return relativeClose(quantity.value, candidate, DISTINGUISHABLE_RELATIVE);
  return readings.some((written) => sameAtPrecision(quantity.value, candidate, Math.max(written, sigFigs)));
}

/**
 * Classify one student entry at one stage.
 *
 * PRECONDITION: `entry.kind` matches `stage.kind` — a coefficient stage takes
 * coefficients, a choice stage takes a choice. A mismatch is reported as
 * E-UNCLASSIFIED rather than throwing, because a UI bug should show up in the
 * unclassified count rather than crash a student's session.
 */
export function classify(
  problem: Problem,
  solution: Solution,
  stage: Stage,
  entry: StudentEntry,
): Classification {
  const predicted = predictionsFor(problem, solution, stage);
  const base = { stage: stage.id, collision: false, logError: null, matched: [] as ErrorClass[] };

  /* ---- coefficients ---- */
  if (stage.kind === 'COEFFICIENTS') {
    if (entry.kind !== 'coefficients') {
      return { ...base, correct: false, errorClass: 'E-UNCLASSIFIED', why: 'that is not a set of coefficients' };
    }
    const truth = predicted.correctCoefficients as readonly number[];
    if (sameCoefficients(entry.values, truth)) {
      return { ...base, correct: true, errorClass: null, why: '' };
    }
    for (const prediction of predicted.predictions) {
      if (prediction.coefficients !== undefined && sameCoefficients(entry.values, prediction.coefficients)) {
        return { ...base, correct: false, errorClass: prediction.errorClass, matched: [prediction.errorClass], why: prediction.why };
      }
    }
    const check = checkBalance(parseEquation(problem.equation), entry.values);
    if (check.conserves && !check.isLowest) {
      return {
        ...base,
        correct: false,
        errorClass: 'E-BAL-NOTLOWEST',
        matched: ['E-BAL-NOTLOWEST'],
        why: `every coefficient shares a factor of ${check.commonFactor}. Divide through`,
      };
    }
    return {
      ...base,
      correct: false,
      errorClass: 'E-BAL-UNBALANCED',
      matched: ['E-BAL-UNBALANCED'],
      why:
        check.unbalancedElements.length > 0
          ? `${check.unbalancedElements.join(' and ')} do not come out the same on both sides`
          : 'the two sides do not carry the same atoms',
    };
  }

  /* ---- choice ---- */
  if (stage.kind === 'CHOICE') {
    if (entry.kind !== 'choice') {
      return { ...base, correct: false, errorClass: 'E-UNCLASSIFIED', why: 'that is not one of the reactants' };
    }
    if (entry.speciesIndex === predicted.correctChoice) {
      return { ...base, correct: true, errorClass: null, why: '' };
    }
    for (const prediction of predicted.predictions) {
      if (prediction.choice === entry.speciesIndex) {
        return { ...base, correct: false, errorClass: prediction.errorClass, matched: [prediction.errorClass], why: prediction.why };
      }
    }
    return { ...base, correct: false, errorClass: 'E-LIM-WRONG', matched: ['E-LIM-WRONG'], why: 'that reactant is not the one that runs out first' };
  }

  /* ---- numeric ---- */
  if (entry.kind !== 'text') {
    return { ...base, correct: false, errorClass: 'E-UNCLASSIFIED', why: 'that is not a number' };
  }
  const read = readEntry(entry.text);
  if (read === null) {
    return { ...base, correct: false, errorClass: 'E-UNCLASSIFIED', why: 'that is not a number this can read' };
  }
  const correct = predicted.correctValue as number;
  const unitWanted = stage.unit;

  if (entryIsCorrect(read.quantity, correct, problem.answerSigFigs)) {
    if (unitWanted !== 'none' && (read.unit === null || read.unit !== unitWanted)) {
      return {
        ...base,
        correct: false,
        errorClass: 'E-UNIT-MISSING',
        matched: ['E-UNIT-MISSING'],
        why: read.unit === null ? `the number is right; it needs its unit — ${unitWanted}` : `the number is right, but ${unitWanted} is the unit here`,
      };
    }
    if (stage.gradesSigFigs) {
      const stated =
        read.quantity.kind === 'measured'
          ? read.quantity.reading.sigFigs
          : read.quantity.kind === 'ambiguous'
            ? null
            : null;
      if (stated === null) {
        return {
          ...base,
          correct: false,
          errorClass: 'E-SIG-FIGS',
          matched: ['E-SIG-FIGS'],
          why: 'the trailing zeros make it impossible to tell how many figures you meant. Write a decimal point, or use scientific notation',
        };
      }
      if (stated !== problem.answerSigFigs) {
        return {
          ...base,
          correct: false,
          errorClass: 'E-SIG-FIGS',
          matched: ['E-SIG-FIGS'],
          why: `the value is right, at ${stated} significant figures instead of ${problem.answerSigFigs}`,
        };
      }
    }
    return { ...base, correct: true, errorClass: null, why: '' };
  }

  const matched: ErrorClass[] = [];
  let why = '';
  for (const prediction of predicted.predictions) {
    if (prediction.value === undefined) continue;
    if (!entryMatches(read.quantity, prediction.value)) continue;
    if (!matched.includes(prediction.errorClass)) matched.push(prediction.errorClass);
    if (why === '') why = prediction.why;
  }

  const logError =
    correct !== 0 && read.quantity.value !== 0 && Number.isFinite(read.quantity.value)
      ? Math.log10(Math.abs(read.quantity.value / correct))
      : null;

  if (matched.length === 1) {
    return { stage: stage.id, correct: false, errorClass: matched[0] as ErrorClass, matched, collision: false, logError, why };
  }
  if (matched.length > 1) {
    // §6.2 forbids a tiebreak, so nothing is chosen. The step machine counts
    // this and the test suite fails the build on it.
    return { stage: stage.id, correct: false, errorClass: null, matched, collision: true, logError, why };
  }

  // Rounded so far that it agrees with the right answer only at the student's
  // own coarse precision. That is not a wrong method and not a wrong number —
  // it is too few figures to tell, and E-SIG-FIGS is what says so.
  if (entryMatches(read.quantity, correct)) {
    return {
      stage: stage.id,
      correct: false,
      errorClass: 'E-SIG-FIGS',
      matched: ['E-SIG-FIGS'],
      collision: false,
      logError,
      why: `that is rounded too far to tell. Work to at least ${problem.answerSigFigs} significant figures and round once, at the end`,
    };
  }

  const withinAnOrder = logError !== null && Math.abs(logError) < ORDER_OF_MAGNITUDE_LIMIT;
  if (withinAnOrder) {
    const arithmetic: ErrorClass = stage.id === 'S2' ? 'E-MM-ARITH' : 'E-ARITH';
    return {
      stage: stage.id,
      correct: false,
      errorClass: arithmetic,
      matched: [arithmetic],
      collision: false,
      logError,
      why:
        stage.id === 'S2'
          ? 'the atoms are counted right; the addition slipped'
          : 'the method is right and the arithmetic is not',
    };
  }

  return {
    stage: stage.id,
    correct: false,
    errorClass: 'E-UNCLASSIFIED',
    matched: ['E-UNCLASSIFIED'],
    collision: false,
    logError,
    why: 'that answer is a long way from anything this stage can account for',
  };
}

/* ------------------------------------------------------------------ */
/* §7 remediation                                                      */
/* ------------------------------------------------------------------ */

/** The four algebra skills, and nothing else. */
export type AlgebraSkill = 'A1' | 'A2' | 'A3' | 'A4';

/** What each skill is, for a UI to title it. */
export const ALGEBRA_SKILLS: { readonly [K in AlgebraSkill]: string } = {
  A1: 'PROPORTION — a/b = c/d, solve for the one you do not have',
  A2: 'REARRANGE — get the letter you want on its own',
  A3: 'UNITFRAC — multiply and divide unit fractions, and see what cancels',
  A4: 'SCINOT — scientific notation, and checking the size of an answer',
};

/**
 * §7's fixed mapping from error class to algebra branch.
 *
 * PRECONDITION: `logError` is the classification's, and may be null.
 *
 * Returns the branches in the order they should be shown. An empty array means
 * no algebra branch — most classes have none, on purpose: remediation is
 * injected at the failing stage, never offered as a menu.
 */
export function algebraFor(errorClass: ErrorClass, logError: number | null): AlgebraSkill[] {
  switch (errorClass) {
    case 'E-MOL-INVERTED':
    case 'E-CONV-INVERTED':
    case 'E-RATIO-INVERTED':
      return ['A2', 'A3'];
    case 'E-RATIO-MASS':
    case 'E-MOL-GRAMS':
      return ['A3'];
    case 'E-LIM-BYMASS':
      return ['A1'];
    case 'E-ARITH':
      return logError !== null && Math.abs(logError) >= SCINOT_TRIGGER_LOG10 ? ['A4'] : [];
    default:
      return [];
  }
}

/** One micro-remediation: at most three worked lines and one check question. */
export interface Remediation {
  readonly skill: AlgebraSkill;
  readonly title: string;
  /** Never more than three. */
  readonly lines: readonly string[];
  readonly question: string;
  readonly answer: number;
  readonly answerSigFigs: number;
}

/** The most worked lines a micro-remediation may show. §7. */
export const MAX_REMEDIATION_LINES = 3;

/** Figures the worked lines are written to. Readable, and not the grading precision. */
export const REMEDIATION_SIG_FIGS = 4;

/** The multiplicative relation the failing stage actually turns on. */
interface Relation {
  /** The quantity going in, and its unit. */
  readonly fromValue: number;
  readonly fromUnit: string;
  /** What it is multiplied or divided by. */
  readonly factorValue: number;
  readonly factorUnit: string;
  readonly factorName: string;
  /** What comes out, and its unit. */
  readonly toValue: number;
  readonly toUnit: string;
  /** Whether the correct step multiplies by the factor or divides by it. */
  readonly operation: 'multiply' | 'divide';
}

/**
 * The relation at the stage where the student went wrong.
 *
 * §7 asks for remediation drawn from the numbers the student just used. A
 * single relation built from the molar mass would be the wrong numbers at four
 * of the eight stages — the first version of this file did exactly that, and
 * explained a mole-ratio error using a molar mass the student was not looking
 * at.
 *
 * PRECONDITION: `stage` belongs to `problem`, and `solution` is `solve`'s.
 */
function relationFor(problem: Problem, solution: Solution, stage: Stage): Relation {
  const given = problem.species[problem.givenIndex] as string;
  const wanted = problem.species[problem.wantedIndex] as string;

  switch (stage.id) {
    case 'S4':
    case 'S4b':
    case 'S5': {
      const isSecond = stage.id === 'S4b';
      const from = isSecond ? (solution.molSecond as number) : solution.molGiven;
      const ratio = isSecond ? (solution.ratioSecond as number) : solution.ratio;
      const source = isSecond ? (problem.species[problem.secondGivenIndex as number] as string) : given;
      return {
        fromValue: from,
        fromUnit: `mol ${source}`,
        factorValue: ratio,
        factorUnit: `mol ${wanted} / mol ${source}`,
        factorName: 'the mole ratio from the balanced equation',
        toValue: from * ratio,
        toUnit: `mol ${wanted}`,
        operation: 'multiply',
      };
    }
    case 'S6':
      return {
        fromValue: solution.molWanted,
        fromUnit: `mol ${wanted}`,
        factorValue: solution.convertFactor,
        factorUnit: problem.wantedUnit === 'g' ? `g / mol` : `${problem.wantedUnit} / mol`,
        factorName: solution.convertFactorName,
        toValue: solution.converted,
        toUnit: problem.wantedUnit,
        operation: 'multiply',
      };
    case 'S7':
      return {
        fromValue: (problem.actualYield as { value: number }).value,
        fromUnit: 'g recovered',
        factorValue: solution.theoretical as number,
        factorUnit: 'g possible',
        factorName: 'the theoretical yield',
        toValue: (solution.percentYield as number) / 100,
        toUnit: 'of what was possible',
        operation: 'divide',
      };
    case 'S3b': {
      const second = problem.species[problem.secondGivenIndex as number] as string;
      return {
        fromValue: (problem.secondGiven as { value: number }).value,
        fromUnit: `g ${second}`,
        factorValue: solution.mmSecond as number,
        factorUnit: 'g / mol',
        factorName: `the molar mass of ${second}`,
        toValue: solution.molSecond as number,
        toUnit: `mol ${second}`,
        operation: 'divide',
      };
    }
    default:
      return {
        fromValue: problem.given.value,
        fromUnit: `g ${given}`,
        factorValue: solution.mmGiven,
        factorUnit: 'g / mol',
        factorName: `the molar mass of ${given}`,
        toValue: solution.molGiven,
        toUnit: `mol ${given}`,
        operation: 'divide',
      };
  }
}

/**
 * Build the micro-remediation for a skill, from the numbers the student just
 * used at the stage they used them — never from invented ones, and never as a
 * standalone lesson.
 *
 * PRECONDITION: `solution` is `solve(problem)`; `stage` is where the error
 * happened. Never more than {@link MAX_REMEDIATION_LINES} worked lines, which
 * is what §7 allows.
 */
export function buildRemediation(
  skill: AlgebraSkill,
  problem: Problem,
  solution: Solution,
  stage: Stage,
): Remediation {
  // S4 asks for the mole ratio ITSELF, so the multiply-this-by-that framing
  // every other stage uses is the wrong shape here — and the number it would
  // print is the answer. This stage gets its own lines, which name the two
  // coefficients by substance. The student already has both: S1 gated them.
  if (stage.id === 'S4') return ratioRemediation(skill, problem, solution);
  const sf = REMEDIATION_SIG_FIGS;
  const relation = relationFor(problem, solution, stage);
  const from = round(relation.fromValue, sf);
  const factor = round(relation.factorValue, sf);
  // The check question restates the relation with a DIFFERENT starting amount.
  // Doubling it was the obvious choice and was wrong: where the factor is
  // exactly 2 — which is most of a chemistry course — `from × 2` is the stage's
  // own answer, so the question handed over the number it was checking. The
  // multiplier is chosen to collide with neither the stage's answer nor its
  // own, and 10 is first because it is the one a student can do in their head.
  const checkFactor = pickCheckMultiplier(relation, problem.answerSigFigs);
  const checkFrom = round(relation.fromValue * checkFactor, sf);
  const wanted = problem.species[problem.wantedIndex] as string;

  switch (skill) {
    case 'A1': {
      const fromFirst = round(solution.molGiven * solution.ratio, sf);
      const fromSecond = round(solution.molWantedFromSecond ?? 0, sf);
      return {
        skill,
        title: ALGEBRA_SKILLS.A1,
        lines: [
          `Two reactants, one question: how much ${wanted} could each one make on its own?`,
          `One of them could make ${fromFirst} mol. The other could make ${fromSecond} mol.`,
          'The SMALLER answer is what happens — that reactant runs out and the reaction stops. Grams do not decide it.',
        ],
        question: `Of ${fromFirst} mol and ${fromSecond} mol, how many moles does the reaction actually make?`,
        answer: solution.molWanted,
        answerSigFigs: sf,
      };
    }
    case 'A2':
      return relation.operation === 'divide'
        ? {
            skill,
            title: ALGEBRA_SKILLS.A2,
            lines: [
              `Start from what ${relation.factorName} MEANS: ${relation.fromUnit} = ${relation.toUnit} × ${factor}.`,
              `You have ${relation.fromUnit} and you want ${relation.toUnit}, so divide both sides by ${factor}.`,
              // The set-up, and NOT the result. Working it out is the stage.
              `So ${relation.toUnit} = ${from} ÷ ${factor}. Work that out and enter it.`,
            ],
            question: `By the same relation, what is ${checkFrom} ${relation.fromUnit} in ${relation.toUnit}?`,
            answer: (relation.fromValue * checkFactor) / relation.factorValue,
            answerSigFigs: sf,
          }
        : {
            skill,
            title: ALGEBRA_SKILLS.A2,
            lines: [
              `${capitalise(relation.factorName)} says: one ${relation.fromUnit} gives ${factor} ${relation.toUnit}.`,
              `You have ${from} of them, so multiply rather than divide.`,
              // The set-up, and NOT the result. Working it out is the stage.
              `So ${relation.toUnit} = ${from} × ${factor}. Work that out and enter it.`,
            ],
            question: `By the same relation, what would ${checkFrom} ${relation.fromUnit} give?`,
            answer: relation.fromValue * checkFactor * relation.factorValue,
            answerSigFigs: sf,
          };
    case 'A3':
      return {
        skill,
        title: ALGEBRA_SKILLS.A3,
        lines: [
          relation.operation === 'divide'
            ? `Write it with the units in: ${from} ${relation.fromUnit} × (1 ${relation.toUnit} / ${factor} ${relation.fromUnit}).`
            : `Write it with the units in: ${from} ${relation.fromUnit} × (${factor} ${relation.toUnit} / 1 ${relation.fromUnit}).`,
          `The ${relation.fromUnit} on the top and on the bottom cancel, and ${relation.toUnit} is what is left — which is what was asked for.`,
          'Turn the fraction over and nothing cancels: the units of the answer come out as something that is not a thing.',
        ],
        question: `After the cancelling, what unit does ${from} × that fraction leave?`,
        answer: relation.toValue,
        answerSigFigs: sf,
      };
    default:
      // A4 teaches the SIZE of an answer, which is exactly the remediation most
      // at risk of handing the answer over: a one-figure estimate typed back in
      // would be marked correct at a stage that does not grade figures. So it
      // names the DECADE in words and shows no number that could be entered.
      return {
        skill,
        title: ALGEBRA_SKILLS.A4,
        lines: [
          `Before the arithmetic, ask how big the answer should be: something ${decadeName(relation.fromValue)} ${relation.operation === 'divide' ? 'divided by' : 'times'} something ${decadeName(relation.factorValue)}.`,
          `That lands ${decadeName(relation.toValue)} — so if what you typed is in a different decade, the method was right and a decimal point moved.`,
          'Ten times too big or ten times too small is a misplaced decimal point, not a wrong method.',
        ],
        question: `Without working it out: should the answer be ${decadeName(relation.toValue)}, or ten times that?`,
        answer: relation.toValue,
        answerSigFigs: 1,
      };
  }
}

/** Multipliers the check question may restate the relation with, easiest first. */
const CHECK_MULTIPLIERS: readonly number[] = [10, 3, 7, 4, 100];

/**
 * Choose a multiplier for the check question that cannot print the stage's own
 * answer, either as the amount it starts from or as the amount it produces.
 *
 * PRECONDITION: `relation` is the failing stage's, and `sigFigs` is the
 * problem's `answerSigFigs` — the precision correctness is judged at.
 */
function pickCheckMultiplier(relation: Relation, sigFigs: number): number {
  const answer = relation.toValue;
  const collides = (value: number): boolean => sameAtPrecision(value, answer, sigFigs);
  for (const multiplier of CHECK_MULTIPLIERS) {
    const start = relation.fromValue * multiplier;
    const result =
      relation.operation === 'divide' ? start / relation.factorValue : start * relation.factorValue;
    if (!collides(start) && !collides(result)) return multiplier;
  }
  return CHECK_MULTIPLIERS[CHECK_MULTIPLIERS.length - 1] as number;
}

/** The remediation for stage S4, where the answer is the ratio itself. */
function ratioRemediation(skill: AlgebraSkill, problem: Problem, solution: Solution): Remediation {
  const given = problem.species[problem.givenIndex] as string;
  const wanted = problem.species[problem.wantedIndex] as string;
  const bigger = solution.ratio > 1;

  switch (skill) {
    case 'A2':
      return {
        skill,
        title: ALGEBRA_SKILLS.A2,
        lines: [
          `The mole ratio is not a fact about the substances. It is read straight off the coefficients you just balanced.`,
          `The one you WANT goes on top. The one you were GIVEN goes underneath.`,
          `So it is the coefficient in front of ${wanted}, divided by the coefficient in front of ${given}. Read both off your own equation.`,
        ],
        question: `If you wrote it the other way up instead, would the number come out bigger than one or smaller than one?`,
        answer: 1 / solution.ratio,
        answerSigFigs: REMEDIATION_SIG_FIGS,
      };
    case 'A3':
      return {
        skill,
        title: ALGEBRA_SKILLS.A3,
        lines: [
          `Write the ratio with its units on: mol ${wanted} over mol ${given}.`,
          `You are coming FROM moles of ${given}, so mol ${given} has to be on the bottom — that is the only way it cancels.`,
          `Upside down, nothing cancels and the answer comes out in ${given} when the question asked for ${wanted}.`,
        ],
        question: `Which substance's unit has to be on the bottom of the fraction for it to cancel?`,
        answer: solution.ratio,
        answerSigFigs: REMEDIATION_SIG_FIGS,
      };
    case 'A1':
      return {
        skill,
        title: ALGEBRA_SKILLS.A1,
        lines: [
          `A balanced equation is a proportion: so many ${given} always go with so many ${wanted}.`,
          `Whatever multiplies one side multiplies the other, so the two coefficients keep their relationship however much you start with.`,
          `The ratio is what that relationship is worth per mole — the wanted coefficient over the given one.`,
        ],
        question: `If you doubled the amount of ${given}, would the ratio change?`,
        answer: solution.ratio,
        answerSigFigs: REMEDIATION_SIG_FIGS,
      };
    default:
      return {
        skill,
        title: ALGEBRA_SKILLS.A4,
        lines: [
          `A mole ratio comes from the small whole numbers in front of the formulas, so it is a small number.`,
          `It is ${bigger ? 'bigger than one here, because more ' + wanted + ' comes out than ' + given + ' goes in' : 'smaller than one here, because it takes more ' + given + ' than the ' + wanted + ' it makes'} — but not by orders of magnitude.`,
          `If what you typed is in the hundreds, a molar mass got into a step that only wanted coefficients.`,
        ],
        question: `Should a mole ratio ever be in the hundreds?`,
        answer: solution.ratio,
        answerSigFigs: REMEDIATION_SIG_FIGS,
      };
  }
}

/**
 * The decade a value sits in, in words — "in the tens", "between one and ten".
 *
 * PRECONDITION: `value` is finite.
 *
 * The magnitude remediation is the one most at risk of handing the answer over:
 * a value rounded to a single figure is still a number, and at a stage that
 * does not grade significant figures it would be marked correct. Rounding to
 * one figure was tried and a sweep found the case where it collided — a molar
 * mass near thirty, a mass near nine hundred, and an answer of thirty. Words
 * cannot be typed into the box, and the decade is what the lesson is about.
 */
export function decadeName(value: number): string {
  if (value === 0) return 'at zero';
  const magnitude = magnitudeOf(Math.abs(value));
  if (magnitude >= 6) return `around ten to the ${magnitude}`;
  if (magnitude === 0) return 'between one and ten';
  if (magnitude === 1) return 'in the tens';
  if (magnitude === 2) return 'in the hundreds';
  if (magnitude === 3) return 'in the thousands';
  if (magnitude === -1) return 'between a tenth and one';
  if (magnitude === -2) return 'in the hundredths';
  if (magnitude === -3) return 'in the thousandths';
  return `around ten to the ${magnitude}`;
}

function capitalise(text: string): string {
  return text.length === 0 ? text : `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;
}

function round(value: number, sigFigs: number): number {
  return roundToSigFigs(value, Math.max(1, Math.min(21, sigFigs)));
}

/** Magnitude helper re-exported for the CLI's reporting. */
export { magnitudeOf };
