/**
 * practice.ts — the practice door.
 *
 * Practice is the destination and the class assignment is the errand, so this
 * screen is deliberately shorter than setup's: no roster number, because
 * nothing is handed in and there is nobody to identify.
 *
 * ## The seed is generated AND shown
 *
 * The engine generates from a key, deterministically, so the same key always
 * gives the same problems on every device forever. A "Random" button that keeps
 * its roll to itself would throw that away: a student who got one wrong could
 * never return to it, show it to a friend, or bring it to a teacher. So Random
 * rolls a seed, puts it in the field where it can be read and copied, and the
 * field accepts one typed back in.
 *
 * The seeds are short and pronounceable on purpose — they get read aloud across
 * a classroom, and a base-32 hash would not survive that trip.
 */

import { el, fill, need } from './dom.ts';
import { assignmentKeyIdFor } from '../engine/assignment.ts';
import { TIERS, TIER_NAMES } from '../engine/problem.ts';
import type { SessionConfig } from '../engine/steps.ts';

/**
 * How many. WHICH SET comes from the engine, along with what each is called —
 * this file used to declare its own `[1, 2, 3]`, which left percent yield
 * unreachable in practice while the graded route posed it.
 */
const COUNTS = [3, 5, 10] as const;
const DEFAULT_COUNT = 5;

/**
 * Seed words. Chosen to be short, unambiguous when spoken, and free of anything
 * that sounds like anything else across a room — no MOSS/LOSS, no B/V pairs.
 */
const FIRST = ['AMBER', 'BASALT', 'CEDAR', 'DELTA', 'EMBER', 'FLINT', 'GRANITE', 'HOLLOW'];
const SECOND = ['RIVER', 'MEADOW', 'CANYON', 'HARBOUR', 'ORCHARD', 'THICKET', 'SUMMIT', 'WILLOW'];

/**
 * A fresh seed. `Math.random` is right here and would not be anywhere else in
 * this repository: there is no security property, nothing is graded from it,
 * and the ONE thing it must not be is reproducible — a seed that repeated
 * across a class would hand thirty students the same practice.
 */
export function rollSeed(): string {
  const pick = <T>(from: readonly T[]): T => from[Math.floor(Math.random() * from.length)] as T;
  return `${pick(FIRST)}-${pick(SECOND)}-${String(Math.floor(Math.random() * 90) + 10)}`;
}

export interface PracticeHost {
  onStart(config: SessionConfig): void;
  onBack(): void;
}

/**
 * Wire the practice screen up.
 *
 * PRECONDITION: the document contains the practice form and its hooks.
 */
export function mountPractice(host: PracticeHost): void {
  const form = need<HTMLFormElement>('#practice-form');
  const seed = need<HTMLInputElement>('#practice-seed');
  const error = need('#practice-error');

  let tier = TIERS[0] as number;
  let count = DEFAULT_COUNT as number;

  const choices = (
    host_: HTMLElement,
    values: readonly number[],
    label: (value: number) => string,
    selected: () => number,
    onPick: (value: number) => void,
  ): void => {
    const render = (): void =>
      fill(
        host_,
        values.map((value) =>
          el('button', {
            className: value === selected() ? 'choice choice-on' : 'choice',
            text: label(value),
            attrs: {
              type: 'button',
              role: 'radio',
              'aria-checked': value === selected(),
              'data-value': value,
            },
          }),
        ),
      );
    render();
    host_.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-value]');
      if (button === null) return;
      onPick(Number(button.dataset['value']));
      render();
    });
  };

  choices(
    need('#practice-tier'),
    TIERS,
    (value) => `${value}. ${TIER_NAMES[value] ?? `Set ${value}`}`,
    () => tier,
    (value) => {
      tier = value;
    },
  );
  choices(
    need('#practice-count'),
    COUNTS,
    (value) => String(value),
    () => count,
    (value) => {
      count = value;
    },
  );

  // A seed is in the field from the moment the screen appears, so pressing
  // Start without touching anything is a complete action rather than an error.
  seed.value = rollSeed();

  need<HTMLButtonElement>('#practice-random').addEventListener('click', () => {
    seed.value = rollSeed();
    error.hidden = true;
    seed.focus();
  });

  need<HTMLButtonElement>('#practice-back').addEventListener('click', () => {
    host.onBack();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const typed = seed.value.trim().toUpperCase();
    if (typed === '') {
      error.textContent = 'Press Random, or type a problem set you have seen before.';
      error.hidden = false;
      seed.focus();
      return;
    }
    error.hidden = true;
    seed.value = typed;
    host.onStart({
      mode: 'practice',
      assignmentKey: typed,
      // Carried so the diagnostic and the engine see a whole config, and
      // ignored: `completionPayload` refuses a practice session before it could
      // ever be read.
      assignmentKeyId: assignmentKeyIdFor(typed),
      rosterId: 1,
      tier,
      problemCount: count,
      assignmentEpochMs: 0,
    });
  });
}
