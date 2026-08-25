/**
 * resume.ts — a session survives the tab closing.
 *
 * ## Why this is worth the risk of getting wrong
 *
 * Nothing was persisted. A refresh, a restored tab, a Chromebook that slept and
 * woke on a reloaded page — all of them threw away a half-finished set and
 * everything typed into it. For most people that is an annoyance. For the
 * students this app is aimed at, where **stopping mid-task is an accommodation
 * rather than a lapse**, it made the app punish the accommodation.
 *
 * ## What is stored, and what is deliberately not
 *
 * A `Session` is already plain data — numbers, booleans and a config of
 * primitives — and the problems are not in it: they are regenerated from the
 * key, deterministically, so the same set comes back by construction rather
 * than by being saved. Alongside it goes the text sitting in the boxes at the
 * current stage, unsubmitted, because that is the part a student would call
 * "my work".
 *
 * NOT STORED: anything about the person. The saved session carries a roster
 * number because the running session does, and it never leaves the device —
 * `localStorage` on the machine the student is sitting at, which is where the
 * lessons' progress already lives.
 *
 * ## The clock
 *
 * A restored session's elapsed time picks up where it left off rather than
 * counting the gap. `resumeSession` in `steps.ts` does that, and this file
 * records when the last stretch ended so it can. A student who breaks for
 * forty minutes must not have forty minutes added to what their code reports.
 */

import type { Session } from './steps.ts';

/** The shape written to storage. Versioned, because a saved shape is a format. */
export interface SavedSession {
  readonly saved: 1;
  readonly session: Session;
  /** When the app last knew this session was open. */
  readonly atMs: number;
  /** What was in the boxes at the current stage, unsubmitted. */
  readonly entry: readonly string[];
}

/** Where it lives. Beside the lessons' own key, not inside it. */
export const RESUME_KEY = 'molebridge.session';

/**
 * True where the value read back is a session this build can pick up.
 *
 * STRICT ON PURPOSE. Storage can hold anything — an older build's shape, a
 * half-written value, something another tab left. A session restored from a
 * shape this build does not recognise would produce a student sitting in front
 * of a problem the app cannot grade, which is worse than starting again.
 */
export function isSavedSession(value: unknown): value is SavedSession {
  if (typeof value !== 'object' || value === null) return false;
  const saved = value as Record<string, unknown>;
  if (saved['saved'] !== 1) return false;
  if (typeof saved['atMs'] !== 'number' || !Number.isFinite(saved['atMs'])) return false;
  if (!Array.isArray(saved['entry']) || saved['entry'].some((item) => typeof item !== 'string')) return false;

  const session = saved['session'];
  if (typeof session !== 'object' || session === null) return false;
  const fields = session as Record<string, unknown>;
  const numbers = [
    'startedAtMs', 'elapsedBeforeMs', 'problemIndex', 'stageIndex', 'attemptsAtStage',
    'attempted', 'firstTryCorrect', 'algebraTriggers', 'unclassified', 'collisions',
  ];
  for (const name of numbers) {
    if (typeof fields[name] !== 'number' || !Number.isFinite(fields[name] as number)) return false;
  }
  if (typeof fields['cleanSoFar'] !== 'boolean' || typeof fields['finished'] !== 'boolean') return false;

  const counts = fields['stageErrors'];
  if (typeof counts !== 'object' || counts === null) return false;
  for (const stage of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) {
    if (typeof (counts as Record<string, unknown>)[stage] !== 'number') return false;
  }

  const config = fields['config'];
  if (typeof config !== 'object' || config === null) return false;
  const c = config as Record<string, unknown>;
  if (typeof c['mode'] !== 'string' || (c['mode'] !== 'assignment' && c['mode'] !== 'practice')) return false;
  if (typeof c['assignmentKey'] !== 'string' || c['assignmentKey'] === '') return false;
  for (const name of ['assignmentKeyId', 'rosterId', 'tier', 'problemCount', 'assignmentEpochMs']) {
    if (typeof c[name] !== 'number' || !Number.isFinite(c[name] as number)) return false;
  }
  return true;
}

/**
 * A finished session is never worth resuming.
 *
 * Its code is already on the finished screen, and restoring it would drop a
 * student back onto a screen they had done with — which reads as the app losing
 * their place rather than keeping it.
 */
export function isWorthResuming(saved: SavedSession): boolean {
  return !saved.session.finished && saved.session.problemIndex < saved.session.config.problemCount;
}
