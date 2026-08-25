/**
 * reference.ts — one page per thing that can go wrong, in the student's words.
 *
 * ## Why this is a surface at all
 *
 * Attribution is this app's whole thesis: it does not mark an answer wrong, it
 * says WHICH mistake produced that exact number. That is worth nothing if the
 * sentence it produces is the last word. A student who reads "the ratio is
 * upside down" and does not already know what the ratio is has been told the
 * name of their problem and nothing else.
 *
 * So every error class the engine can attribute has an entry here, and the
 * message that produced it links to it. Twenty entries, one per class, and a
 * test holds that count to `ERROR_CLASSES` in both directions — a class with no
 * entry is a dead end, and an entry for a class that no longer exists is a page
 * nobody can reach.
 *
 * ## NOTHING HERE IS A VALUE
 *
 * The entries are about procedure — what the mistake IS, how to spot it in your
 * own working, what to do instead. Never a number from a problem, because this
 * screen is reachable at any time including mid-step, and the rule that the
 * correct answer is never shown before the attempt does not get an exception
 * for the help page.
 *
 * ## THE LESSON LINK IS DERIVED, NOT TYPED
 *
 * `Lesson.answers` already declares which classes each lesson is the answer to.
 * Writing the reverse edge by hand here would be the same fact in two places,
 * and the two would part company the first time a lesson's coverage changed.
 * `lessonForClass` reads it off `LESSONS`.
 */

import { ERROR_CLASSES, type ErrorClass } from '../engine/taxonomy.ts';
import { LESSONS } from './lessons.ts';

export interface ReferenceEntry {
  readonly id: ErrorClass;
  /** What to call it, in words a fifteen-year-old would use. */
  readonly called: string;
  /** What actually happened, said plainly. */
  readonly what: string;
  /** How to catch it in your own working, before anything marks it. */
  readonly tell: string;
  /** What to do instead. */
  readonly fix: string;
}

/**
 * Every class the engine can attribute. In the order a student meets them,
 * which is the order the stages run rather than alphabetical.
 */
export const REFERENCE: readonly ReferenceEntry[] = [
  {
    id: 'E-BAL-UNBALANCED',
    called: 'The equation does not balance',
    what: 'At least one element has a different number of atoms on the two sides.',
    tell: 'Count one element at a time, left and right. The first one that does not match is the one to fix.',
    fix: 'Change the numbers in FRONT of the formulas until every element matches. Work through the elements that appear in only one substance on each side first — they have the fewest ways to go.',
  },
  {
    id: 'E-BAL-NOTLOWEST',
    called: 'Balanced, but not in lowest terms',
    what: 'Every element matches, so the equation is balanced — but all the coefficients share a common factor.',
    tell: 'Look at your set of numbers. If they can all be divided by the same whole number, they are not the lowest set.',
    fix: 'Divide the whole set through by that factor. 2, 4, 2, 6 is 1, 2, 1, 3.',
  },
  {
    id: 'E-BAL-SUBSCRIPT',
    called: 'A subscript was changed',
    what: 'The numbers given balance a different equation — one where a small number inside a formula had been altered.',
    tell: 'Compare your formulas with the ones you were given, character by character. H2O and H2O2 are different substances.',
    fix: 'Only the numbers in front may move. A subscript is part of what the substance IS — changing it turns water into hydrogen peroxide, which is a different reaction.',
  },
  {
    id: 'E-MM-PARSE',
    called: 'The formula was read wrong',
    what: 'A molar mass built from a different set of atoms than the formula actually names.',
    tell: 'Write the atom count out before you add anything: Ca 1, O 2, H 2. Then check each one against the formula.',
    fix: 'A subscript applies to the atom immediately before it, and a subscript after a bracket multiplies everything inside the bracket. No subscript means one.',
  },
  {
    id: 'E-MM-HYDRATE',
    called: 'The water of hydration was left out',
    what: 'The molar mass is right for the substance before the dot, and the waters after it were not counted.',
    tell: 'A dot in the middle of a formula means there is more to weigh. CuSO4·5H2O weighs more than CuSO4.',
    fix: 'Add the mass of every water. Five waters is five times 18.02 g/mol on top of what you already have.',
  },
  {
    id: 'E-MM-ARITH',
    called: 'The molar mass adds up wrong',
    what: 'The right atoms were counted and the arithmetic came out wrong.',
    tell: 'Add the columns twice, in a different order the second time. A slip does not usually repeat.',
    fix: 'Multiply each element’s atomic weight by how many of that atom there are, then add. Keep the whole run in the calculator rather than writing intermediate sums down.',
  },
  {
    id: 'E-MOL-INVERTED',
    called: 'Multiplied by the molar mass instead of divided',
    what: 'Grams were multiplied by grams-per-mole.',
    tell: 'Cancel the units. Grams times grams-per-mole leaves grams squared per mole, which is not a thing.',
    fix: 'Moles are grams DIVIDED by grams per mole, because the grams cancel and moles are what is left.',
  },
  {
    id: 'E-MOL-GRAMS',
    called: 'The grams were carried through as moles',
    what: 'The mass was used where the number of moles was needed.',
    tell: 'Say the unit out loud with the number. If the step asks for moles and you are holding a mass, the conversion has not happened yet.',
    fix: 'Convert to moles first, then do the step. Every mole ratio acts on moles and on nothing else.',
  },
  {
    id: 'E-RATIO-INVERTED',
    called: 'The mole ratio is upside down',
    what: 'The ratio was applied the other way up.',
    tell: 'Write it as a fraction with units — mol wanted over mol given. The unit you are holding has to be on the BOTTOM so it cancels.',
    fix: 'The wanted substance’s coefficient goes on top; the one you are converting from goes underneath.',
  },
  {
    id: 'E-RATIO-MASS',
    called: 'The ratio came from the masses',
    what: 'The two molar masses were divided to get the ratio.',
    tell: 'A mole ratio is always a ratio of small whole numbers, because coefficients are whole numbers. 2.31 is not one.',
    fix: 'Read the ratio off the balanced equation. The molar masses do the grams-to-moles conversion and take no part in the ratio.',
  },
  {
    id: 'E-RATIO-UNBALANCED',
    called: 'The ratio came from the unbalanced equation',
    what: 'The coefficients used were the ones in the equation as it was written, before balancing.',
    tell: 'If a substance has no number in front of it, its coefficient is one — and if the equation is not balanced yet, that one is probably wrong.',
    fix: 'Balance first, always, and take the ratio from the balanced version. Every number downstream depends on it.',
  },
  {
    id: 'E-LIM-WRONG',
    called: 'The wrong reactant was followed through',
    what: 'The amount worked out is what the reactant that does NOT run out could have made.',
    tell: 'Both reactants give you a number. The reaction stops at the SMALLER of the two, because that is the one that runs out.',
    fix: 'Work out how much product each reactant could make on its own, then take the smaller answer. That reactant is the limiting one.',
  },
  {
    id: 'E-LIM-BYMASS',
    called: 'The limiting reactant was picked by mass',
    what: 'The reactant with the smaller number of grams was chosen.',
    tell: 'Grams are not comparable across substances — a mole of one thing can weigh ten times a mole of another.',
    fix: 'Convert both to moles, then compare against the equation’s ratio. Whichever runs out first is limiting, whatever it weighs.',
  },
  {
    id: 'E-CONV-FACTOR',
    called: 'The conversion factor is wrong',
    what: 'The right operation with the wrong number in it.',
    tell: 'Ask what the factor IS before you use it: 22.4 L per mole at STP, 100 for a percentage, 6.022 × 10²³ for particles.',
    fix: 'Write the factor with its units before you multiply. If the units do not cancel to what the question asked for, the factor is wrong.',
  },
  {
    id: 'E-CONV-INVERTED',
    called: 'The conversion is the wrong way round',
    what: 'Divided where the step multiplies, or multiplied where it divides.',
    tell: 'Sanity-check the size. Going from moles to litres at STP the number gets much bigger; going the other way it gets much smaller.',
    fix: 'Set the factor up as a fraction with the unit you are holding underneath. Then there is only one way it can go.',
  },
  {
    id: 'E-SIG-FIGS',
    called: 'The right value, the wrong number of figures',
    what: 'The arithmetic is right and the answer is written to a different precision than the question supports.',
    tell: 'Count the significant figures in the measurement you were GIVEN. Your answer gets that many.',
    fix: 'Round at the end, to the fewest significant figures any measurement in the question had. If trailing zeros make it ambiguous, write a decimal point or use scientific notation.',
  },
  {
    id: 'E-ROUND-EARLY',
    called: 'Rounded too early',
    what: 'An intermediate value was rounded and the rounding was then multiplied through the rest of the working.',
    tell: 'The answer is close but not close enough — usually out in the third or fourth figure.',
    fix: 'Keep the full value in the calculator all the way through. Round ONCE, at the answer.',
  },
  {
    id: 'E-ARITH',
    called: 'A slip in the arithmetic',
    what: 'The method is right and a calculation came out wrong.',
    tell: 'Estimate first. If the answer should be about 3 and the screen says 47, something was mistyped.',
    fix: 'Redo the step without looking at the previous answer, then compare the two.',
  },
  {
    id: 'E-UNIT-MISSING',
    called: 'The number is right, the unit is missing or wrong',
    what: 'The value is correct and it was not labelled — or it was labelled with something else.',
    tell: 'Every quantity in chemistry is a number AND a unit. A bare number does not say what it is.',
    fix: 'Write the unit the step asked for. It is not decoration: it is what makes the next step’s cancelling work.',
  },
  {
    id: 'E-UNCLASSIFIED',
    called: 'MoleBridge could not work out what happened',
    what: 'The answer does not match anything MoleBridge knows how to explain — often it is out by a factor of ten, or it is not a number it can read.',
    tell: 'Check the obvious things first: a decimal point in the wrong place, a missing digit, or something typed into the wrong box.',
    fix: 'Work the step again from the beginning rather than looking for the slip. If it keeps happening on the same step, that is worth reporting with the ⚑ button — it means the explanations have a gap.',
  },
];

/** The entry for a class. Every class has one; the test is what makes that true. */
export function entryFor(id: ErrorClass): ReferenceEntry | undefined {
  return REFERENCE.find((entry) => entry.id === id);
}

/**
 * Which lessons teach the thing this error is about, as indices into `LESSONS`.
 * Empty where no lesson claims it.
 *
 * DERIVED FROM `Lesson.answers` rather than written here, so the two directions
 * of the same relation cannot disagree. Three classes are deliberately claimed
 * by no lesson — a slip in the arithmetic, a missing unit and an unexplained
 * answer are not a concept anything can teach.
 *
 * PLURAL, AND THAT IS THE CORRECTION. The first version returned the first
 * match, which is a lie the moment two lessons legitimately claim the same
 * class: a conversion applied upside down is taught by "Litres, particles and
 * other units" AND by "Percent yield", and which one a particular student needs
 * depends on the step they were on, which this cannot know. Showing both routes
 * is honest; picking one by array order is a coin toss wearing a suit.
 */
export function lessonsForClass(id: ErrorClass): readonly number[] {
  const out: number[] = [];
  for (const [at, lesson] of LESSONS.entries()) if (lesson.answers.includes(id)) out.push(at);
  return out;
}

/** Every class, in the reference's order, for anything that needs to walk them. */
export const REFERENCED_CLASSES: readonly ErrorClass[] = REFERENCE.map((entry) => entry.id);

/** Exported so the test can hold the two lists together rather than restating one. */
export { ERROR_CLASSES };
