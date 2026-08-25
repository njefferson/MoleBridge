/**
 * calculator.ts — the box, on top of whatever the student is doing.
 *
 * A PANEL for the same reason the reference is one: it opens mid-step and the
 * problem underneath has to survive it. It also keeps nothing between opens —
 * no memory of the last sum, and no way to pull a number out of the problem —
 * because a calculator that knows what problem you are on is one step from
 * being a calculator that answers it.
 *
 * The refusal lives in `src/learn/calculator.ts` and is tested there against
 * all 118 element symbols. This file is the keypad.
 */

import { need } from './dom.ts';
import { calculate, formatCalc } from '../learn/calculator.ts';

export interface CalculatorPanel {
  open(): void;
}

/** The keys, in the order they are laid out. `C` clears; `=` evaluates. */
const KEYS = [
  '7', '8', '9', '÷',
  '4', '5', '6', '×',
  '1', '2', '3', '−',
  '0', '.', '(', ')',
  'C', '⌫', 'e', '+',
] as const;

export function mountCalculator(): CalculatorPanel {
  const panel = need<HTMLDialogElement>('#calc-panel');
  const entry = need<HTMLInputElement>('#calc-entry');
  const out = need('#calc-out');
  const keys = need('#calc-keys');

  const evaluate = (): void => {
    const result = calculate(entry.value);
    if (result.kind === 'EMPTY') {
      out.textContent = '';
      out.className = 'calc-out';
      return;
    }
    if (result.kind === 'ERROR') {
      out.textContent = result.why;
      out.className = 'calc-out calc-error';
      return;
    }
    out.textContent = formatCalc(result.value);
    out.className = 'calc-out calc-value';
  };

  for (const key of KEYS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calc-key';
    button.textContent = key;
    button.dataset['key'] = key;
    keys.append(button);
  }

  keys.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-key]');
    if (button === null) return;
    const key = button.dataset['key'] ?? '';
    if (key === 'C') entry.value = '';
    else if (key === '⌫') entry.value = entry.value.slice(0, -1);
    else entry.value += key;
    evaluate();
    entry.focus();
  });

  // TYPED AS WELL AS TAPPED. A Chromebook has a keyboard and using it is faster
  // than aiming at twenty targets; the keypad is for the board at the front and
  // for a tablet.
  entry.addEventListener('input', evaluate);

  need<HTMLButtonElement>('#calc-close').addEventListener('click', () => {
    panel.close();
  });

  return {
    open(): void {
      // CLEARED ON EVERY OPEN. Nothing carries between problems, which is the
      // difference between a tool and a scratchpad the app is keeping for you.
      entry.value = '';
      out.textContent = '';
      out.className = 'calc-out';
      if (!panel.open) panel.showModal();
      entry.focus();
    },
  };
}
