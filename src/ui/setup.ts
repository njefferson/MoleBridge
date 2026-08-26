/**
 * setup.ts — roster number, assignment key, which set, how many.
 *
 * FOUR THINGS ON THE BOARD WOULD BE THREE TOO MANY. The completion code needs a
 * 12-bit assignment id and the generator needs an assignment key; the id is
 * derived from the key so a teacher writes one thing and a class of thirty
 * types one thing.
 *
 * The roster number is the only identifier this app has ever heard of. There is
 * no field for a name here and there must never be one — §2 of the project
 * specification, and it is the sort of thing that gets added later by somebody
 * being helpful.
 */

import { el, fill, need } from './dom.ts';
import {
  MAX_ROSTER_ID,
  MIN_ROSTER_ID,
  assignmentKeyIdFor,
  isValidRosterId,
  normaliseAssignmentKey,
} from '../engine/assignment.ts';
import { TIERS } from '../engine/problem.ts';
import type { SessionConfig } from '../engine/steps.ts';

/** What each tier is, in a student's words. */
const TIER_NAMES: Readonly<Record<number, string>> = {
  1: 'Mass to mass',
  2: 'Particles and gas volumes',
  3: 'Limiting reactant',
  4: 'Percent yield',
};

/** How many problems a session may be. */
const COUNTS: readonly number[] = [3, 5, 8];

/** The default, which is about a lesson's worth. */
const DEFAULT_COUNT = 5;

/**
 * Milliseconds the day offset in a completion code is measured from.
 *
 * A FIXED EPOCH, not "today". The code carries 9 bits of day offset so a
 * teacher can tell this week's session from last week's, and that only works if
 * every device measures from the same instant. Moving it invalidates the
 * meaning of every code already handed in, so it moves between school years and
 * not between releases.
 */
export const ASSIGNMENT_EPOCH_MS = Date.UTC(2026, 7, 1);

/** What the setup screen hands back. */
export interface SetupHost {
  onStart(config: SessionConfig): void;
}

/**
 * Wire the setup screen up.
 *
 * PRECONDITION: the document contains the setup section's hooks.
 */
export function mountSetup(host: SetupHost): void {
  const form = need<HTMLFormElement>('#setup-form');
  const roster = need<HTMLInputElement>('#setup-roster');
  const key = need<HTMLInputElement>('#setup-key');
  const error = need('#setup-error');

  let tier = TIERS[0] as number;
  let count = DEFAULT_COUNT;

  const tierGroup = need('#setup-tier');
  fill(
    tierGroup,
    TIERS.map((value) =>
      el('button', {
        className: value === tier ? 'choice choice-on' : 'choice',
        text: `${value}. ${TIER_NAMES[value] ?? `Set ${value}`}`,
        attrs: { type: 'button', role: 'radio', 'aria-checked': value === tier, 'data-tier': value },
      }),
    ),
  );

  const countGroup = need('#setup-count');
  fill(
    countGroup,
    COUNTS.map((value) =>
      el('button', {
        className: value === count ? 'choice choice-on' : 'choice',
        text: String(value),
        attrs: { type: 'button', role: 'radio', 'aria-checked': value === count, 'data-count': value },
      }),
    ),
  );

  const pick = (group: HTMLElement, attribute: string, chosen: HTMLButtonElement): void => {
    for (const other of group.querySelectorAll<HTMLButtonElement>(`button[data-${attribute}]`)) {
      other.setAttribute('aria-checked', String(other === chosen));
      other.classList.toggle('choice-on', other === chosen);
    }
  };

  tierGroup.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-tier]');
    if (button === null || button === undefined) return;
    tier = Number(button.dataset['tier']);
    pick(tierGroup, 'tier', button);
  });

  countGroup.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-count]');
    if (button === null || button === undefined) return;
    count = Number(button.dataset['count']);
    pick(countGroup, 'count', button);
  });

  const complain = (message: string, focus: HTMLElement): void => {
    error.textContent = message;
    error.hidden = false;
    focus.focus();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.hidden = true;

    const rosterId = Number(roster.value.trim());
    if (!isValidRosterId(rosterId)) {
      complain(
        `A roster number is a whole number from ${MIN_ROSTER_ID} to ${MAX_ROSTER_ID}. You were given one.`,
        roster,
      );
      return;
    }

    const assignmentKey = normaliseAssignmentKey(key.value);
    if (assignmentKey === '') {
      complain('The assignment key came with the work. Without it, everyone would get different problems.', key);
      return;
    }

    host.onStart({
      mode: 'assignment',
      assignmentKey,
      assignmentKeyId: assignmentKeyIdFor(assignmentKey),
      rosterId,
      tier,
      problemCount: count,
      assignmentEpochMs: ASSIGNMENT_EPOCH_MS,
    });
  });
}
