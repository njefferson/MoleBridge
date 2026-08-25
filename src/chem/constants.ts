/**
 * constants.ts — the physical constants this engine uses, and how exact each is.
 *
 * The distinction matters to the sig-fig engine: an exact value never limits an
 * answer's precision, and a conventional one does. Getting that wrong marks a
 * student down for the constant rather than for their work.
 *
 * PURE data. No I/O, no globals, no clock.
 */

/**
 * The Avogadro constant, in mol^-1.
 *
 * EXACT. Since the 2019 redefinition of the SI base units the mole is DEFINED
 * as exactly 6.02214076e23 elementary entities, so this is a definition and not
 * a measurement, and per §5.5 it does not limit significant figures.
 */
export const AVOGADRO = 6.02214076e23;

/**
 * Molar volume of an ideal gas at STP, in L/mol.
 *
 * NOT EXACT, and not a constant of nature — it is the conventional classroom
 * value at 0 °C and 1 atm, carried to three significant figures, and it DOES
 * limit an answer. A class using 22.7 L/mol (0 °C, 1 bar, the current IUPAC
 * definition of STP) would need this changed and the change would move every
 * volume answer; it is stated here rather than written into a formula so that
 * is one edit.
 */
export const STP_MOLAR_VOLUME_L = 22.4;

/** Significant figures in {@link STP_MOLAR_VOLUME_L}. */
export const STP_MOLAR_VOLUME_SIG_FIGS = 3;
