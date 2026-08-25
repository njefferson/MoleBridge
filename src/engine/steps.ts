/**
 * steps.ts — the step state machine.
 *
 * The student enters EVERY intermediate value, and cannot advance until the one
 * in front of them validates. That is the whole point: a single final answer
 * tells a teacher that something went wrong, and this tells them WHERE and WHY.
 *
 * IMMUTABLE. `submit` returns a new session rather than mutating one, so a
 * screen can hold the previous state, a test can replay a session, and nothing
 * depends on the order two callers happen to run in.
 *
 * THE CLOCK IS INJECTED. §11 forbids date access in this engine, and the reason
 * is not purity for its own sake: the completion code carries a duration and a
 * day offset, and a test that cannot control those cannot check them.
 *
 * COLLISIONS ARE COUNTED, NOT SWALLOWED. If an entry matches two error classes,
 * §6.2 says the decomposition is wrong. The machine records it on the session
 * where the test suite and the CLI can see it, counts the entry as
 * unclassified, and carries on — a student mid-problem is not the right place
 * to surface an engine defect, and hiding it entirely is how it would survive.
 */

import {
  type CompletionPayload,
  CODE_VERSION,
  FIELD_MAX,
} from '../code/codec.ts';
import { formatUnambiguous } from '../chem/sigfig.ts';
import { generateProblem, solve, type Problem, type Solution } from './problem.ts';
import {
  algebraFor,
  buildRemediation,
  classify,
  stagesFor,
  type Classification,
  type CounterStage,
  type Remediation,
  type Stage,
  type StudentEntry,
} from './taxonomy.ts';

/** Milliseconds in a day, for the completion code's day offset. */
const MS_PER_DAY = 86_400_000;
/** Milliseconds in a minute, for the completion code's duration. */
const MS_PER_MINUTE = 60_000;

/**
 * The only way this engine learns what time it is.
 *
 * PRECONDITION: `now()` returns milliseconds since the Unix epoch and does not
 * go backwards within a session.
 */
export interface Clock {
  now(): number;
}

/** A clock that never moves, for tests and for a deterministic CLI run. */
export function fixedClock(atMs: number): Clock {
  let current = atMs;
  return {
    now: () => current,
    // eslint-disable-next-line
  } as Clock & { advance?: never };
}

/** A clock a test can wind forward. */
export interface ControllableClock extends Clock {
  advance(ms: number): void;
}

/**
 * A clock under the caller's control.
 *
 * PRECONDITION: `startMs` is a millisecond epoch value.
 */
export function controllableClock(startMs: number): ControllableClock {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** What a session needs to start. */
/**
 * Which door the student came through.
 *
 * THIS IS THE CODE WALL. A practice session can never produce a completion
 * code — `completionPayload` throws on one rather than returning something the
 * UI is trusted to discard. Practice shows answers on request, so if it could
 * also emit a code, "practice" would be the route to credit without work, and
 * the whole grading posture would rest on a screen remembering not to offer a
 * button.
 */
export type SessionMode = 'assignment' | 'practice';

export interface SessionConfig {
  readonly mode: SessionMode;
  /**
   * What problems get generated. In assignment mode this is the teacher's key,
   * typed off the board. In practice it is a seed — random unless the student
   * typed one — and it is SHOWN to them, so any problem can be reopened, handed
   * to a friend, or brought to a teacher. A random button that keeps its roll
   * to itself makes every problem unrepeatable.
   */
  readonly assignmentKey: string;
  /** The same assignment, as the 12-bit number the completion code carries. */
  readonly assignmentKeyId: number;
  /** The teacher-assigned roster number, 1-4095. NEVER a name. */
  readonly rosterId: number;
  readonly tier: number;
  readonly problemCount: number;
  /** Epoch the day offset is measured from, in milliseconds. */
  readonly assignmentEpochMs: number;
}

/** Errors counted against each of the six code counters. */
export type StageCounts = { readonly [K in CounterStage]: number };

/** Everything the session has recorded. Immutable. */
export interface Session {
  readonly config: SessionConfig;
  readonly startedAtMs: number;
  /** Index of the problem in front of the student. Equals `problemCount` when done. */
  readonly problemIndex: number;
  /** Index into the current problem's stage list. */
  readonly stageIndex: number;
  /** Wrong entries at the current stage, this problem. */
  readonly attemptsAtStage: number;
  /** True while every stage of the current problem has been right first time. */
  readonly cleanSoFar: boolean;
  readonly attempted: number;
  readonly firstTryCorrect: number;
  readonly stageErrors: StageCounts;
  readonly algebraTriggers: number;
  readonly unclassified: number;
  /** Entries that matched two error classes. A defect signal — see the header. */
  readonly collisions: number;
  readonly finished: boolean;
}

const ZERO_COUNTS: StageCounts = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0 };

/**
 * Begin a session.
 *
 * PRECONDITION: `config.problemCount` is a positive integer and `config.tier`
 * is one the generator knows. The clock is read once, for the start time.
 */
export function startSession(config: SessionConfig, clock: Clock): Session {
  return {
    config,
    startedAtMs: clock.now(),
    problemIndex: 0,
    stageIndex: 0,
    attemptsAtStage: 0,
    cleanSoFar: true,
    attempted: 0,
    firstTryCorrect: 0,
    stageErrors: ZERO_COUNTS,
    algebraTriggers: 0,
    unclassified: 0,
    collisions: 0,
    finished: config.problemCount <= 0,
  };
}

/**
 * The problem in front of the student.
 *
 * PRECONDITION: the session is not finished. THROWS if it is, because asking a
 * finished session for its current problem is a caller bug rather than a state.
 */
export function currentProblem(session: Session): Problem {
  if (session.finished) throw new Error('the session is finished; there is no current problem');
  return generateProblem(session.config.assignmentKey, session.config.tier, session.problemIndex);
}

/**
 * The stage in front of the student.
 *
 * PRECONDITION: as {@link currentProblem}.
 */
export function currentStage(session: Session): Stage {
  const stages = stagesFor(currentProblem(session));
  const stage = stages[session.stageIndex];
  if (stage === undefined) throw new Error(`stage ${session.stageIndex} is past the end of this problem`);
  return stage;
}

/** What one submission did. */
export interface SubmitResult {
  readonly session: Session;
  readonly classification: Classification;
  /** True where the stage validated and the student moved on. */
  readonly advanced: boolean;
  /**
   * The algebra micro-remediation to show at this stage, or null. §7: injected
   * at the failing stage, never offered as a menu.
   */
  readonly remediation: readonly Remediation[];
  /** True where that entry finished the problem. */
  readonly problemComplete: boolean;
  /** True where that entry finished the session. */
  readonly sessionComplete: boolean;
}

const bump = (counts: StageCounts, stage: CounterStage): StageCounts => ({
  ...counts,
  [stage]: Math.min(FIELD_MAX[`err${stage}`], counts[stage] + 1),
});

/**
 * Submit one entry at the current stage.
 *
 * PRECONDITION: the session is not finished, and `entry.kind` suits the current
 * stage. A mismatch is classified E-UNCLASSIFIED rather than throwing — see
 * {@link classify}.
 *
 * The clock is read only when the session ends, so a session's duration is the
 * time between its first stage and its last.
 */
export function submit(session: Session, entry: StudentEntry, clock: Clock): SubmitResult {
  if (session.finished) throw new Error('the session is finished; nothing more can be submitted');

  const problem = currentProblem(session);
  const solution: Solution = solve(problem);
  const stages = stagesFor(problem);
  const stage = stages[session.stageIndex] as Stage;
  const classification = classify(problem, solution, stage, entry);

  if (classification.correct) {
    const lastStage = session.stageIndex + 1 >= stages.length;
    const cleanProblem = session.cleanSoFar && session.attemptsAtStage === 0;
    const nextProblemIndex = lastStage ? session.problemIndex + 1 : session.problemIndex;
    const sessionComplete = lastStage && nextProblemIndex >= session.config.problemCount;

    const next: Session = {
      ...session,
      problemIndex: nextProblemIndex,
      stageIndex: lastStage ? 0 : session.stageIndex + 1,
      attemptsAtStage: 0,
      cleanSoFar: lastStage ? true : cleanProblem,
      attempted: lastStage ? session.attempted + 1 : session.attempted,
      firstTryCorrect:
        lastStage && cleanProblem ? session.firstTryCorrect + 1 : session.firstTryCorrect,
      finished: sessionComplete,
    };
    return {
      session: next,
      classification,
      advanced: true,
      remediation: [],
      problemComplete: lastStage,
      sessionComplete,
    };
  }

  const skills =
    classification.errorClass === null ? [] : algebraFor(classification.errorClass, classification.logError);
  const remediation = skills.map((skill) => buildRemediation(skill, problem, solution, stage));

  const next: Session = {
    ...session,
    attemptsAtStage: session.attemptsAtStage + 1,
    cleanSoFar: false,
    stageErrors: bump(session.stageErrors, stage.counter),
    algebraTriggers:
      remediation.length > 0
        ? Math.min(FIELD_MAX.algebraTriggers, session.algebraTriggers + 1)
        : session.algebraTriggers,
    unclassified:
      classification.errorClass === 'E-UNCLASSIFIED' || classification.collision
        ? Math.min(FIELD_MAX.unclassified, session.unclassified + 1)
        : session.unclassified,
    collisions: classification.collision ? session.collisions + 1 : session.collisions,
  };

  return {
    session: next,
    classification,
    advanced: false,
    remediation,
    problemComplete: false,
    sessionComplete: false,
  };
}

/**
 * Turn a session into the payload a completion code carries.
 *
 * PRECONDITION: none — an unfinished session encodes what it has so far, which
 * is what a student who runs out of lesson time should be able to hand in.
 * Every counter is already saturated by {@link submit}; the codec saturates
 * again, which is belt and braces on the two fields this computes here.
 */
export function completionPayload(session: Session, clock: Clock): CompletionPayload {
  // THE WALL, and it throws rather than returning an empty code. A caller that
  // asks a practice session for a payload has a bug, and the loud version of
  // that bug is a stack trace in a test rather than a code a student can hand
  // in for work they watched the app do.
  if (session.config.mode !== 'assignment') {
    throw new Error('a practice session has no completion code, and must never be asked for one');
  }
  const elapsedMs = Math.max(0, clock.now() - session.startedAtMs);
  const dayOffset = Math.floor((session.startedAtMs - session.config.assignmentEpochMs) / MS_PER_DAY);
  return {
    version: CODE_VERSION,
    assignmentKeyId: session.config.assignmentKeyId,
    rosterId: session.config.rosterId,
    attempted: Math.min(FIELD_MAX.attempted, session.attempted),
    firstTryCorrect: Math.min(FIELD_MAX.firstTryCorrect, session.firstTryCorrect),
    errS1: session.stageErrors.S1,
    errS2: session.stageErrors.S2,
    errS3: session.stageErrors.S3,
    errS4: session.stageErrors.S4,
    errS5: session.stageErrors.S5,
    errS6: session.stageErrors.S6,
    algebraTriggers: session.algebraTriggers,
    unclassified: session.unclassified,
    durationMin: Math.min(FIELD_MAX.durationMin, Math.floor(elapsedMs / MS_PER_MINUTE)),
    dayOffset: Math.max(0, Math.min(FIELD_MAX.dayOffset, dayOffset)),
  };
}

/**
 * The correct answer at a stage, as an entry — what a simulated student who
 * knows the chemistry would type.
 *
 * ANSWER KEY. For the CLI harness and the test suite. Never for a screen.
 *
 * PRECONDITION: `stage` belongs to `problem`.
 */
export function correctEntryFor(problem: Problem, solution: Solution, stage: Stage): StudentEntry {
  switch (stage.kind) {
    case 'COEFFICIENTS':
      return { kind: 'coefficients', values: solution.coefficients.slice() };
    case 'CHOICE':
      return { kind: 'choice', speciesIndex: solution.limitingIndex as number };
    default: {
      const value = numericAnswer(problem, solution, stage);
      const digits = stage.gradesSigFigs ? problem.answerSigFigs : SCRATCH_SIG_FIGS;
      const text = formatUnambiguous(value, Math.min(21, digits));
      return { kind: 'text', text: stage.unit === 'none' ? text : `${text} ${stage.unit}` };
    }
  }
}

/**
 * Figures a simulated student writes at an intermediate stage. More than any
 * answer is graded to, so the simulation never trips E-ROUND-EARLY by accident
 * — carrying full precision through is exactly what the stage machine wants.
 *
 * FOR THE SIMULATION ONLY. `correctEntryFor` exists to DRIVE a session — the
 * tests and the command-line harness submit its result — and twelve figures is
 * load-bearing there. It is not a number to show a person, and the practice
 * reveal borrowed it for months: a student who asked for the molar mass of
 * glucose was told "180.156000000 g/mol", nine zeros of precision the value
 * does not have and nobody asked for. Caught on a real screen, not by any gate.
 */
const SCRATCH_SIG_FIGS = 12;

/**
 * Figures the practice reveal shows a PERSON.
 *
 * Six, and the two constraints that pick it: enough that carrying the revealed
 * value forward cannot trip E-ROUND-EARLY, which grades against the problem's
 * own precision and is never more than four; and few enough that the number
 * reads as a quantity rather than as a machine's output. `formatUnambiguous`
 * pads to the figures asked for, so asking for twelve is what produced the
 * zeros — the fix is asking for a number of figures a person would write.
 */
export const REVEAL_SIG_FIGS = 6;

/**
 * What the practice reveal SAYS, as opposed to what the grader submits.
 *
 * Same value, from the same solution, formatted for reading. Kept beside
 * `correctEntryFor` rather than in the UI because the rule that a screen never
 * computes an answer has no exception for formatting one.
 */
export function revealEntryFor(problem: Problem, solution: Solution, stage: Stage): StudentEntry {
  const entry = correctEntryFor(problem, solution, stage);
  if (entry.kind !== 'text') return entry;
  const value = numericAnswer(problem, solution, stage);
  /*
    THE GRADED STAGE AND THE INTERMEDIATE ONES ARE FORMATTED DIFFERENTLY, and
    that is the point rather than an inconsistency.

    Where figures are GRADED, `formatUnambiguous` is exactly right: it pads to
    the problem's precision because at that stage the trailing zeros ARE the
    answer — writing 1.5 where 1.50 was asked for is E-SIG-FIGS, and a reveal
    that hid the distinction would be teaching against the thing being marked.

    Where they are not, padding is machine output. A mole ratio of three over
    two came out as "1.50000" and a molar mass as "180.156000000"; a person
    writes 1.5 and 180.156. So an intermediate is shown at its own precision,
    up to REVEAL_SIG_FIGS, with the padding trimmed.
  */
  const text = stage.gradesSigFigs
    ? formatUnambiguous(value, problem.answerSigFigs)
    : trimPadding(value.toPrecision(REVEAL_SIG_FIGS));
  return { kind: 'text', text: stage.unit === 'none' ? text : `${text} ${stage.unit}` };
}

/**
 * Trailing zeros off a fixed-precision string, without touching the integer
 * part — 1.50000 is 1.5, and 1800 is emphatically not 18.
 *
 * An exponential form is left alone: there is no padding to strip that is not
 * carrying meaning, and rewriting one by hand is how a value gets mangled.
 */
function trimPadding(text: string): string {
  if (!text.includes('.') || text.includes('e') || text.includes('E')) return text;
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

/** The correct value at a numeric stage. ANSWER KEY. */
export function numericAnswer(problem: Problem, solution: Solution, stage: Stage): number {
  switch (stage.id) {
    case 'S2':
      return solution.mmGiven;
    case 'S3':
      return solution.molGiven;
    case 'S3b':
      return solution.molSecond as number;
    case 'S4':
      return solution.ratio;
    case 'S4b':
      return solution.molWantedFromSecond as number;
    case 'S5':
      return solution.molWanted;
    case 'S6':
      return solution.converted;
    case 'S7':
      return solution.percentYield as number;
    default:
      throw new Error(`${stage.id} is not a numeric stage`);
  }
}
