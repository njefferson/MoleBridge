#!/usr/bin/env node
/**
 * cli.ts — a development harness for the engine.
 *
 * ================================================================
 *  NOT A STUDENT SURFACE. This prints answers, and it prints the
 *  balancer's output. Nothing here may be reachable from the app.
 * ================================================================
 *
 * Run it with the repo's own Node — no build step, no bundler:
 *
 *   node tools/cli.ts session --key CHEM-A --tier 3 --problems 4
 *   node tools/cli.ts session --key CHEM-A --tier 2 --errors
 *   node tools/cli.ts problem --key CHEM-A --tier 1 --index 0
 *   node tools/cli.ts decode 2K902-45180-00000-02G6M-ECW4
 *   node tools/cli.ts scan --tier 3 --count 500
 */

import { BUILD_SECRET } from '../src/code/secret.ts';
import {
  decodeCompletionCode,
  encodeCompletionCode,
  totalStageErrors,
  type CompletionPayload,
} from '../src/code/codec.ts';
import { generateProblem, solve, TIERS, type Problem, type Solution } from '../src/engine/problem.ts';
import {
  classify,
  collisionsFor,
  predictionsFor,
  stagesFor,
  type Prediction,
  type Stage,
  type StudentEntry,
} from '../src/engine/taxonomy.ts';
import {
  completionPayload,
  controllableClock,
  correctEntryFor,
  currentProblem,
  currentStage,
  startSession,
  submit,
  type Session,
} from '../src/engine/steps.ts';
import { makeRng, nextInt, type Rng } from '../src/engine/rng.ts';
import { formatUnambiguous } from '../src/chem/sigfig.ts';
import { checkGuarantees } from '../src/engine/problem.ts';

/** Milliseconds a simulated student spends on one entry. */
const SIMULATED_SECONDS_PER_ENTRY = 35;
/** Epoch the simulated session's day offset is measured from. */
const SIMULATED_EPOCH = Date.UTC(2026, 8, 1);
/** When the simulated session starts. Fixed, so a CLI run is reproducible. */
const SIMULATED_START = Date.UTC(2026, 8, 14, 9, 0, 0);
/** How often the erring simulated student gets a stage wrong first. */
const ERROR_RATE_PERCENT = 45;
/** A guard against a stage machine that never advances. */
const MAX_SUBMISSIONS = 5000;

interface Options {
  readonly key: string;
  readonly tier: number;
  readonly index: number;
  readonly roster: number;
  readonly assignmentKeyId: number;
  readonly problems: number;
  readonly count: number;
  readonly errors: boolean;
  readonly quiet: boolean;
}

function parseOptions(argv: readonly string[]): Options {
  const flag = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };
  const number = (name: string, fallback: number): number => {
    const raw = flag(name);
    return raw === undefined ? fallback : Number(raw);
  };
  return {
    key: flag('key') ?? 'CHEM-A',
    tier: number('tier', 1),
    index: number('index', 0),
    roster: number('roster', 17),
    assignmentKeyId: number('assignment', 1234),
    problems: number('problems', 3),
    count: number('count', 500),
    errors: argv.includes('--errors'),
    quiet: argv.includes('--quiet'),
  };
}

/** The output of one simulated session, for the tests to assert against. */
export interface SimulationResult {
  readonly session: Session;
  readonly payload: CompletionPayload;
  readonly code: string;
  readonly transcript: readonly string[];
}

/** Pick a wrong entry a real student might give at this stage, or null. */
function wrongEntryFor(
  problem: Problem,
  solution: Solution,
  stage: Stage,
  rng: Rng,
): { entry: StudentEntry; prediction: Prediction } | null {
  const { predictions } = predictionsFor(problem, solution, stage);
  if (predictions.length === 0) return null;
  const prediction = predictions[nextInt(rng, 0, predictions.length - 1)] as Prediction;
  if (prediction.coefficients !== undefined) {
    return { entry: { kind: 'coefficients', values: prediction.coefficients }, prediction };
  }
  if (prediction.choice !== undefined) {
    return { entry: { kind: 'choice', speciesIndex: prediction.choice }, prediction };
  }
  const text = formatUnambiguous(prediction.value as number, problem.answerSigFigs);
  return {
    entry: { kind: 'text', text: stage.unit === 'none' ? text : `${text} ${stage.unit}` },
    prediction,
  };
}

/**
 * Run a whole session end to end.
 *
 * PRECONDITION: `options.tier` is a tier the generator knows and
 * `options.problems` is positive. Deterministic: the same options produce the
 * same transcript and the same code, every run.
 */
export function runSession(options: Options): SimulationResult {
  const clock = controllableClock(SIMULATED_START);
  const rng = makeRng(`${options.key}|sim|${options.tier}|${options.problems}`);
  const transcript: string[] = [];

  let session = startSession(
    {
      mode: 'assignment',
      assignmentKey: options.key,
      assignmentKeyId: options.assignmentKeyId,
      rosterId: options.roster,
      tier: options.tier,
      problemCount: options.problems,
      assignmentEpochMs: SIMULATED_EPOCH,
    },
    clock,
  );

  let submissions = 0;
  let lastProblemIndex = -1;

  while (!session.finished) {
    submissions += 1;
    if (submissions > MAX_SUBMISSIONS) throw new Error('the stage machine is not advancing');

    const problem = currentProblem(session);
    const solution = solve(problem);
    const stage = currentStage(session);

    if (session.problemIndex !== lastProblemIndex) {
      lastProblemIndex = session.problemIndex;
      transcript.push('');
      transcript.push(`PROBLEM ${session.problemIndex + 1} · tier ${problem.tier} · ${problem.kind}`);
      transcript.push(`  ${problem.equation}`);
      transcript.push(`  ${problem.prompt}`);
      transcript.push(`  answer to ${problem.answerSigFigs} significant figures`);
    }

    const shouldErr = options.errors && session.attemptsAtStage === 0 && nextInt(rng, 1, 100) <= ERROR_RATE_PERCENT;
    const wrong = shouldErr ? wrongEntryFor(problem, solution, stage, rng) : null;
    const entry = wrong?.entry ?? correctEntryFor(problem, solution, stage);

    clock.advance(SIMULATED_SECONDS_PER_ENTRY * 1000);
    const result = submit(session, entry, clock);
    session = result.session;

    const shown =
      entry.kind === 'text' ? entry.text : entry.kind === 'coefficients' ? entry.values.join(' ') : `#${entry.speciesIndex}`;
    if (result.advanced) {
      transcript.push(`  ${stage.id.padEnd(4)} ${shown.padEnd(24)} correct`);
    } else {
      transcript.push(
        `  ${stage.id.padEnd(4)} ${shown.padEnd(24)} ${result.classification.errorClass ?? 'COLLISION'}`,
      );
      transcript.push(`         ${result.classification.why}`);
      for (const remediation of result.remediation) {
        transcript.push(`         ${remediation.skill}: ${remediation.title}`);
        for (const line of remediation.lines) transcript.push(`           ${line}`);
        transcript.push(`           CHECK: ${remediation.question}`);
      }
    }
  }

  // The payload is read from the SAME clock the code was minted with. Building
  // a second clock here to re-derive it reported a false mismatch on every run,
  // because the session's duration had advanced and the fresh clock's had not.
  const payload = completionPayload(session, clock);
  return { session, payload, code: encodeCompletionCode(payload, BUILD_SECRET), transcript };
}

function commandSession(options: Options): void {
  const { session, payload, code, transcript } = runSession(options);
  if (!options.quiet) for (const line of transcript) console.log(line);
  console.log('');
  console.log('COMPLETION CODE');
  console.log(`  ${code}`);
  console.log('');
  console.log('DECODED BACK');
  const decoded = decodeCompletionCode(code, BUILD_SECRET);
  console.log(`  verdict           ${decoded.verdict}`);
  if (decoded.fields === null) {
    console.log(`  ${decoded.detail}`);
    process.exitCode = 1;
    return;
  }
  for (const [name, value] of Object.entries(decoded.fields)) {
    console.log(`  ${name.padEnd(17)} ${value}`);
  }
  console.log(`  stage errors      ${totalStageErrors(decoded.fields)} in total`);
  console.log(`  collisions seen   ${session.collisions}`);

  const same = JSON.stringify(decoded.fields) === JSON.stringify(payload);
  console.log('');
  console.log(same ? 'The decoded counts are the session counts.' : 'MISMATCH: the code did not survive the round trip.');
  if (!same) process.exitCode = 1;
}

function commandProblem(options: Options): void {
  const problem = generateProblem(options.key, options.tier, options.index);
  console.log(`${options.key} · tier ${options.tier} · problem ${options.index + 1}`);
  console.log(`  kind      ${problem.kind}`);
  console.log(`  equation  ${problem.equation}`);
  console.log(`  asks      ${problem.prompt}`);
  console.log(`  figures   ${problem.answerSigFigs}`);
  console.log('  stages');
  for (const stage of stagesFor(problem)) {
    console.log(`    ${stage.id.padEnd(4)} ${stage.kind.padEnd(13)} ${stage.unit.padEnd(10)} ${stage.prompt}`);
  }
}

function commandDecode(code: string): void {
  const decoded = decodeCompletionCode(code, BUILD_SECRET);
  console.log(`verdict   ${decoded.verdict}`);
  console.log(`detail    ${decoded.detail}`);
  if (decoded.normalized !== null) console.log(`read as   ${decoded.normalized}`);
  if (decoded.fields !== null) {
    for (const [name, value] of Object.entries(decoded.fields)) {
      console.log(`  ${name.padEnd(17)} ${value}`);
    }
  }
  for (const failure of decoded.failures) console.log(`  FAILED    ${failure.check}: ${failure.detail}`);
  if (decoded.verdict !== 'VALID') process.exitCode = 1;
}

function commandScan(options: Options): void {
  const tiers = options.tier === 0 ? TIERS : [options.tier];
  let problems = 0;
  let collisions = 0;
  let brokenGuarantees = 0;
  let unclassified = 0;
  let entries = 0;

  for (const tier of tiers) {
    for (let index = 0; index < options.count; index += 1) {
      const problem = generateProblem(options.key, tier, index);
      const solution = solve(problem);
      problems += 1;
      brokenGuarantees += checkGuarantees(problem).length;
      collisions += collisionsFor(problem, solution).length;

      for (const stage of stagesFor(problem)) {
        if (stage.kind !== 'NUMERIC') continue;
        const predicted = predictionsFor(problem, solution, stage);
        const correct = predicted.correctValue as number;
        for (const value of [...predicted.predictions.map((p) => p.value as number), correct * 1.03, correct * 12]) {
          if (!Number.isFinite(value)) continue;
          const text = formatUnambiguous(value, 6);
          const result = classify(problem, solution, stage, {
            kind: 'text',
            text: stage.unit === 'none' ? text : `${text} ${stage.unit}`,
          });
          if (result.correct) continue;
          entries += 1;
          if (result.errorClass === 'E-UNCLASSIFIED') unclassified += 1;
        }
      }
    }
  }

  console.log(`problems scanned      ${problems}`);
  console.log(`guarantees broken     ${brokenGuarantees}`);
  console.log(`collisions            ${collisions}`);
  console.log(`wrong entries fed in  ${entries}`);
  console.log(`E-UNCLASSIFIED        ${unclassified} (${((unclassified / entries) * 100).toFixed(2)}%)`);
  if (collisions > 0 || brokenGuarantees > 0) process.exitCode = 1;
}

function main(argv: readonly string[]): void {
  const command = argv[0] ?? 'session';
  const options = parseOptions(argv.slice(1));
  switch (command) {
    case 'session':
      commandSession(options);
      return;
    case 'problem':
      commandProblem(options);
      return;
    case 'decode': {
      const code = argv[1];
      if (code === undefined) {
        console.error('decode needs a code');
        process.exitCode = 2;
        return;
      }
      commandDecode(code);
      return;
    }
    case 'scan':
      commandScan(options);
      return;
    default:
      console.error(`unknown command "${command}" — try session, problem, decode or scan`);
      process.exitCode = 2;
  }
}

// `import.meta.main` is not available on every Node this must run on, so the
// entry check compares argv to this file's own URL.
if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/^.*?(?=tools\/cli\.ts$)/, ''))) {
  main(process.argv.slice(2));
}
