/**
 * problem.ts — the deterministic problem generator.
 *
 * §6.3: a problem set is a pure function of (assignmentKey, tier, index). The
 * same key produces byte-identical problems on a Chromebook, on the board at
 * the front of the room and in this test suite, forever, with no server and
 * nothing stored. That is what lets a teacher put one key in Canvas and have
 * thirty students work the same problems.
 *
 * TWO TYPES, KEPT APART. `Problem` is what a screen may render: the reaction
 * skeleton with no coefficients, the quantity given, the unit wanted.
 * `Solution` is the answer key, and it is produced by `solve()` — which calls
 * the balancer, which is validation-only. A screen renders a `Problem`; the
 * grader calls `solve`. Nothing that renders should ever hold a `Solution`
 * before the student has committed to that stage's answer.
 *
 * WHAT THE GENERATOR REFUSES. Every draw is checked against the §6.3
 * guarantees and rejected if it fails one — a mole ratio of 1:1 (which would
 * make "applied it upside down" indistinguishable from getting it right), a
 * stated quantity whose significant figures are ambiguous, an answer outside
 * two to four significant figures, a limiting-reagent pair the student could
 * get right by comparing masses. Rejection is deterministic: the same key
 * rejects the same draws in the same order and lands on the same problem.
 *
 * PURE. No I/O, no globals, no clock.
 */

import { molarMass } from '../chem/molarmass.ts';
import { parseEquation, solveBalance } from '../chem/balance.ts';
import { parseQuantity, roundToSigFigs, formatUnambiguous, multiplyDivide, exact, measured, reportableSigFigs, type Quantity } from '../chem/sigfig.ts';
import { AVOGADRO, STP_MOLAR_VOLUME_L, STP_MOLAR_VOLUME_SIG_FIGS } from '../chem/constants.ts';
import { makeRng, nextInt, pick, type Rng } from './rng.ts';
import {
  LIMITING_MARGIN,
  MAX_ANSWER_SIG_FIGS,
  MAX_GENERATION_ATTEMPTS,
  MAX_PHYSICAL_QUANTITY,
  MIN_ANSWER_SIG_FIGS,
  MIN_PHYSICAL_QUANTITY,
  WHOLE_NUMBER_FRIENDLY,
  CONVERSION_SEPARATION_ULPS,
} from './tolerance.ts';

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

/** Every unit a stage can ask for. `ratio` and `none` are unitless. */
export type Unit = 'g' | 'mol' | 'g/mol' | 'particles' | 'L' | '%' | 'none';

/** What a student may type for each unit and still be understood. */
const UNIT_WORDS: ReadonlyMap<Unit, readonly string[]> = new Map([
  ['g', ['g', 'gram', 'grams', 'gs']],
  ['mol', ['mol', 'mole', 'moles', 'mols']],
  ['g/mol', ['g/mol', 'gmol', 'g per mol', 'grams/mole', 'g/mole', 'grams per mole']],
  ['particles', ['particles', 'particle', 'atoms', 'atom', 'molecules', 'molecule', 'formula units', 'units']],
  ['L', ['l', 'liter', 'liters', 'litre', 'litres']],
  ['%', ['%', 'percent', 'pct']],
  ['none', []],
]);

/**
 * Read a unit off the tail of a student's entry.
 *
 * PRECONDITION: none. Returns null where the text names no unit this
 * understands, which is not the same as naming none — the caller distinguishes
 * "no unit given" from "a unit that is wrong".
 */
export function parseUnit(text: string): Unit | null {
  const cleaned = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (cleaned.length === 0) return null;
  for (const [unit, words] of UNIT_WORDS) {
    for (const word of words) if (cleaned === word) return unit;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The reaction pool                                                   */
/* ------------------------------------------------------------------ */

/** Species that are gases at STP, so a volume may be asked for. */
const GASES: ReadonlySet<string> = new Set([
  'H2', 'O2', 'N2', 'Cl2', 'F2', 'CO2', 'CO', 'NH3', 'CH4', 'NO', 'NO2', 'SO2', 'C2H6', 'C3H8', 'C4H10',
]);

/** One reaction the generator may draw from. */
export interface Reaction {
  readonly id: string;
  /** The skeleton, with no coefficients — this is what the student is shown. */
  readonly equation: string;
}

/**
 * The reactions a class sees. Every one is checked at test time for a unique
 * nonzero balance; the generator checks again on every draw, because a pool
 * entry that stops balancing after an edit must fail loudly rather than quietly
 * produce a problem with no answer.
 */
export const REACTIONS: readonly Reaction[] = [
  { id: 'methane-combustion', equation: 'CH4 + O2 -> CO2 + H2O' },
  { id: 'ethane-combustion', equation: 'C2H6 + O2 -> CO2 + H2O' },
  { id: 'propane-combustion', equation: 'C3H8 + O2 -> CO2 + H2O' },
  { id: 'butane-combustion', equation: 'C4H10 + O2 -> CO2 + H2O' },
  { id: 'octane-combustion', equation: 'C8H18 + O2 -> CO2 + H2O' },
  { id: 'ethanol-combustion', equation: 'C2H5OH + O2 -> CO2 + H2O' },
  { id: 'glucose-combustion', equation: 'C6H12O6 + O2 -> CO2 + H2O' },
  { id: 'ammonia-synthesis', equation: 'N2 + H2 -> NH3' },
  { id: 'rusting', equation: 'Fe + O2 -> Fe2O3' },
  { id: 'aluminium-oxide', equation: 'Al + O2 -> Al2O3' },
  { id: 'magnesium-oxide', equation: 'Mg + O2 -> MgO' },
  { id: 'sodium-chloride', equation: 'Na + Cl2 -> NaCl' },
  { id: 'water-synthesis', equation: 'H2 + O2 -> H2O' },
  { id: 'potassium-chlorate', equation: 'KClO3 -> KCl + O2' },
  { id: 'limestone-calcining', equation: 'CaCO3 -> CaO + CO2' },
  { id: 'zinc-acid', equation: 'Zn + HCl -> ZnCl2 + H2' },
  { id: 'aluminium-acid', equation: 'Al + HCl -> AlCl3 + H2' },
  { id: 'magnesium-acid', equation: 'Mg + HCl -> MgCl2 + H2' },
  { id: 'silver-chloride', equation: 'AgNO3 + NaCl -> AgCl + NaNO3' },
  { id: 'lead-iodide', equation: 'Pb(NO3)2 + KI -> PbI2 + KNO3' },
  { id: 'sulfuric-neutralisation', equation: 'H2SO4 + NaOH -> Na2SO4 + H2O' },
  { id: 'lime-neutralisation', equation: 'HCl + Ca(OH)2 -> CaCl2 + H2O' },
  { id: 'calcium-phosphate', equation: 'H3PO4 + Ca(OH)2 -> Ca3(PO4)2 + H2O' },
  { id: 'blast-furnace', equation: 'Fe2O3 + CO -> Fe + CO2' },
  { id: 'ostwald', equation: 'NH3 + O2 -> NO + H2O' },
  { id: 'copper-silver', equation: 'Cu + AgNO3 -> Cu(NO3)2 + Ag' },
  { id: 'aluminium-copper', equation: 'Al + CuCl2 -> AlCl3 + Cu' },
  { id: 'soda-acid', equation: 'Na2CO3 + HCl -> NaCl + H2O + CO2' },
  { id: 'permanganate-chloride', equation: 'KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2' },
  { id: 'thermite', equation: 'Al + Fe2O3 -> Al2O3 + Fe' },
  { id: 'copper-sulfate-hydrate', equation: 'CuSO4·5H2O -> CuSO4 + H2O' },
  { id: 'epsom-hydrate', equation: 'MgSO4·7H2O -> MgSO4 + H2O' },
  { id: 'washing-soda-hydrate', equation: 'Na2CO3·10H2O -> Na2CO3 + H2O' },
  { id: 'calcium-chloride-hydrate', equation: 'CaCl2·2H2O -> CaCl2 + H2O' },
];

/** Reactions with a hydrate, which tier 2 draws on for the E-MM-HYDRATE class. */
const HYDRATE_REACTIONS = REACTIONS.filter((r) => r.equation.includes('·'));
/** Reactions with two or more reactants, which a limiting-reagent problem needs. */
const TWO_REACTANT_REACTIONS = REACTIONS.filter((r) => r.equation.split('->')[0]?.includes('+') === true);

/* ------------------------------------------------------------------ */
/* Problems                                                            */
/* ------------------------------------------------------------------ */

/** What a problem asks for. */
export type ProblemKind =
  | 'MASS_TO_MASS'
  | 'MASS_TO_PARTICLES'
  | 'MASS_TO_VOLUME'
  | 'LIMITING_REAGENT'
  | 'PERCENT_YIELD';

/** A quantity as the problem states it, text and all. */
export interface StatedQuantity {
  readonly value: number;
  readonly unit: Unit;
  readonly sigFigs: number;
  /** Exactly as the student reads it, so the digits they see are the digits stated. */
  readonly text: string;
}

/**
 * Everything a screen needs to pose the problem.
 *
 * DELIBERATELY WITHOUT THE ANSWER. No coefficients, no molar masses, no
 * intermediate values. Those come from {@link solve}, which is the grader's.
 */
export interface Problem {
  readonly assignmentKey: string;
  readonly tier: number;
  readonly index: number;
  readonly kind: ProblemKind;
  readonly reactionId: string;
  /** The skeleton as shown: no coefficients, because entering them is stage S1. */
  readonly equation: string;
  /** Every species, reactants then products, in written order. */
  readonly species: readonly string[];
  /** How many entries in `species` are reactants. */
  readonly reactantCount: number;
  readonly givenIndex: number;
  readonly given: StatedQuantity;
  /** The second reactant of a limiting-reagent problem. */
  readonly secondGivenIndex: number | null;
  readonly secondGiven: StatedQuantity | null;
  readonly wantedIndex: number;
  readonly wantedUnit: Unit;
  /** What was actually recovered, for a percent-yield problem. */
  readonly actualYield: StatedQuantity | null;
  /** Significant figures the final answer must carry. */
  readonly answerSigFigs: number;
  /** One sentence, as a student reads it. */
  readonly prompt: string;
}

/** The answer key: every stage's correct value. */
export interface Solution {
  readonly coefficients: readonly number[];
  readonly molarMasses: readonly number[];
  readonly mmGiven: number;
  readonly molGiven: number;
  readonly ratio: number;
  readonly molWanted: number;
  readonly mmWanted: number;
  /** The S6 conversion factor and what it is. */
  readonly convertFactor: number;
  readonly convertFactorName: string;
  readonly converted: number;
  /* limiting reagent */
  readonly mmSecond: number | null;
  readonly molSecond: number | null;
  readonly ratioSecond: number | null;
  readonly molWantedFromSecond: number | null;
  /** Index into `species` of the limiting reactant. */
  readonly limitingIndex: number | null;
  /* percent yield */
  readonly theoretical: number | null;
  readonly percentYield: number | null;
  /** The value the last stage asks for. */
  readonly finalValue: number;
  readonly finalUnit: Unit;
  /** The chain's precision, carried by the sig-fig engine. */
  readonly finalQuantity: Quantity;
}

/** Thrown when the generator cannot find a problem meeting every guarantee. */
export class GenerationError extends Error {
  readonly attempts: number;
  readonly lastFailures: readonly string[];

  constructor(seed: string, attempts: number, lastFailures: readonly string[]) {
    super(`no problem met every guarantee for "${seed}" in ${attempts} attempts; last failures: ${lastFailures.join(', ')}`);
    this.name = 'GenerationError';
    this.attempts = attempts;
    this.lastFailures = lastFailures;
  }
}

/* ------------------------------------------------------------------ */
/* Solving                                                             */
/* ------------------------------------------------------------------ */

/**
 * Compute every stage's correct value.
 *
 * ANSWER KEY — do not hand the result to a screen before the student has
 * committed to that stage. `solve` calls the balancer, which is validation-only
 * by the rule at the head of `balance.ts`.
 *
 * PRECONDITION: `problem` came from {@link generateProblem}, so its equation
 * balances uniquely. THROWS where it does not, because a problem with no answer
 * must never be posed.
 */
export function solve(problem: Problem): Solution {
  const equation = parseEquation(problem.equation);
  const balance = solveBalance(equation);
  if (!balance.ok) {
    throw new Error(`"${problem.equation}" does not have a unique balance: ${balance.code}`);
  }
  const coefficients = balance.coefficients;
  const molarMasses = problem.species.map((formula) => molarMass(formula).value);

  const mmGiven = molarMasses[problem.givenIndex] as number;
  const mmWanted = molarMasses[problem.wantedIndex] as number;
  const molGiven = problem.given.value / mmGiven;
  const ratio = (coefficients[problem.wantedIndex] as number) / (coefficients[problem.givenIndex] as number);
  const molWantedFromGiven = molGiven * ratio;

  let mmSecond: number | null = null;
  let molSecond: number | null = null;
  let ratioSecond: number | null = null;
  let molWantedFromSecond: number | null = null;
  let limitingIndex: number | null = null;
  let molWanted = molWantedFromGiven;

  if (problem.secondGivenIndex !== null && problem.secondGiven !== null) {
    mmSecond = molarMasses[problem.secondGivenIndex] as number;
    molSecond = problem.secondGiven.value / mmSecond;
    ratioSecond =
      (coefficients[problem.wantedIndex] as number) / (coefficients[problem.secondGivenIndex] as number);
    molWantedFromSecond = molSecond * ratioSecond;
    limitingIndex =
      molWantedFromGiven <= molWantedFromSecond ? problem.givenIndex : problem.secondGivenIndex;
    molWanted = Math.min(molWantedFromGiven, molWantedFromSecond);
  }

  const factor = conversionFactor(problem, mmWanted);
  const converted = molWanted * factor.value;

  let theoretical: number | null = null;
  let percentYield: number | null = null;
  if (problem.actualYield !== null) {
    theoretical = converted;
    percentYield = (problem.actualYield.value / theoretical) * 100;
  }

  const chain: Quantity[] = [
    measured(problem.given.value, problem.given.sigFigs),
    measured(mmGiven, molarMass(problem.species[problem.givenIndex] as string).sigFigs),
    exact(ratio),
    factor.quantity,
  ];
  if (problem.secondGiven !== null) {
    chain.push(measured(problem.secondGiven.value, problem.secondGiven.sigFigs));
  }
  if (problem.actualYield !== null) {
    chain.push(measured(problem.actualYield.value, problem.actualYield.sigFigs));
  }

  const finalValue = percentYield ?? converted;
  const finalUnit: Unit = percentYield === null ? problem.wantedUnit : '%';

  return {
    coefficients,
    molarMasses,
    mmGiven,
    molGiven,
    ratio,
    molWanted,
    mmWanted,
    convertFactor: factor.value,
    convertFactorName: factor.name,
    converted,
    mmSecond,
    molSecond,
    ratioSecond,
    molWantedFromSecond,
    limitingIndex,
    theoretical,
    percentYield,
    finalValue,
    finalUnit,
    finalQuantity: multiplyDivide(finalValue, chain),
  };
}

/** The S6 factor: what moles of the wanted substance get multiplied by. */
function conversionFactor(
  problem: Problem,
  mmWanted: number,
): { value: number; name: string; quantity: Quantity } {
  const wanted = problem.species[problem.wantedIndex] as string;
  switch (problem.wantedUnit) {
    case 'particles':
      return {
        value: AVOGADRO,
        name: "Avogadro's number",
        quantity: exact(AVOGADRO),
      };
    case 'L':
      return {
        value: STP_MOLAR_VOLUME_L,
        name: 'the molar volume of a gas at STP',
        quantity: measured(STP_MOLAR_VOLUME_L, STP_MOLAR_VOLUME_SIG_FIGS),
      };
    default:
      return {
        value: mmWanted,
        name: `the molar mass of ${wanted}`,
        quantity: measured(mmWanted, molarMass(wanted).sigFigs),
      };
  }
}

/* ------------------------------------------------------------------ */
/* The §6.3 guarantees                                                 */
/* ------------------------------------------------------------------ */

/** Every guarantee a generated problem must meet. */
export type Guarantee =
  | 'UNIQUE_BALANCE'
  | 'POSITIVE_COEFFICIENTS'
  | 'RATIO_NOT_ONE'
  | 'GIVEN_UNAMBIGUOUS'
  | 'ANSWER_SIG_FIGS_IN_RANGE'
  | 'QUANTITIES_PHYSICAL'
  | 'NO_ZERO_DENOMINATOR'
  | 'WHOLE_NUMBER_FRIENDLY_MOLAR_MASS'
  | 'DISTINCT_SPECIES'
  | 'LIMITING_MARGIN_MET'
  | 'LIMITING_NOT_DECIDABLE_BY_MASS'
  | 'YIELD_BELOW_THEORETICAL'
  | 'STABLE_ELEMENTS_ONLY'
  | 'MOLAR_MASSES_SEPARABLE'
  | 'YIELD_SEPARABLE'
  | 'OPERANDS_NOT_THE_ANSWER';

/**
 * Check a candidate problem against every §6.3 guarantee.
 *
 * PRECONDITION: none — a candidate that cannot even be solved comes back with
 * `UNIQUE_BALANCE` rather than throwing.
 *
 * Returns the guarantees it FAILS. An empty array means the problem is posable.
 */
export function checkGuarantees(problem: Problem): Guarantee[] {
  const failures: Guarantee[] = [];

  let solution: Solution;
  try {
    solution = solve(problem);
  } catch {
    return ['UNIQUE_BALANCE'];
  }

  if (solution.coefficients.some((c) => !Number.isInteger(c) || c < 1)) {
    failures.push('POSITIVE_COEFFICIENTS');
  }
  if (solution.ratio === 1) failures.push('RATIO_NOT_ONE');
  if (problem.givenIndex === problem.wantedIndex) failures.push('DISTINCT_SPECIES');
  if (problem.secondGivenIndex !== null) {
    if (problem.secondGivenIndex === problem.givenIndex) failures.push('DISTINCT_SPECIES');
    if (problem.secondGivenIndex === problem.wantedIndex) failures.push('DISTINCT_SPECIES');
  }

  for (const stated of [problem.given, problem.secondGiven, problem.actualYield]) {
    if (stated === null) continue;
    const parsed = parseQuantity(stated.text);
    if (parsed.kind !== 'measured' || parsed.reading.sigFigs !== stated.sigFigs) {
      failures.push('GIVEN_UNAMBIGUOUS');
    }
  }

  const answerSigFigs = reportableSigFigs(solution.finalQuantity);
  if (
    answerSigFigs === null ||
    answerSigFigs < MIN_ANSWER_SIG_FIGS ||
    answerSigFigs > MAX_ANSWER_SIG_FIGS ||
    answerSigFigs !== problem.answerSigFigs
  ) {
    failures.push('ANSWER_SIG_FIGS_IN_RANGE');
  }

  // Masses, moles and volumes have to sit in a range a classroom balance and a
  // gas syringe can show. A PARTICLE COUNT does not, and must not be held to
  // it: 1.4e24 particles is the correct answer to the question, not an absurd
  // one, and an earlier version of this check silently rejected every
  // MASS_TO_PARTICLES problem the generator drew — the tier looked healthy and
  // had quietly lost a whole problem kind.
  const bounded = [
    solution.mmGiven,
    solution.molGiven,
    solution.molWanted,
    problem.given.value,
  ];
  if (problem.wantedUnit !== 'particles') bounded.push(solution.converted, solution.finalValue);
  if (bounded.some((v) => !Number.isFinite(v) || Math.abs(v) < MIN_PHYSICAL_QUANTITY || Math.abs(v) > MAX_PHYSICAL_QUANTITY)) {
    failures.push('QUANTITIES_PHYSICAL');
  }
  if (problem.wantedUnit === 'particles' && !Number.isFinite(solution.converted)) {
    failures.push('QUANTITIES_PHYSICAL');
  }
  if (solution.mmGiven <= 0 || solution.mmWanted <= 0 || solution.convertFactor <= 0) {
    failures.push('NO_ZERO_DENOMINATOR');
  }

  if (problem.species.some((formula) => molarMass(formula).containsUnstable)) {
    failures.push('STABLE_ELEMENTS_ONLY');
  }

  if (problem.tier === 1) {
    const mm = solution.mmGiven;
    if (Math.abs(mm - Math.round(mm)) > WHOLE_NUMBER_FRIENDLY) {
      failures.push('WHOLE_NUMBER_FRIENDLY_MOLAR_MASS');
    }
  }

  // The given and the wanted substance must not weigh nearly the same per mole.
  // Where they do, "used the wrong molar mass at the end" moves the answer less
  // than rounding does, and the mole ratio taken from the MASSES is
  // indistinguishable from the 1:1 ratio of the unbalanced equation — so
  // E-CONV-FACTOR and E-ROUND-EARLY become one observable at S6, and
  // E-RATIO-MASS and E-RATIO-UNBALANCED become one at S4. §6.2 says fix the
  // decomposition rather than add a tiebreak; this is the fix. It does not
  // narrow what a class can be asked, it only refuses to POSE a problem whose
  // wrong answers cannot be told apart.
  if (!separable(solution.mmGiven, solution.mmWanted, problem.answerSigFigs)) {
    failures.push('MOLAR_MASSES_SEPARABLE');
  }

  // A STAGE MUST NOT BE SOLVABLE BY READING ONE OF ITS OWN OPERANDS. Where the
  // mole ratio happens to equal the moles it produces at the stated precision,
  // the worked lines for that step contain the step's answer — and so does the
  // student's own scratch paper. It is rare, about one problem in a thousand,
  // and refusing to pose it is a great deal cheaper than carving an exception
  // into the rule that remediation never shows the answer.
  const sf = problem.answerSigFigs;
  const operandClashes =
    !differsAt(solution.ratio, solution.molWanted, sf) ||
    !differsAt(solution.mmGiven, solution.molGiven, sf) ||
    !differsAt(problem.given.value, solution.molGiven, sf) ||
    !differsAt(solution.convertFactor, solution.converted, sf) ||
    !differsAt(solution.molWanted, solution.converted, sf) ||
    (solution.percentYield !== null &&
      (!differsAt(solution.theoretical as number, solution.percentYield, sf) ||
        !differsAt((problem.actualYield as StatedQuantity).value, solution.percentYield, sf)));

  // The second reactant's chain has the same requirement, and it is NOT covered
  // by RATIO_NOT_ONE — that guarantee is about the given reactant's ratio only,
  // so a second reactant sitting at 1:1 slipped through and S4b's own operand
  // was its own answer.
  const secondClashes =
    solution.molSecond !== null &&
    (!differsAt(solution.ratioSecond as number, 1, sf) ||
      !differsAt(solution.molSecond, solution.molWantedFromSecond as number, sf) ||
      !differsAt(solution.mmSecond as number, solution.molSecond, sf) ||
      !differsAt((problem.secondGiven as StatedQuantity).value, solution.molSecond, sf) ||
      !differsAt(solution.ratioSecond as number, solution.molWantedFromSecond as number, sf));

  // AND NO STAGE ANSWER MAY BE 1. Every unit-fraction explanation the app can
  // show is built on the literal `1` — "× (1 mol / 46.07 g)" — so a stage whose
  // answer rounds to 1 has that answer printed in its own remediation, and no
  // amount of care about computed values changes it. It is the ONLY bare
  // literal in any of the remediation templates, which is what makes this a
  // closed rule rather than the next round of the same game.
  const stageAnswers = [
    solution.molGiven,
    solution.molWanted,
    solution.converted,
    solution.molSecond,
    solution.molWantedFromSecond,
    solution.percentYield,
  ].filter((value): value is number => value !== null);
  const anAnswerIsOne = stageAnswers.some((value) => !differsAt(value, 1, sf));

  if (operandClashes || secondClashes || anAnswerIsOne) failures.push('OPERANDS_NOT_THE_ANSWER');

  if (problem.kind === 'LIMITING_REAGENT') {
    const fromFirst = solution.molGiven * solution.ratio;
    const fromSecond = solution.molWantedFromSecond as number;
    const spread = Math.abs(fromFirst - fromSecond) / Math.max(fromFirst, fromSecond);
    // Two conditions, and they say different things. LIMITING_MARGIN is about
    // chemistry — two reactants within a hair of each other make the comparison
    // a coin toss. The separability condition is about the taxonomy: the yield
    // the OTHER reactant would have given has to be a different number at the
    // precision the student writes, or E-LIM-WRONG cannot be told from having
    // rounded early.
    if (!(spread >= LIMITING_MARGIN) || !separable(fromFirst, fromSecond, problem.answerSigFigs)) {
      failures.push('LIMITING_MARGIN_MET');
    }

    // A student who compares MASSES rather than moles must get it WRONG, or
    // E-LIM-BYMASS predicts the right answer and the stage cannot see the
    // error it exists to catch.
    const firstMass = problem.given.value;
    const secondMass = (problem.secondGiven as StatedQuantity).value;
    const lighterIndex = firstMass <= secondMass ? problem.givenIndex : (problem.secondGivenIndex as number);
    if (lighterIndex === solution.limitingIndex) failures.push('LIMITING_NOT_DECIDABLE_BY_MASS');
  }

  if (problem.kind === 'PERCENT_YIELD') {
    const actual = (problem.actualYield as StatedQuantity).value;
    if (!(actual > 0 && actual < (solution.theoretical as number))) {
      failures.push('YIELD_BELOW_THEORETICAL');
    }
    // A yield near 100% makes the upside-down fraction land on the right answer:
    // 100/y and y meet at y = 100. Keep them apart at the stated precision.
    const percent = solution.percentYield as number;
    if (!separable(percent, 10000 / percent, problem.answerSigFigs)) {
      failures.push('YIELD_SEPARABLE');
    }
  }

  return failures;
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

/**
 * True where two values are simply DIFFERENT numbers at this precision — no
 * margin, unlike {@link separable}. Used where the requirement is only that a
 * student could not read one off in place of the other.
 *
 * PRECONDITION: `sigFigs` is a positive integer.
 */
function differsAt(a: number, b: number, sigFigs: number): boolean {
  return roundToSigFigs(a, sigFigs) !== roundToSigFigs(b, sigFigs);
}

/**
 * True where two values are far enough apart that a student writing
 * `sigFigs` figures would write different numbers for them, with room to spare.
 *
 * PRECONDITION: `sigFigs` is a positive integer.
 */
function separable(a: number, b: number, sigFigs: number): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return a !== b;
  return Math.abs(a - b) / scale >= CONVERSION_SEPARATION_ULPS * 10 ** (1 - sigFigs);
}

/** Write a quantity the way a student will read it, with no ambiguity. */
function stateQuantity(value: number, sigFigs: number, unit: Unit): StatedQuantity {
  const rounded = roundToSigFigs(value, sigFigs);
  const text = formatUnambiguous(rounded, sigFigs);
  return { value: Number(text.replace(/\.$/, '')), unit, sigFigs, text };
}

function promptFor(problem: Omit<Problem, 'prompt'>): string {
  const given = problem.species[problem.givenIndex] as string;
  const wanted = problem.species[problem.wantedIndex] as string;
  const unitWord =
    problem.wantedUnit === 'particles'
      ? 'how many particles'
      : problem.wantedUnit === 'L'
        ? 'what volume in litres at STP'
        : 'what mass in grams';

  if (problem.kind === 'LIMITING_REAGENT') {
    const second = problem.species[problem.secondGivenIndex as number] as string;
    const secondText = (problem.secondGiven as StatedQuantity).text;
    return `${problem.given.text} g of ${given} reacts with ${secondText} g of ${second}. Work out which reactant runs out first, and ${unitWord} of ${wanted} that makes.`;
  }
  if (problem.kind === 'PERCENT_YIELD') {
    const actualText = (problem.actualYield as StatedQuantity).text;
    return `${problem.given.text} g of ${given} reacts. The reaction recovers ${actualText} g of ${wanted}. What is the percent yield?`;
  }
  return `${problem.given.text} g of ${given} reacts. ${unitWord[0]?.toUpperCase()}${unitWord.slice(1)} of ${wanted} does it make?`;
}

/** Pick a mass that reads unambiguously at the significant figures asked for. */
function drawMass(rng: Rng, sigFigs: number): StatedQuantity {
  // Draw the digits, then place the decimal point so the value sits in a range
  // a classroom balance would show.
  const digits = nextInt(rng, 10 ** (sigFigs - 1), 10 ** sigFigs - 1);
  const scale = pick(rng, [0.01, 0.1, 1]);
  return stateQuantity(digits * scale, sigFigs, 'g');
}

interface Draw {
  readonly reaction: Reaction;
  readonly species: readonly string[];
  readonly reactantCount: number;
}

function drawReaction(rng: Rng, pool: readonly Reaction[]): Draw {
  const reaction = pick(rng, pool);
  const equation = parseEquation(reaction.equation);
  return {
    reaction,
    species: equation.species.map((s) => s.source.trim()),
    reactantCount: equation.reactants.length,
  };
}

/** The tiers this build generates, and what each draws from. */
export const TIERS: readonly number[] = [1, 2, 3, 4];

function poolForTier(tier: number): readonly Reaction[] {
  if (tier === 2) return REACTIONS;
  if (tier === 3) return TWO_REACTANT_REACTIONS;
  if (tier === 4) return TWO_REACTANT_REACTIONS;
  return REACTIONS.filter((r) => !HYDRATE_REACTIONS.includes(r));
}

/**
 * Generate the problem at (assignmentKey, tier, index).
 *
 * PRECONDITION: `tier` is in {@link TIERS} and `index` is a non-negative
 * integer. The result is a pure function of the three: no clock, no storage, no
 * device state.
 *
 * THROWS {@link GenerationError} if no draw meets every §6.3 guarantee within
 * {@link MAX_GENERATION_ATTEMPTS}. That is a generator defect and it is loud on
 * purpose — a problem that quietly falls back to a looser rule is a problem
 * whose answer a student cannot be marked against.
 */
export function generateProblem(assignmentKey: string, tier: number, index: number): Problem {
  const seed = `${assignmentKey}|${tier}|${index}`;
  const rng = makeRng(seed);
  const pool = poolForTier(tier);
  let lastFailures: readonly string[] = [];

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const draw = drawReaction(rng, pool);
    const { species, reactantCount } = draw;
    const productStart = reactantCount;

    const givenIndex = nextInt(rng, 0, reactantCount - 1);
    const wantedIndex = nextInt(rng, productStart, species.length - 1);
    const givenSigFigs = nextInt(rng, MIN_ANSWER_SIG_FIGS, MAX_ANSWER_SIG_FIGS);
    const given = drawMass(rng, givenSigFigs);

    let kind: ProblemKind;
    let wantedUnit: Unit;
    let secondGivenIndex: number | null = null;
    let secondGiven: StatedQuantity | null = null;
    let actualYield: StatedQuantity | null = null;

    if (tier === 3) {
      kind = 'LIMITING_REAGENT';
      wantedUnit = 'g';
      const others: number[] = [];
      for (let i = 0; i < reactantCount; i += 1) if (i !== givenIndex) others.push(i);
      if (others.length === 0) continue;
      secondGivenIndex = pick(rng, others);
      secondGiven = drawMass(rng, nextInt(rng, MIN_ANSWER_SIG_FIGS, MAX_ANSWER_SIG_FIGS));
    } else if (tier === 4) {
      kind = 'PERCENT_YIELD';
      wantedUnit = 'g';
    } else if (tier === 2) {
      const wanted = species[wantedIndex] as string;
      kind = GASES.has(wanted) && nextInt(rng, 0, 1) === 1 ? 'MASS_TO_VOLUME' : 'MASS_TO_PARTICLES';
      wantedUnit = kind === 'MASS_TO_VOLUME' ? 'L' : 'particles';
    } else {
      kind = 'MASS_TO_MASS';
      wantedUnit = 'g';
    }

    const skeleton: Omit<Problem, 'prompt' | 'answerSigFigs'> = {
      assignmentKey,
      tier,
      index,
      kind,
      reactionId: draw.reaction.id,
      equation: draw.reaction.equation,
      species,
      reactantCount,
      givenIndex,
      given,
      secondGivenIndex,
      secondGiven,
      wantedIndex,
      wantedUnit,
      actualYield,
    };

    // The answer's precision falls out of the chain, so it has to be measured
    // before it can be stated. A first solve gives it; the guarantees then
    // check the stated value against a second, complete solve.
    let answerSigFigs: number;
    let probe: Problem;
    try {
      probe = { ...skeleton, answerSigFigs: MIN_ANSWER_SIG_FIGS, prompt: '' };
      const probed = reportableSigFigs(solve(probe).finalQuantity);
      if (probed === null) {
        lastFailures = ['ANSWER_SIG_FIGS_IN_RANGE'];
        continue;
      }
      answerSigFigs = probed;
    } catch {
      lastFailures = ['UNIQUE_BALANCE'];
      continue;
    }

    if (tier === 4) {
      // A yield between 55% and 95% of theoretical: high enough to be a real
      // reaction, low enough that the student cannot guess "about all of it".
      const theoretical = solve({ ...skeleton, answerSigFigs, prompt: '' }).converted;
      const fraction = nextInt(rng, 55, 95) / 100;
      actualYield = stateQuantity(theoretical * fraction, nextInt(rng, MIN_ANSWER_SIG_FIGS, MAX_ANSWER_SIG_FIGS), 'g');
    }

    const withYield = { ...skeleton, actualYield };
    let finalSigFigs: number;
    try {
      const probed = reportableSigFigs(solve({ ...withYield, answerSigFigs, prompt: '' }).finalQuantity);
      if (probed === null) {
        lastFailures = ['ANSWER_SIG_FIGS_IN_RANGE'];
        continue;
      }
      finalSigFigs = probed;
    } catch {
      lastFailures = ['UNIQUE_BALANCE'];
      continue;
    }

    const candidate: Problem = {
      ...withYield,
      answerSigFigs: finalSigFigs,
      prompt: promptFor({ ...withYield, answerSigFigs: finalSigFigs }),
    };

    const failures = checkGuarantees(candidate);
    if (failures.length === 0) return candidate;
    lastFailures = failures;
  }

  throw new GenerationError(seed, MAX_GENERATION_ATTEMPTS, lastFailures);
}

/**
 * Generate a whole problem set.
 *
 * PRECONDITION: `count` is a non-negative integer. Index `i` is always the same
 * problem for the same key and tier, so a set can be extended without moving
 * anything a class has already worked.
 */
export function generateSet(assignmentKey: string, tier: number, count: number): Problem[] {
  const out: Problem[] = [];
  for (let i = 0; i < count; i += 1) out.push(generateProblem(assignmentKey, tier, i));
  return out;
}
