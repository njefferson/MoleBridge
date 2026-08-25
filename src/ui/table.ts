/**
 * table.ts — the periodic table, as a panel.
 *
 * ## Weights only, and a student who wants a molar mass adds them up
 *
 * That is not a shortcoming. Adding four atomic weights IS the step `E-MM-ARITH`
 * and `E-MM-PARSE` are about, and a table that did it would delete both.
 *
 * ## The grid is a grid, and the reading order is not
 *
 * A CSS grid places 118 buttons by row and column. Left as that, a screen reader
 * would walk them in document order, which is atomic number — which happens to
 * be the RIGHT order to hear them in, so the DOM is built in atomic-number order
 * and the grid does the placing. Building it in visual order would have made the
 * markup match the picture and the reading order nonsense.
 */

import { el, fill, need } from './dom.ts';
import { TABLE, weightText } from '../learn/table.ts';
import type { Element } from '../chem/elements.ts';

export interface TablePanel {
  open(): void;
}

export function mountTable(): TablePanel {
  const panel = need<HTMLDialogElement>('#table-panel');
  const grid = need('#table-grid');
  const detail = need('#table-detail');

  /**
   * The data holds names lower-case on purpose — the lessons say "how many
   * oxygen atoms" mid-sentence — but a heading reading "carbon (C)" looks like
   * a typo. Capitalised HERE rather than in the data, so the sentence case
   * every other surface depends on is untouched.
   */
  const titleCase = (name: string): string => `${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;

  const showElement = (element: Element): void => {
    fill(detail, [
      el('h3', { text: `${titleCase(element.name)} (${element.symbol})` }),
      el('p', { text: `Atomic number ${element.z}.` }),
      el('p', {
        className: 'table-weight',
        text: element.noStableIsotope
          ? `Mass number ${weightText(element).replace(/[[\]]/g, '')} — this element has no stable isotope, so there is no standard atomic weight for it.`
          : `Atomic weight ${weightText(element)} g/mol.`,
      }),
    ]);
  };

  fill(
    grid,
    // ATOMIC-NUMBER ORDER IN THE DOM, visual order from the grid. That is what
    // keeps the reading order sensible while the picture stays a periodic table.
    TABLE.map((cell) => {
      const button = el('button', {
        className: `table-cell table-${cell.block}`,
        attrs: {
          type: 'button',
          'data-z': cell.element.z,
          // The visible label is the symbol, which is two characters and no use
          // to somebody listening. The name and the weight go in the accessible
          // name so the cell says what it is either way.
          'aria-label': `${titleCase(cell.element.name)}, ${cell.element.symbol}, atomic number ${cell.element.z}, atomic weight ${weightText(cell.element)}`,
        },
      });
      // PLACED THROUGH THE CSSOM, NOT THROUGH A `style` ATTRIBUTE. The
      // Content-Security-Policy is `style-src 'self'`, which blocks inline
      // style attributes — and it blocked all 118 of these, which is the gate
      // doing exactly its job. CSP does not restrict the CSSOM, so setting the
      // properties in script places the cell without an inline style to block.
      button.style.gridRow = String(cell.row);
      button.style.gridColumn = String(cell.column);
      button.append(
        el('span', { className: 'table-z', text: String(cell.element.z) }),
        el('span', { className: 'table-symbol', text: cell.element.symbol }),
        el('span', { className: 'table-mass', text: weightText(cell.element) }),
      );
      return button;
    }),
  );

  grid.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-z]');
    if (button === null) return;
    const cell = TABLE.find((entry) => entry.element.z === Number(button.dataset['z']));
    if (cell !== undefined) showElement(cell.element);
  });

  need<HTMLButtonElement>('#table-close').addEventListener('click', () => {
    panel.close();
  });

  return {
    open(): void {
      if (!panel.open) panel.showModal();
    },
  };
}
