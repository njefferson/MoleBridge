/**
 * tolerance.ts — every numeric tolerance in the engine, named.
 *
 * §11 of the specification: no inline literals. A tolerance buried in an
 * expression is a decision nobody can find later, and every one of these
 * encodes a judgement about what a student meant.
 *
 * PURE data. No I/O, no globals, no clock.
 */

/**
 * Float slop allowed after both sides have been rounded to the same number of
 * significant figures. This is not a grading tolerance — it exists because
 * 0.1 + 0.2 is not 0.3 — so it is as tight as the arithmetic permits.
 */
export const FLOAT_SLOP_RELATIVE = 1e-9;

/**
 * How far apart two candidate values must be before the classifier will treat
 * them as telling different stories. Predictions closer than this at the
 * student's own precision are INDISTINGUISHABLE, and the classifier says so
 * rather than picking one.
 */
export const DISTINGUISHABLE_RELATIVE = 1e-6;

/**
 * §6.2's cutoff: an unmatched entry within one order of magnitude of correct is
 * an arithmetic slip; beyond that it is E-UNCLASSIFIED and is COUNTED, because
 * the unclassified rate is the metric that says the taxonomy needs work.
 */
export const ORDER_OF_MAGNITUDE_LIMIT = 1;

/**
 * §7 asks for the A4 (scientific notation) branch on "E-ARITH with
 * |log10 error| >= 1". Taken literally that never fires: §6.2 has already
 * reclassified anything that far out as E-UNCLASSIFIED, so the two thresholds
 * would have to be the same number and A4 would be dead code.
 *
 * The intent behind A4 is legible enough — it is the magnitude-checking
 * remediation, for a student whose answer is the right shape and the wrong
 * size. So the branch fires on an arithmetic slip bigger than about a factor
 * of three, which is a decimal-place mistake rather than a miscount, and stops
 * where E-UNCLASSIFIED begins. Stated here rather than silently chosen.
 */
export const SCINOT_TRIGGER_LOG10 = 0.5;

/** How close to an integer a molar mass must be to count as whole-number-friendly. */
export const WHOLE_NUMBER_FRIENDLY = 0.2;

/** §6.3: final answers carry between this many significant figures... */
export const MIN_ANSWER_SIG_FIGS = 2;
/** ...and this many. */
export const MAX_ANSWER_SIG_FIGS = 4;

/** §6.3: nothing physically absurd. The smallest quantity a problem may state or ask for. */
export const MIN_PHYSICAL_QUANTITY = 1e-3;
/** The largest. */
export const MAX_PHYSICAL_QUANTITY = 1e4;

/**
 * In a limiting-reagent problem the two reactants must differ in what they
 * could yield by at least this fraction. Two reactants within a hair of each
 * other make the comparison stage a coin toss rather than a measurement, and
 * a student who got it right would have got it right by luck.
 */
export const LIMITING_MARGIN = 0.05;

/** How many PRNG draws a generator may reject before it admits it is stuck. */
export const MAX_GENERATION_ATTEMPTS = 400;

/**
 * How far apart, in units of the answer's last significant digit, the correct
 * conversion factor and the wrong one must sit.
 *
 * §6.2 says a wrong value consistent with two classes means the DECOMPOSITION
 * is wrong, and forbids a tiebreak. This is that fix rather than a tiebreak.
 * Where the given and the wanted substance have nearly the same molar mass,
 * "used the wrong molar mass at the end" produces almost the same number as
 * "rounded an intermediate", and at two significant figures the same number
 * exactly — so E-CONV-FACTOR and E-ROUND-EARLY become one observable. The
 * generator therefore does not POSE such a problem. Found by scanning 200
 * generated problems for collisions: two, both of this shape, both where the
 * two molar masses were within one percent of each other.
 */
export const CONVERSION_SEPARATION_ULPS = 3;
