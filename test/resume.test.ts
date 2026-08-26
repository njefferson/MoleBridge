/**
 * resume.test.ts — a session comes back the way it left, and a bad one does not
 * come back at all.
 *
 * A restored session that the app cannot grade is worse than starting again: the
 * student sits in front of a problem, answers it, and finds out then. So the
 * validator is strict and this leans on it hard.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isSavedSession, isWorthResuming, type SavedSession } from '../src/engine/resume.ts';
import {
  completionPayload,
  currentStage,
  elapsedFor,
  resumeSession,
  startSession,
  submit,
  correctEntryFor,
  currentProblem,
  type SessionConfig,
} from '../src/engine/steps.ts';
import { solve } from '../src/engine/problem.ts';

const CONFIG: SessionConfig = {
  mode: 'assignment',
  assignmentKey: 'RESUME-A',
  assignmentKeyId: 77,
  rosterId: 19,
  tier: 2,
  problemCount: 2,
  assignmentEpochMs: Date.UTC(2026, 7, 1),
};

const clockAt = (ms: number) => ({ now: () => ms });
const MINUTE = 60_000;

test('a session survives a round trip through storage', () => {
  const start = Date.UTC(2026, 7, 20, 9, 0);
  let session = startSession(CONFIG, clockAt(start));
  // Answer the first stage so the restored session has something to be wrong about.
  const problem = currentProblem(session);
  session = submit(session, correctEntryFor(problem, solve(problem), currentStage(session)), clockAt(start + MINUTE)).session;

  const saved: SavedSession = { saved: 1, session, atMs: start + MINUTE, entry: ['12.5 g'] };
  const text = JSON.stringify(saved);
  const back: unknown = JSON.parse(text);
  assert.ok(isSavedSession(back), 'a session this build wrote is not one it will read');
  assert.deepEqual((back as SavedSession).session, session, 'the session changed shape in storage');
  assert.deepEqual((back as SavedSession).entry, ['12.5 g']);
});

test('A BREAK COSTS NOTHING. the gap between stretches is not counted', () => {
  /*
    The reason `elapsedBeforeMs` exists. A student who stops for forty minutes
    and comes back must not have forty minutes added to what their code reports:
    the number is labelled "how long you had it open", and a break is exactly
    the time it was not open. For the student the break is an accommodation for,
    counting it would punish them for using it.
  */
  const start = Date.UTC(2026, 7, 20, 9, 0);
  const closed = start + 10 * MINUTE;
  const reopened = closed + 40 * MINUTE;

  const session = startSession(CONFIG, clockAt(start));
  const picked = resumeSession(session, clockAt(reopened), closed);

  // Ten minutes worked, then five more after the break.
  const worked = elapsedFor(picked, clockAt(reopened + 5 * MINUTE));
  assert.equal(worked, 15 * MINUTE, 'the forty-minute break was counted as work');

  const payload = completionPayload(picked, clockAt(reopened + 5 * MINUTE));
  assert.equal(payload.durationMin, 15, `the code says ${payload.durationMin} minutes`);
});

test('every count and position comes back untouched', () => {
  const start = Date.UTC(2026, 7, 20, 9, 0);
  let session = startSession(CONFIG, clockAt(start));
  const problem = currentProblem(session);
  // One wrong answer, so a counter is non-zero and would show if it were lost.
  session = submit(session, { kind: 'coefficients', values: [9, 9, 9, 9] }, clockAt(start)).session;
  session = submit(session, correctEntryFor(problem, solve(problem), currentStage(session)), clockAt(start)).session;

  const restored = resumeSession(session, clockAt(start + MINUTE), start + MINUTE);
  for (const field of ['problemIndex', 'stageIndex', 'attempted', 'firstTryCorrect', 'unclassified', 'collisions'] as const) {
    assert.equal(restored[field], session[field], `${field} changed on resume`);
  }
  assert.deepEqual(restored.stageErrors, session.stageErrors, 'the error counts changed on resume');
  assert.equal(restored.cleanSoFar, session.cleanSoFar);
  assert.deepEqual(restored.config, session.config);
});

test('anything that is not a session this build wrote is refused', () => {
  const start = Date.UTC(2026, 7, 20, 9, 0);
  const good: SavedSession = {
    saved: 1,
    session: startSession(CONFIG, clockAt(start)),
    atMs: start,
    entry: [],
  };
  assert.ok(isSavedSession(JSON.parse(JSON.stringify(good))));

  const rubbish: unknown[] = [
    null, undefined, 42, 'a string', [], {},
    { saved: 2, session: good.session, atMs: start, entry: [] },
    { saved: 1, session: good.session, atMs: 'soon', entry: [] },
    { saved: 1, session: good.session, atMs: start, entry: [3] },
    { saved: 1, session: { ...good.session, config: undefined }, atMs: start, entry: [] },
    { saved: 1, session: { ...good.session, stageErrors: {} }, atMs: start, entry: [] },
    { saved: 1, session: { ...good.session, finished: 'no' }, atMs: start, entry: [] },
    { saved: 1, session: { ...good.session, config: { ...CONFIG, mode: 'exam' } }, atMs: start, entry: [] },
    { saved: 1, session: { ...good.session, config: { ...CONFIG, assignmentKey: '' } }, atMs: start, entry: [] },
    { saved: 1, session: { ...good.session, problemIndex: Number.NaN }, atMs: start, entry: [] },
  ];
  for (const value of rubbish) {
    assert.equal(isSavedSession(value), false, `accepted ${JSON.stringify(value)?.slice(0, 60)}`);
  }
});

test('a finished session is not offered back', () => {
  const start = Date.UTC(2026, 7, 20, 9, 0);
  const session = startSession(CONFIG, clockAt(start));
  assert.ok(isWorthResuming({ saved: 1, session, atMs: start, entry: [] }));
  assert.equal(
    isWorthResuming({ saved: 1, session: { ...session, finished: true }, atMs: start, entry: [] }),
    false,
    'a finished session would drop the student back onto a screen they were done with',
  );
});
