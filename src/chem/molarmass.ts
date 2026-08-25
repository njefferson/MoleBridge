/**
 * molarmass.ts — molar mass, with the precision that comes with it.
 *
 * TWO PRECISION ANSWERS, BOTH REPORTED, because they disagree and the
 * disagreement is real. A molar mass is a SUM, so the arithmetic rule that
 * governs it is addition's — the coarsest decimal place among the contributing
 * weights. The project specification asks instead for the fewest significant
 * figures among the contributing elements. For water those give 18.015 and
 * 18.02 respectively, and a grader that quietly picked one would mark the other
 * wrong. So this returns `sigFigs` (the specified rule, and the one the rest of
 * the engine uses) alongside `additionRuleSigFigs`, and names the element that
 * set each. Nothing here decides which a teacher marks against; §6.2's
 * E-SIG-FIGS class is where that decision belongs.
 *
 * HYDRATE WATER IS INCLUDED in `value`, and broken out separately, because
 * leaving it out is its own error class (E-MM-HYDRATE) and the classifier has
 * to be able to predict exactly the number a student who forgot it would write.
 *
 * PURE. No I/O, no globals, no clock.
 */

import { elementBySymbol } from './elements.ts';
import { parseFormula, type ParsedFormula, type ParseOptions } from './formula.ts';
import { lastPlaceOf, sigFigsFrom, type Quantity } from './sigfig.ts';

/** A molar mass and everything that constrains it. */
export interface MolarMass {
  /** The formula it was computed from. */
  readonly formula: ParsedFormula;
  /** Grams per mole for one formula unit, at full precision, never rounded. */
  readonly value: number;
  /** Significant figures, by the specified least-precise-element rule. */
  readonly sigFigs: number;
  /** The element symbol whose published weight set `sigFigs`. */
  readonly limitingElement: string;
  /** Significant figures by the addition rule, for comparison. */
  readonly additionRuleSigFigs: number;
  /** The element symbol whose published weight set `additionRuleSigFigs`. */
  readonly additionLimitingElement: string;
  /** Grams per mole of the first segment alone — the anhydrous compound. */
  readonly anhydrousValue: number;
  /** Grams per mole contributed by hydrate segments. Zero where there are none. */
  readonly hydrateValue: number;
  /** True where any contributing element has no stable isotope. */
  readonly containsUnstable: boolean;
  /** `value` carried as a quantity at `sigFigs` precision. */
  readonly quantity: Quantity;
}

/** Thrown when a formula names something the element table does not have. */
export class MolarMassError extends Error {
  readonly symbol: string;

  constructor(symbol: string) {
    super(`no element data for "${symbol}"`);
    this.name = 'MolarMassError';
    this.symbol = symbol;
  }
}

function sumWeights(counts: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const [symbol, count] of counts) {
    const element = elementBySymbol(symbol);
    if (element === undefined) throw new MolarMassError(symbol);
    total += element.weight * count;
  }
  return total;
}

/**
 * Compute the molar mass of a parsed formula.
 *
 * PRECONDITION: every symbol in `formula.counts` is in the element table —
 * guaranteed for anything {@link parseFormula} returned, since the parser
 * rejects unknown symbols. The formula's leading coefficient is IGNORED: a
 * molar mass is a property of the substance, not of how many of it a balanced
 * equation calls for.
 *
 * THROWS {@link MolarMassError} for a hand-built count map naming an unknown
 * element.
 */
export function molarMassOfParsed(formula: ParsedFormula): MolarMass {
  const value = sumWeights(formula.counts);
  const anhydrousValue = sumWeights(formula.anhydrousCounts);

  let sigFigs = Infinity;
  let limitingElement = '';
  let lastPlace = -Infinity;
  let additionLimitingElement = '';
  let containsUnstable = false;

  for (const symbol of formula.counts.keys()) {
    const element = elementBySymbol(symbol);
    if (element === undefined) throw new MolarMassError(symbol);
    if (element.noStableIsotope) containsUnstable = true;
    if (element.sigFigs < sigFigs) {
      sigFigs = element.sigFigs;
      limitingElement = symbol;
    }
    const place = lastPlaceOf(element.weight, element.sigFigs);
    if (place > lastPlace) {
      lastPlace = place;
      additionLimitingElement = symbol;
    }
  }

  const resolvedSigFigs = sigFigs === Infinity ? 1 : sigFigs;
  return {
    formula,
    value,
    sigFigs: resolvedSigFigs,
    limitingElement,
    additionRuleSigFigs: sigFigsFrom(value, lastPlace === -Infinity ? 0 : lastPlace),
    additionLimitingElement,
    anhydrousValue,
    hydrateValue: value - anhydrousValue,
    containsUnstable,
    quantity: {
      kind: 'measured',
      value,
      reading: { sigFigs: resolvedSigFigs, lastPlace: lastPlaceOf(value, resolvedSigFigs) },
    },
  };
}

/**
 * Parse a formula and compute its molar mass in one step.
 *
 * PRECONDITION: `text` is a single species. Rejections come back as the
 * parser's own {@link import('./formula.ts').FormulaError}, offset and all.
 */
export function molarMass(text: string, options: ParseOptions = {}): MolarMass {
  return molarMassOfParsed(parseFormula(text, options));
}
