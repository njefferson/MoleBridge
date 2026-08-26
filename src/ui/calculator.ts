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
 *
 * ## Handing the number back is the other direction, and it is safe
 *
 * "No way to pull a number out of the problem" is about READING IN, and it is
 * what keeps this from becoming a solver. Writing the result back into the box
 * the student was already typing in is the opposite: they did the arithmetic,
 * the calculator still cannot see the stage, and all that moves is a string
 * they were about to copy by hand.
 *
 * It is worth more than the keystrokes. A slipped digit in a nine-figure
 * intermediate is not a neutral cost here — the app attributes a wrong number
 * to a conceptual failure, so a transcription error gets reported as a
 * misconception the student never had.
 */

import { need } from './dom.ts';
import { calculate, formatCalc } from '../learn/calculator.ts';
import { withNumber } from './carry.ts';

export interface CalculatorPanel {
  /**
   * Show it.
   *
   * `into` is the box the number goes back to, or null where there is nowhere
   * to put it — the calculator opens from every screen, and most of them have
   * no answer to fill in. The button is hidden in that case rather than
   * disabled, because a control that never does anything on this screen is not
   * a control that is temporarily unavailable.
   */
  open(into?: HTMLInputElement | null): void;
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
  const use = need<HTMLButtonElement>('#calc-use');

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

  let target: HTMLInputElement | null = null;

  use.addEventListener('click', () => {
    const value = out.classList.contains('calc-value') ? (out.textContent ?? '') : '';
    if (target === null || value === '') return;
    // The unit the student had already typed is kept — see `withNumber`. A bare
    // number handed back to a box that said "g/mol" would trade one piece of
    // retyping for another.
    target.value = withNumber(target.value, value);
    // The box has to be told, or the screen still believes it is empty: the
    // work screen listens for `input` to enable Check, and setting `.value`
    // from script fires nothing.
    target.dispatchEvent(new Event('input', { bubbles: true }));
    panel.close();
    target.focus();
  });

  return {
    open(into: HTMLInputElement | null = null): void {
      target = into;
      use.hidden = into === null;
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
