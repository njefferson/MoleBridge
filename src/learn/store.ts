/**
 * store.ts — where progress actually lives on a device.
 *
 * `localStorage`, which needs no code and no thought, and which is why the
 * progress code is a backup rather than the route. Every touch is guarded:
 * a managed Chromebook can have site data switched off entirely, and a
 * student on one still gets a working app — they just start fresh each time,
 * which is a small annoyance rather than a broken screen.
 *
 * NOTHING HERE IS ABOUT WHO. Lessons finished, practice done, error classes
 * that keep recurring. No roster number, no name, nothing that narrows to a
 * person — which also means a shared Chromebook shows the last user's progress
 * to the next one, and that is worth a student knowing rather than discovering.
 */

import {
  EMPTY_PROGRESS,
  MAX_PRACTICE,
  mergeProgress,
  type Progress,
} from './progress.ts';
import { ERROR_CLASSES, type ErrorClass } from '../engine/taxonomy.ts';

const KEY = 'molebridge.progress';

/** How many times a class must be hit before it counts as one to work on. */
const WEAK_AFTER = 2;

/** Counts that have not yet reached WEAK_AFTER. Not carried in the code. */
const TALLY_KEY = 'molebridge.progress.tally';

/**
 * Read what is on this device.
 *
 * Anything unreadable — absent, truncated, from a build that wrote a different
 * shape — comes back as empty rather than throwing. A student cannot act on a
 * parse error, and refusing to start because of one would be the app's problem
 * being made theirs.
 */
export function loadProgress(): Progress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return EMPTY_PROGRESS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_PROGRESS;
    const record = parsed as Record<string, unknown>;
    const lessons = Array.isArray(record['lessonsDone'])
      ? record['lessonsDone'].filter((v): v is number => typeof v === 'number')
      : [];
    const practised = typeof record['practised'] === 'number' ? record['practised'] : 0;
    const weak = Array.isArray(record['weak'])
      ? record['weak'].filter((v): v is ErrorClass => ERROR_CLASSES.includes(v as ErrorClass))
      : [];
    return {
      ...EMPTY_PROGRESS,
      lessonsDone: [...new Set(lessons)].sort((a, b) => a - b),
      practised: Math.max(0, Math.min(MAX_PRACTICE, Math.floor(practised))),
      weak,
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

/** Write it back. Silent on failure, for the same reason. */
export function saveProgress(progress: Progress): void {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        lessonsDone: progress.lessonsDone,
        practised: progress.practised,
        weak: progress.weak,
      }),
    );
  } catch {
    /* Site data is off. The app still works; the place is just not kept. */
  }
}

/** True where this device can remember anything at all. */
export function storageWorks(): boolean {
  try {
    const probe = `${KEY}.probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Mark a lesson finished and return the new progress. */
export function markLessonDone(index: number): Progress {
  const current = loadProgress();
  if (current.lessonsDone.includes(index)) return current;
  const next: Progress = {
    ...current,
    lessonsDone: [...current.lessonsDone, index].sort((a, b) => a - b),
  };
  saveProgress(next);
  return next;
}

/** Count problems practised, saturating rather than wrapping. */
export function countPractised(howMany: number): Progress {
  const current = loadProgress();
  const next: Progress = {
    ...current,
    practised: Math.min(MAX_PRACTICE, current.practised + Math.max(0, howMany)),
  };
  saveProgress(next);
  return next;
}

/**
 * Record that an error class happened.
 *
 * A class becomes "weak" only on the SECOND time. Once is a slip and everybody
 * has them; twice is a pattern, and offering targeted practice off a single
 * mistake would be the app telling a student they are bad at something they
 * merely mistyped.
 *
 * The running tally lives outside the progress record and is NOT carried in the
 * code: it is working state on the way to a conclusion, and a code that carried
 * "you have got this wrong once" would be carrying noise between devices.
 */
export function recordError(name: ErrorClass): Progress {
  const current = loadProgress();
  if (current.weak.includes(name)) return current;

  let tally: Record<string, number> = {};
  try {
    const raw = window.localStorage.getItem(TALLY_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) tally = parsed as Record<string, number>;
    }
  } catch {
    tally = {};
  }

  const seen = (typeof tally[name] === 'number' ? tally[name] : 0) + 1;
  tally[name] = seen;
  try {
    window.localStorage.setItem(TALLY_KEY, JSON.stringify(tally));
  } catch {
    /* As above. */
  }

  if (seen < WEAK_AFTER) return current;
  const next: Progress = {
    ...current,
    weak: ERROR_CLASSES.filter((klass) => klass === name || current.weak.includes(klass)),
  };
  saveProgress(next);
  return next;
}

/**
 * Take in progress from a code and keep everything.
 *
 * The merge is a union, so this can only ever add. See `mergeProgress` — an
 * older code typed over newer progress must not un-finish a lesson, and the
 * only way a student would notice the other behaviour is by watching something
 * they had done come undone.
 */
export function adoptProgress(incoming: Progress): Progress {
  const merged = mergeProgress(loadProgress(), incoming);
  saveProgress(merged);
  return merged;
}
