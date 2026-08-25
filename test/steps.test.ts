/**
 * steps.test.ts — the gate, the counters, and the injected clock.
 *
 * The state machine's job is that a student cannot get past a stage they have
 * not got right, and that what went wrong is counted where the completion code
 * can carry it. Both are asserted here against real generated problems rather
 * than a hand-built fixture, because the counters have to survive the stages
 * that only appear in some problems.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  completionPayload,
  controllableClock,
  correctEntryFor,
  currentProblem,
  currentStage,
  numericAnswer,
  startSession,
  submit,
  type Session,
  type SessionConfig,
} from '../src/engine/steps.ts';
import { generateProblem, solve } from '../src/engine/problem.ts';
import { predictionsFor, stagesFor, type Prediction } from '../src/engine/taxonomy.ts';
import { checkConsistency, decodeCompletionCode, encodeCompletionCode } from '../src/code/codec.ts';
import { formatUnambiguous } from '../src/chem/sigfig.ts';

const SECRET = 'steps-test-secret';
const EPOCH = Date.UTC(2026, 8, 1);
const START = Date.UTC(2026, 8, 14, 9, 0, 0);

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  mode: 'assignment',
  assignmentKey: 'CHEM-A',
  assignmentKeyId: 1234,
  rosterId: 17,
  tier: 1,
  problemCount: 3,
  assignmentEpochMs: EPOCH,
  ...overrides,
});

/** Answer every stage correctly until the session ends. */
function runPerfect(tier: number, problems: number): { session: Session; entries: number } {
  const clock = controllableClock(START);
  let session = startSession(config({ tier, problemCount: problems }), clock);
  let entries = 0;
  while (!session.finished) {
    entries += 1;
    assert.ok(entries < 500, 'the stage machine is not advancing');
    const problem = currentProblem(session);
    const solution = solve(problem);
    const stage = currentStage(session);
    clock.advance(30_000);
    const result = submit(session, correctEntryFor(problem, solution, stage), clock);
    assert.equal(
      result.advanced,
      true,
      `${stage.id} refused its own correct answer: ${result.classification.errorClass} — ${result.classification.why}`,
    );
    session = result.session;
  }
  return { session, entries };
}

test('a perfect session on every tier finishes and counts itself right', () => {
  for (const tier of [1, 2, 3, 4]) {
    const { session } = runPerfect(tier, 4);
    assert.equal(session.finished, true, `tier ${tier}`);
    assert.equal(session.attempted, 4);
    assert.equal(session.firstTryCorrect, 4);
    assert.equal(session.collisions, 0);
    assert.equal(session.unclassified, 0);
    assert.deepEqual(session.stageErrors, { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0 });
  }
});

test('a limiting-reagent problem really does carry the extra stages', () => {
  const problem = generateProblem('CHEM-A', 3, 0);
  const ids = stagesFor(problem).map((s) => s.id);
  assert.deepEqual(ids, ['S1', 'S2', 'S3', 'S3b', 'S4', 'S4b', 'S4c', 'S5', 'S6']);

  const yieldProblem = generateProblem('CHEM-A', 4, 0);
  assert.deepEqual(stagesFor(yieldProblem).map((s) => s.id), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);

  const plain = generateProblem('CHEM-A', 1, 0);
  assert.deepEqual(stagesFor(plain).map((s) => s.id), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
});

test('the inserted stages report into the six counters the code carries', () => {
  const problem = generateProblem('CHEM-A', 3, 0);
  for (const stage of stagesFor(problem)) {
    assert.ok(['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].includes(stage.counter), stage.id);
  }
  const counters = stagesFor(problem).map((s) => `${s.id}->${s.counter}`);
  assert.deepEqual(counters, [
    'S1->S1', 'S2->S2', 'S3->S3', 'S3b->S3', 'S4->S4', 'S4b->S4', 'S4c->S4', 'S5->S5', 'S6->S6',
  ]);
});

test('a wrong entry does not advance, and is counted at its stage', () => {
  const clock = controllableClock(START);
  let session = startSession(config({ tier: 1, problemCount: 1 }), clock);
  const problem = currentProblem(session);
  const solution = solve(problem);
  const stage = currentStage(session);
  assert.equal(stage.id, 'S1');

  const doubled = solution.coefficients.map((c) => c * 2);
  const wrong = submit(session, { kind: 'coefficients', values: doubled }, clock);
  assert.equal(wrong.advanced, false);
  assert.equal(wrong.classification.errorClass, 'E-BAL-NOTLOWEST');
  assert.equal(wrong.session.stageErrors.S1, 1);
  assert.equal(wrong.session.attemptsAtStage, 1);
  assert.equal(wrong.session.cleanSoFar, false);
  assert.equal(wrong.session.problemIndex, 0);

  session = wrong.session;
  const right = submit(session, correctEntryFor(problem, solution, stage), clock);
  assert.equal(right.advanced, true);
  assert.equal(right.session.stageIndex, 1);
  // The error stands on the record: getting it right afterwards does not undo it.
  assert.equal(right.session.stageErrors.S1, 1);
});

test('a problem is first-try-correct only if EVERY stage was right first time', () => {
  const clock = controllableClock(START);
  let session = startSession(config({ tier: 1, problemCount: 2 }), clock);

  // First problem: get the last stage wrong once.
  let stagesDone = 0;
  while (session.problemIndex === 0) {
    const problem = currentProblem(session);
    const solution = solve(problem);
    const stage = currentStage(session);
    const stages = stagesFor(problem);
    if (stagesDone === stages.length - 1) {
      const wrong = submit(session, { kind: 'text', text: '0.00001 g' }, clock);
      assert.equal(wrong.advanced, false);
      session = wrong.session;
    }
    session = submit(session, correctEntryFor(problem, solution, stage), clock).session;
    stagesDone += 1;
  }
  assert.equal(session.attempted, 1);
  assert.equal(session.firstTryCorrect, 0, 'one wrong entry costs the whole problem');

  // Second problem clean.
  while (!session.finished) {
    const problem = currentProblem(session);
    const solution = solve(problem);
    session = submit(session, correctEntryFor(problem, solution, currentStage(session)), clock).session;
  }
  assert.equal(session.attempted, 2);
  assert.equal(session.firstTryCorrect, 1);
});

test('remediation arrives at the failing stage, and only where §7 maps one', () => {
  const clock = controllableClock(START);
  const session = startSession(config({ tier: 1, problemCount: 1 }), clock);
  const problem = currentProblem(session);
  const solution = solve(problem);

  // Walk to S3, then invert the molar mass.
  let walking = session;
  for (const stage of stagesFor(problem)) {
    if (stage.id === 'S3') {
      const inverted = problem.given.value * solution.mmGiven;
      const result = submit(walking, {
        kind: 'text',
        text: `${formatUnambiguous(inverted, 6)} mol`,
      }, clock);
      assert.equal(result.classification.errorClass, 'E-MOL-INVERTED');
      assert.deepEqual(result.remediation.map((r) => r.skill), ['A2', 'A3']);
      assert.equal(result.session.algebraTriggers, 1, 'one branch entered, however many skills it shows');
      // And the remediation is about THIS stage's relation.
      assert.ok(result.remediation[0]?.lines.join(' ').includes(String(problem.given.value)));
      break;
    }
    walking = submit(walking, correctEntryFor(problem, solution, stage), clock).session;
  }
});

test('the clock is injected, and the duration is what the clock did', () => {
  const clock = controllableClock(START);
  let session = startSession(config({ tier: 1, problemCount: 1 }), clock);
  while (!session.finished) {
    const problem = currentProblem(session);
    const solution = solve(problem);
    clock.advance(60_000);
    session = submit(session, correctEntryFor(problem, solution, currentStage(session)), clock).session;
  }
  const payload = completionPayload(session, clock);
  assert.equal(payload.durationMin, 6, 'six stages at a minute each');
  assert.equal(payload.dayOffset, 13, '14 September against a 1 September epoch');

  // Wind it far enough forward and the counters saturate rather than wrap.
  clock.advance(1000 * 60 * 60 * 24 * 365);
  const later = completionPayload(session, clock);
  assert.equal(later.durationMin, 127);
});

test('a session encodes to a code that decodes back to the same counts', () => {
  for (const tier of [1, 2, 3, 4]) {
    const { session } = runPerfect(tier, 3);
    const clock = controllableClock(START + 60_000);
    const payload = completionPayload(session, clock);
    assert.deepEqual(checkConsistency(payload), [], `tier ${tier} produced an inconsistent payload`);
    const code = encodeCompletionCode(payload, SECRET);
    const decoded = decodeCompletionCode(code, SECRET);
    assert.equal(decoded.verdict, 'VALID', `tier ${tier}: ${decoded.detail}`);
    assert.deepEqual(decoded.fields, payload);
  }
});

test('a session full of wrong answers still encodes to a consistent code', () => {
  const clock = controllableClock(START);
  let session = startSession(config({ tier: 3, problemCount: 3 }), clock);
  let guard = 0;
  while (!session.finished) {
    guard += 1;
    assert.ok(guard < 900);
    const problem = currentProblem(session);
    const solution = solve(problem);
    const stage = currentStage(session);
    clock.advance(20_000);

    if (session.attemptsAtStage === 0) {
      const { predictions } = predictionsFor(problem, solution, stage);
      const prediction = predictions[0] as Prediction | undefined;
      if (prediction !== undefined) {
        const entry =
          prediction.coefficients !== undefined
            ? ({ kind: 'coefficients', values: prediction.coefficients } as const)
            : prediction.choice !== undefined
              ? ({ kind: 'choice', speciesIndex: prediction.choice } as const)
              : ({
                  kind: 'text',
                  text: `${formatUnambiguous(prediction.value as number, problem.answerSigFigs)}${stage.unit === 'none' ? '' : ` ${stage.unit}`}`,
                } as const);
        const result = submit(session, entry, clock);
        assert.equal(result.advanced, false, `${stage.id} accepted a predicted wrong answer`);
        assert.equal(result.classification.collision, false);
        session = result.session;
      }
    }
    session = submit(session, correctEntryFor(problem, solution, stage), clock).session;
  }

  assert.equal(session.attempted, 3);
  assert.equal(session.firstTryCorrect, 0);
  assert.ok(Object.values(session.stageErrors).reduce((a, b) => a + b, 0) > 0);
  assert.equal(session.collisions, 0);

  const payload = completionPayload(session, clock);
  assert.deepEqual(checkConsistency(payload), []);
  const decoded = decodeCompletionCode(encodeCompletionCode(payload, SECRET), SECRET);
  assert.equal(decoded.verdict, 'VALID');
  assert.deepEqual(decoded.fields, payload);
});

test('a finished session refuses further submissions rather than miscounting', () => {
  const { session } = runPerfect(1, 1);
  assert.equal(session.finished, true);
  const clock = controllableClock(START);
  assert.throws(() => submit(session, { kind: 'text', text: '1' }, clock), /finished/);
  assert.throws(() => currentProblem(session), /finished/);
});

test('an unfinished session still hands in what it has', () => {
  const clock = controllableClock(START);
  let session = startSession(config({ tier: 1, problemCount: 5 }), clock);
  const problem = currentProblem(session);
  const solution = solve(problem);
  clock.advance(120_000);
  session = submit(session, correctEntryFor(problem, solution, currentStage(session)), clock).session;

  const payload = completionPayload(session, clock);
  assert.equal(payload.attempted, 0, 'no problem is finished yet');
  assert.equal(payload.durationMin, 2);
  assert.deepEqual(checkConsistency(payload), []);
  assert.equal(decodeCompletionCode(encodeCompletionCode(payload, SECRET), SECRET).verdict, 'VALID');
});

test('numericAnswer refuses to answer a stage that is not numeric', () => {
  const problem = generateProblem('CHEM-A', 3, 0);
  const solution = solve(problem);
  const s1 = stagesFor(problem)[0];
  assert.notEqual(s1, undefined);
  if (s1 !== undefined) assert.throws(() => numericAnswer(problem, solution, s1), /not a numeric stage/);
});

test('a practice session has no completion code, and asking for one throws', () => {
  // THE CODE WALL. Practice shows answers on request, so if it could also emit
  // a code then "practice" would be the route to credit for work the app did in
  // front of you — and the whole grading posture would rest on a screen
  // remembering not to render a button. It rests here instead.
  const practice = startSession(config({ mode: 'practice' }), controllableClock(START));
  assert.throws(
    () => completionPayload(practice, controllableClock(START)),
    /practice session has no completion code/,
    'a practice session must refuse to produce a payload at all',
  );

  // And the same session in assignment mode still does, so the refusal is about
  // the mode rather than about something else being wrong.
  const assigned = startSession(config({ mode: 'assignment' }), controllableClock(START));
  assert.ok(
    completionPayload(assigned, controllableClock(START)).assignmentKeyId >= 0,
    'assignment mode is unaffected',
  );
});
