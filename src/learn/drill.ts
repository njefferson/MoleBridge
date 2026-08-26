/**
 * drill.ts — one step, as many times as you like.
 *
 * ## Why a whole problem is the wrong unit for learning a step
 *
 * A student who inverts the mole ratio has to walk five other steps to reach the
 * one they are failing. That is not practice, it is a tax on the thing they came
 * to fix. Whole problems are INTERLEAVED practice, which is what makes a skill
 * stick once you have it; a skill you do not have yet is built by BLOCKED
 * practice — the same move, again, until it is yours. The app only had the first.
 *
 * The engine was ready for this and nobody had asked: `classify` is a pure
 * function of a problem, a stage and an entry. A drill is a loop around it. No
 * session, no completion code, nothing recorded anywhere.
 *
 * ## NO SCORE, NO STREAK, NO REWARD
 *
 * This is a hard rule, not a style preference. Streaks, points, badges and
 * "Great job!" teach a student to chase the animation, and they make stopping
 * feel like failing — which is exactly wrong for the person who most needs to do
 * twenty of these. So:
 *
 *   - nothing is counted at them while they work; each answer gets the same
 *     attribution it would get anywhere else in the app, and nothing more
 *   - there is no target. They stop when they want, and stopping is not a state
 *     the app has an opinion about
 *   - the summary at the end reports WHAT HAPPENED and, where there is one, what
 *     CHANGED. "Your first four had the ratio upside down; the last five did
 *     not" is the most encouraging true thing available, and it is true
 *
 * A good tutor does not say "5 out of 7". They say "that one went upside down
 * again, here is why" and, at the end, "you were getting these wrong the same
 * way and now you are not". That is what this file is trying to be.
 */

import { generateProblem, solve, type Problem, type Solution } from '../engine/problem.ts';
import { classify, stagesFor, type Classification, type Stage, type StudentEntry } from '../engine/taxonomy.ts';

/** A step a student can choose to drill, and where it comes from. */
export interface Drillable {
  readonly stageId: string;
  /** What to call it, in the words the app already uses for the step rail. */
  readonly name: string;
  /** One line saying what the step actually asks of you. */
  readonly what: string;
  /**
   * A tier that reliably produces this stage.
   *
   * Not every problem has every step: the limiting-reactant steps only exist
   * where two reactants are given, and percent yield only where a yield is. A
   * drill that generated problems without its own step would hand a student an
   * empty screen, so the tier is part of the choice rather than a guess.
   */
  readonly tier: number;
}

export const DRILLABLE: readonly Drillable[] = [
  { stageId: 'S1', name: 'Balancing', what: 'Put the coefficients in front so both sides have the same atoms.', tier: 1 },
  { stageId: 'S2', name: 'Molar mass', what: 'Turn a formula into grams per mole.', tier: 1 },
  { stageId: 'S3', name: 'Grams to moles', what: 'Divide a mass by the molar mass.', tier: 1 },
  { stageId: 'S4', name: 'The mole ratio', what: 'Read the ratio off the balanced equation, the right way up.', tier: 1 },
  { stageId: 'S5', name: 'How much is made', what: 'Apply the ratio to the moles you have.', tier: 1 },
  { stageId: 'S6', name: 'The last conversion', what: 'Turn moles of the answer into what the question asked for.', tier: 1 },
  { stageId: 'S4c', name: 'Which one runs out', what: 'Decide which reactant limits the reaction, in moles rather than grams.', tier: 3 },
  { stageId: 'S7', name: 'Percent yield', what: 'Compare what came out with what the equation promised.', tier: 4 },
];

/** One thing to answer: a whole problem, but only one step of it is asked. */
export interface DrillItem {
  readonly problem: Problem;
  readonly solution: Solution;
  readonly stage: Stage;
}

/**
 * The next thing to answer.
 *
 * `index` is the counter, so a drill is reproducible from its seed the same way
 * a practice set is — a student can come back to the same run, and a teacher can
 * see what they saw.
 *
 * Returns null where the stage does not appear even in its own tier, which
 * would be a generator change rather than a student's problem; the UI says so
 * rather than showing an empty screen.
 */
export function drillItem(drillable: Drillable, seed: string, index: number): DrillItem | null {
  // A HARD BOUND, not a `while (true)`. If a stage stops being generated, this
  // returns null and something visible happens — a loop would hang the tab, and
  // a hung tab is the one failure a student cannot report.
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const problem = generateProblem(seed, drillable.tier, index * 24 + attempt);
    const stage = stagesFor(problem).find((candidate) => candidate.id === drillable.stageId);
    if (stage !== undefined) return { problem, solution: solve(problem), stage };
  }
  return null;
}

/** What one answer turned out to be. Kept only for the run in front of you. */
export interface DrillAnswer {
  readonly right: boolean;
  readonly errorClass: string | null;
}

export interface DrillSummary {
  readonly answered: number;
  readonly right: number;
  /**
   * The mistake made most, where one was made more than once. A single slip is
   * a slip; twice is a pattern, and only a pattern is worth naming.
   */
  readonly repeated: string | null;
  readonly repeatedTimes: number;
  /**
   * True where the run got better: the repeated mistake happened in the first
   * half and not in the last third.
   *
   * THE ONLY THING RESEMBLING PRAISE IN THIS FILE, and it is a fact rather than
   * an opinion — it is either true of what happened or it is not said.
   */
  readonly stoppedHappening: boolean;
}

/** What the run amounted to. No score, and nothing kept after it is read. */
export function summarise(answers: readonly DrillAnswer[]): DrillSummary {
  const answered = answers.length;
  const right = answers.filter((answer) => answer.right).length;

  const counts = new Map<string, number>();
  for (const answer of answers) {
    if (answer.errorClass === null) continue;
    counts.set(answer.errorClass, (counts.get(answer.errorClass) ?? 0) + 1);
  }
  let repeated: string | null = null;
  let repeatedTimes = 0;
  for (const [name, times] of counts) {
    if (times > repeatedTimes) {
      repeated = name;
      repeatedTimes = times;
    }
  }
  // Once is a slip and everybody makes them. Naming it would be the app
  // inventing a problem to have an opinion about.
  if (repeatedTimes < 2) return { answered, right, repeated: null, repeatedTimes: 0, stoppedHappening: false };

  // Did it stop? Only claimed on a run long enough for the question to mean
  // something, and only when the last third is genuinely clear of it.
  const lastThird = answers.slice(Math.floor((answers.length * 2) / 3));
  const stoppedHappening =
    answers.length >= 6 &&
    lastThird.length > 0 &&
    !lastThird.some((answer) => answer.errorClass === repeated) &&
    answers.slice(0, Math.ceil(answers.length / 2)).some((answer) => answer.errorClass === repeated);

  return { answered, right, repeated, repeatedTimes, stoppedHappening };
}

/**
 * Whether to say something about a repeated mistake DURING the run, and once.
 *
 * Said on the third occurrence, not the second: twice can be the same slip made
 * twice, and interrupting somebody who is working is a cost. Never said twice
 * for the same class in a run — the UI holds that, because a thing repeated is
 * nagging rather than coaching.
 */
export const SAY_SOMETHING_AFTER = 3;

export function shouldSaySomething(answers: readonly DrillAnswer[], errorClass: string): boolean {
  return answers.filter((answer) => answer.errorClass === errorClass).length === SAY_SOMETHING_AFTER;
}

/** Grade one answer, using the grader's own classifier and nothing else. */
export function judge(item: DrillItem, entry: StudentEntry): Classification {
  return classify(item.problem, item.solution, item.stage, entry);
}
