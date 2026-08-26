/**
 * warmup.ts — the five minutes at the start of a lesson.
 *
 * ## Why this exists at all
 *
 * A chemistry teacher looked at this app and named exactly one thing she would
 * use: a Monday warm-up. She sees the same students twice a week, so a class
 * period spent on practice is a period not spent on chemistry, and that is
 * arithmetic rather than a failure to see the point.
 *
 * The app was not built for that. Starting a set meant a door, then a roster
 * number, an assignment key, a set and a count — five decisions before a single
 * problem, with twenty-eight teenagers and five minutes. Fatal friction, and
 * the only thing standing between the app and the one use it was offered.
 *
 * ## ZERO TAPS, because a link is the shortest possible route
 *
 * She writes a link on the board, or drops it in Google Classroom. Opening it
 * starts the warm-up: everyone gets the SAME problems, which is the whole point
 * — a warm-up you cannot discuss afterwards is just homework done early.
 *
 * ## What a warm-up deliberately is NOT
 *
 * No roster number, because nothing is collected. No completion code, because
 * nothing is handed in. It is a practice session with a shared seed, which is
 * why this file builds a `SessionConfig` and stops: there is no second engine
 * path for it, and there must not be one — a mode that graded differently would
 * be a second place for the rules to drift.
 */

import type { SessionConfig } from '../engine/steps.ts';
import { assignmentKeyIdFor } from '../engine/assignment.ts';

/** How many problems a warm-up is, when the link does not say. */
export const WARMUP_PROBLEMS = 2;
/** Which set, when the link does not say. The middle one. */
export const WARMUP_TIER = 2;
/** The most a warm-up can be. It is five minutes, not a lesson. */
export const WARMUP_MAX_PROBLEMS = 5;

/**
 * A warm-up asked for in a URL, or null where the URL asks for nothing.
 *
 * THE HASH, NOT THE QUERY STRING. A fragment is never sent to the server, which
 * matters not at all for a static site and matters for the habit: nothing about
 * what a student is doing should be in a request, ever, and the shape of the
 * link should not have to be re-argued the day something does have a server.
 *
 * Reads `#w=CODE`, optionally `&set=N` and `&n=M`.
 */
export function warmupFrom(hash: string): SessionConfig | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === '') return null;
  const params = new URLSearchParams(raw);
  const code = (params.get('w') ?? '').trim().toUpperCase();
  // A code is what makes everyone get the same problems. Without one there is
  // nothing to share and this is not a warm-up.
  if (!/^[A-Z0-9][A-Z0-9-]{0,23}$/.test(code)) return null;

  const asked = Number(params.get('set'));
  const tier = Number.isInteger(asked) && asked >= 1 && asked <= 4 ? asked : WARMUP_TIER;
  const wanted = Number(params.get('n'));
  const problemCount =
    Number.isInteger(wanted) && wanted >= 1 && wanted <= WARMUP_MAX_PROBLEMS
      ? wanted
      : WARMUP_PROBLEMS;

  return {
    mode: 'practice',
    assignmentKey: code,
    assignmentKeyId: assignmentKeyIdFor(code),
    // NOT A REAL STUDENT, and it cannot become one: a practice session refuses
    // to produce a completion code at all, so nothing carries this anywhere.
    rosterId: 1,
    tier,
    problemCount,
    assignmentEpochMs: 0,
  };
}

/** The link a teacher writes on the board, built from what she picked. */
export function warmupLink(origin: string, code: string, tier: number, problems: number): string {
  const params = new URLSearchParams({ w: code.trim().toUpperCase() });
  if (tier !== WARMUP_TIER) params.set('set', String(tier));
  if (problems !== WARMUP_PROBLEMS) params.set('n', String(problems));
  return `${origin}/#${params.toString()}`;
}
