/**
 * table.ts — where each element sits, and NOTHING about compounds.
 *
 * ## The same line the calculator draws
 *
 * This shows atomic weights. It does not, and must not, work out a molar mass:
 * a periodic table that takes `CuSO4` and hands back 159.61 is the calculator's
 * forbidden feature wearing a different hat, and it deletes the same error
 * classes. `table.test.ts` asserts the module exports nothing that takes a
 * formula.
 *
 * A student reading four weights off this and adding them up themselves is
 * doing the step. That is the point.
 *
 * ## The layout is COMPUTED, not typed
 *
 * A hand-written grid of 118 positions is 118 chances to put an element in the
 * wrong group, and every one of them looks plausible in a diff. The position
 * falls out of the atomic number by the same rules a chemist would state, and
 * the test checks the landmarks — hydrogen at the top left, helium at the top
 * right, carbon in group 14, the f-block off the bottom.
 */

import { ELEMENTS, type Element } from '../chem/elements.ts';

/** A cell in the rendered grid. Row and column are 1-based, as CSS grid wants. */
export interface Cell {
  readonly element: Element;
  readonly row: number;
  readonly column: number;
  /** Which block, for colouring and for the legend. */
  readonly block: 's' | 'p' | 'd' | 'f';
}

/** The main grid is seven periods; the f-block sits below it after a gap. */
export const TABLE_ROWS = 10;
export const TABLE_COLUMNS = 18;
/** The two f-block rows, and the empty row that separates them from the table. */
const F_ROW_FIRST = 9;

/** Which period an atomic number belongs to. */
function periodOf(z: number): number {
  if (z <= 2) return 1;
  if (z <= 10) return 2;
  if (z <= 18) return 3;
  if (z <= 36) return 4;
  if (z <= 54) return 5;
  if (z <= 86) return 6;
  return 7;
}

/** The first atomic number in each period, indexed by period. */
const PERIOD_START = [0, 1, 3, 11, 19, 37, 55, 87];

/**
 * Where one element goes.
 *
 * Stated as the rules rather than as a table of 118 answers: the short periods
 * skip the d-block, the long ones do not, and the f-block comes out of periods
 * 6 and 7 into its own two rows.
 */
export function cellFor(element: Element): Cell {
  const { z } = element;
  const period = periodOf(z);
  const start = PERIOD_START[period] as number;
  const offset = z - start; // 0-based position within the period

  if (z === 1) return { element, row: 1, column: 1, block: 's' };
  if (z === 2) return { element, row: 1, column: 18, block: 's' };

  // Periods 2 and 3: two s-block elements, then a jump straight to group 13.
  if (period === 2 || period === 3) {
    const column = offset < 2 ? offset + 1 : offset + 11;
    return { element, row: period, column, block: offset < 2 ? 's' : 'p' };
  }

  // Periods 6 and 7 hold the f-block, which is lifted out into its own rows.
  if (period === 6 || period === 7) {
    if (offset >= 2 && offset <= 16) {
      return {
        element,
        row: period === 6 ? F_ROW_FIRST : F_ROW_FIRST + 1,
        // Indented under the d-block, which is where a printed table puts it.
        column: offset + 1,
        block: 'f',
      };
    }
    const column = offset < 2 ? offset + 1 : offset - 13;
    return { element, row: period, column, block: blockFor(column) };
  }

  // Periods 4 and 5 run straight through all eighteen groups.
  const column = offset + 1;
  return { element, row: period, column, block: blockFor(column) };
}

function blockFor(column: number): 's' | 'p' | 'd' {
  if (column <= 2) return 's';
  if (column >= 13) return 'p';
  return 'd';
}

/** Every element, placed. Computed once. */
export const TABLE: readonly Cell[] = ELEMENTS.map(cellFor);

/**
 * The atomic weight as this shows it, at the figures actually published.
 *
 * BRACKETED WHERE THERE IS NO STABLE ISOTOPE, the way CIAAW writes it — the
 * number is a mass number rather than a standard atomic weight, and printing it
 * bare would say something the data does not.
 */
export function weightText(element: Element): string {
  const value = element.weight.toPrecision(element.sigFigs);
  const trimmed = value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
  return element.noStableIsotope ? `[${trimmed}]` : trimmed;
}
