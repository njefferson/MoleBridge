/**
 * elements.ts — the periodic table, embedded.
 *
 * SOURCE. IUPAC Commission on Isotopic Abundances and Atomic Weights (CIAAW),
 * "Standard Atomic Weights of the Elements 2021", Pure and Applied Chemistry
 * 94(5) 573-600 (2022). Revision as published; no later table has been applied.
 * The values here are the ones a chemistry textbook computes molar masses from.
 *
 * WHY THE DIGITS LOOK UNEVEN, and why that is correct rather than sloppy.
 * CIAAW publishes two different kinds of number and this file carries both
 * without flattening them:
 *
 *   - For an element whose isotopic composition is effectively fixed in nature,
 *     the standard atomic weight is a single measured value with an
 *     uncertainty, and it is published to as many digits as the measurement
 *     supports: sodium is 22.98976928, ten significant figures.
 *   - For an element whose composition VARIES between natural sources, CIAAW
 *     publishes an interval rather than a value, and alongside it a
 *     CONVENTIONAL atomic weight for people who need one number. Hydrogen's
 *     interval is [1.00784, 1.00811] and its conventional weight is 1.008 —
 *     four significant figures, on purpose, because a fifth would be claiming
 *     the sample is known.
 *
 * So `sigFigs` is a fact about the published value, not a formatting choice,
 * and `weight` is never rounded here. Writing 1.00800 for hydrogen to make the
 * column tidy would be inventing a measurement, which is exactly what the
 * downstream sig-fig engine exists to stop the student doing.
 *
 * ELEMENTS WITH NO STABLE ISOTOPE carry `noStableIsotope: true`. For those,
 * `weight` is not an atomic weight at all — it is the MASS NUMBER of the
 * longest-lived or best-characterised isotope, which CIAAW prints in square
 * brackets. Their `sigFigs` is the digit count of that mass number and is
 * nominal. Any molar mass computed through one of them is flagged by
 * `molarMass`, because a student answer built on [98] is not a measurement.
 *
 * PURE DATA. No I/O, no globals, no dates.
 */

/** One element as CIAAW publishes it. */
export interface Element {
  /** Atomic number, 1-118. */
  readonly z: number;
  /** IUPAC symbol, case as written (first letter upper, rest lower). */
  readonly symbol: string;
  /** IUPAC English name. */
  readonly name: string;
  /**
   * Standard atomic weight in g/mol, or — where `noStableIsotope` is true —
   * the mass number of the reference isotope. Never rounded in this file.
   */
  readonly weight: number;
  /** Significant figures actually published for `weight`. */
  readonly sigFigs: number;
  /** True where CIAAW brackets the value because no isotope is stable. */
  readonly noStableIsotope: boolean;
}

/* z, symbol, name, weight, sigFigs, noStableIsotope */
type Row = readonly [number, string, string, number, number, boolean];

const ROWS: readonly Row[] = [
  [1, 'H', 'hydrogen', 1.008, 4, false],
  [2, 'He', 'helium', 4.002602, 7, false],
  [3, 'Li', 'lithium', 6.94, 3, false],
  [4, 'Be', 'beryllium', 9.0121831, 8, false],
  [5, 'B', 'boron', 10.81, 4, false],
  [6, 'C', 'carbon', 12.011, 5, false],
  [7, 'N', 'nitrogen', 14.007, 5, false],
  [8, 'O', 'oxygen', 15.999, 5, false],
  [9, 'F', 'fluorine', 18.998403162, 11, false],
  [10, 'Ne', 'neon', 20.1797, 6, false],
  [11, 'Na', 'sodium', 22.98976928, 10, false],
  [12, 'Mg', 'magnesium', 24.305, 5, false],
  [13, 'Al', 'aluminium', 26.9815384, 9, false],
  [14, 'Si', 'silicon', 28.085, 5, false],
  [15, 'P', 'phosphorus', 30.973761998, 11, false],
  [16, 'S', 'sulfur', 32.06, 4, false],
  [17, 'Cl', 'chlorine', 35.45, 4, false],
  [18, 'Ar', 'argon', 39.95, 4, false],
  [19, 'K', 'potassium', 39.0983, 6, false],
  [20, 'Ca', 'calcium', 40.078, 5, false],
  [21, 'Sc', 'scandium', 44.955907, 8, false],
  [22, 'Ti', 'titanium', 47.867, 5, false],
  [23, 'V', 'vanadium', 50.9415, 6, false],
  [24, 'Cr', 'chromium', 51.9961, 6, false],
  [25, 'Mn', 'manganese', 54.938043, 8, false],
  [26, 'Fe', 'iron', 55.845, 5, false],
  [27, 'Co', 'cobalt', 58.933194, 8, false],
  [28, 'Ni', 'nickel', 58.6934, 6, false],
  [29, 'Cu', 'copper', 63.546, 5, false],
  [30, 'Zn', 'zinc', 65.38, 4, false],
  [31, 'Ga', 'gallium', 69.723, 5, false],
  [32, 'Ge', 'germanium', 72.63, 5, false],
  [33, 'As', 'arsenic', 74.921595, 8, false],
  [34, 'Se', 'selenium', 78.971, 5, false],
  [35, 'Br', 'bromine', 79.904, 5, false],
  [36, 'Kr', 'krypton', 83.798, 5, false],
  [37, 'Rb', 'rubidium', 85.4678, 6, false],
  [38, 'Sr', 'strontium', 87.62, 4, false],
  [39, 'Y', 'yttrium', 88.905838, 8, false],
  [40, 'Zr', 'zirconium', 91.224, 5, false],
  [41, 'Nb', 'niobium', 92.90637, 7, false],
  [42, 'Mo', 'molybdenum', 95.95, 4, false],
  [43, 'Tc', 'technetium', 98, 2, true],
  [44, 'Ru', 'ruthenium', 101.07, 5, false],
  [45, 'Rh', 'rhodium', 102.90549, 8, false],
  [46, 'Pd', 'palladium', 106.42, 5, false],
  [47, 'Ag', 'silver', 107.8682, 7, false],
  [48, 'Cd', 'cadmium', 112.414, 6, false],
  [49, 'In', 'indium', 114.818, 6, false],
  [50, 'Sn', 'tin', 118.71, 6, false],
  [51, 'Sb', 'antimony', 121.76, 6, false],
  [52, 'Te', 'tellurium', 127.6, 5, false],
  [53, 'I', 'iodine', 126.90447, 8, false],
  [54, 'Xe', 'xenon', 131.293, 6, false],
  [55, 'Cs', 'caesium', 132.90545196, 11, false],
  [56, 'Ba', 'barium', 137.327, 6, false],
  [57, 'La', 'lanthanum', 138.90547, 8, false],
  [58, 'Ce', 'cerium', 140.116, 6, false],
  [59, 'Pr', 'praseodymium', 140.90766, 8, false],
  [60, 'Nd', 'neodymium', 144.242, 6, false],
  [61, 'Pm', 'promethium', 145, 3, true],
  [62, 'Sm', 'samarium', 150.36, 5, false],
  [63, 'Eu', 'europium', 151.964, 6, false],
  [64, 'Gd', 'gadolinium', 157.25, 5, false],
  [65, 'Tb', 'terbium', 158.925354, 9, false],
  [66, 'Dy', 'dysprosium', 162.5, 6, false],
  [67, 'Ho', 'holmium', 164.930329, 9, false],
  [68, 'Er', 'erbium', 167.259, 6, false],
  [69, 'Tm', 'thulium', 168.934219, 9, false],
  [70, 'Yb', 'ytterbium', 173.045, 6, false],
  [71, 'Lu', 'lutetium', 174.9668, 7, false],
  [72, 'Hf', 'hafnium', 178.486, 6, false],
  [73, 'Ta', 'tantalum', 180.94788, 8, false],
  [74, 'W', 'tungsten', 183.84, 5, false],
  [75, 'Re', 'rhenium', 186.207, 6, false],
  [76, 'Os', 'osmium', 190.23, 5, false],
  [77, 'Ir', 'iridium', 192.217, 6, false],
  [78, 'Pt', 'platinum', 195.084, 6, false],
  [79, 'Au', 'gold', 196.96657, 8, false],
  [80, 'Hg', 'mercury', 200.592, 6, false],
  [81, 'Tl', 'thallium', 204.38, 5, false],
  [82, 'Pb', 'lead', 207.2, 4, false],
  [83, 'Bi', 'bismuth', 208.9804, 7, false],
  [84, 'Po', 'polonium', 209, 3, true],
  [85, 'At', 'astatine', 210, 3, true],
  [86, 'Rn', 'radon', 222, 3, true],
  [87, 'Fr', 'francium', 223, 3, true],
  [88, 'Ra', 'radium', 226, 3, true],
  [89, 'Ac', 'actinium', 227, 3, true],
  [90, 'Th', 'thorium', 232.0377, 7, false],
  [91, 'Pa', 'protactinium', 231.03588, 8, false],
  [92, 'U', 'uranium', 238.02891, 8, false],
  [93, 'Np', 'neptunium', 237, 3, true],
  [94, 'Pu', 'plutonium', 244, 3, true],
  [95, 'Am', 'americium', 243, 3, true],
  [96, 'Cm', 'curium', 247, 3, true],
  [97, 'Bk', 'berkelium', 247, 3, true],
  [98, 'Cf', 'californium', 251, 3, true],
  [99, 'Es', 'einsteinium', 252, 3, true],
  [100, 'Fm', 'fermium', 257, 3, true],
  [101, 'Md', 'mendelevium', 258, 3, true],
  [102, 'No', 'nobelium', 259, 3, true],
  [103, 'Lr', 'lawrencium', 266, 3, true],
  [104, 'Rf', 'rutherfordium', 267, 3, true],
  [105, 'Db', 'dubnium', 268, 3, true],
  [106, 'Sg', 'seaborgium', 269, 3, true],
  [107, 'Bh', 'bohrium', 270, 3, true],
  [108, 'Hs', 'hassium', 269, 3, true],
  [109, 'Mt', 'meitnerium', 278, 3, true],
  [110, 'Ds', 'darmstadtium', 281, 3, true],
  [111, 'Rg', 'roentgenium', 282, 3, true],
  [112, 'Cn', 'copernicium', 285, 3, true],
  [113, 'Nh', 'nihonium', 286, 3, true],
  [114, 'Fl', 'flerovium', 289, 3, true],
  [115, 'Mc', 'moscovium', 290, 3, true],
  [116, 'Lv', 'livermorium', 293, 3, true],
  [117, 'Ts', 'tennessine', 294, 3, true],
  [118, 'Og', 'oganesson', 294, 3, true],
];

/** Every element, ordered by atomic number, index 0 being hydrogen. */
export const ELEMENTS: readonly Element[] = ROWS.map(
  ([z, symbol, name, weight, sigFigs, noStableIsotope]): Element => ({
    z,
    symbol,
    name,
    weight,
    sigFigs,
    noStableIsotope,
  }),
);

const BY_SYMBOL: ReadonlyMap<string, Element> = new Map(
  ELEMENTS.map((e) => [e.symbol, e]),
);

/**
 * Look an element up by its IUPAC symbol.
 *
 * PRECONDITION: `symbol` is matched EXACTLY as IUPAC writes it — `Co` is
 * cobalt and `CO` is carbon monoxide. Case folding here would silently turn
 * one into the other, which is the single most common way a formula parser
 * produces a plausible wrong molar mass, so it is not offered.
 *
 * Returns undefined for anything not in the table.
 */
export function elementBySymbol(symbol: string): Element | undefined {
  return BY_SYMBOL.get(symbol);
}

/**
 * Look an element up by atomic number.
 *
 * PRECONDITION: none. Returns undefined outside 1-118.
 */
export function elementByNumber(z: number): Element | undefined {
  return Number.isInteger(z) && z >= 1 && z <= 118 ? ELEMENTS[z - 1] : undefined;
}

/** Every symbol in the table, longest first — the order a parser must try. */
export const SYMBOLS_LONGEST_FIRST: readonly string[] = ELEMENTS.map((e) => e.symbol)
  .slice()
  .sort((a, b) => b.length - a.length || a.localeCompare(b));
