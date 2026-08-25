/**
 * cli.test.ts — the harness, run end to end.
 *
 * §10's last requirement: a full simulated session that prints a code, and the
 * code decoding back to the same counts. Run twice as a subprocess, because the
 * CLI is the thing a person actually types and "it works when imported" has
 * been true of plenty of broken entry points.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runSession } from '../tools/cli.ts';
import { decodeCompletionCode, totalStageErrors } from '../src/code/codec.ts';
import { BUILD_SECRET } from '../src/code/secret.ts';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(REPO, 'tools', 'cli.ts');

const run = (...args: string[]): string =>
  execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: REPO });

test('a simulated session on every tier decodes back to its own counts', () => {
  for (const tier of [1, 2, 3, 4]) {
    for (const errors of [false, true]) {
      const options = {
        key: 'CLI-TEST',
        tier,
        index: 0,
        roster: 17,
        assignmentKeyId: 1234,
        problems: 3,
        count: 0,
        errors,
        quiet: true,
      };
      const { session, payload, code } = runSession(options);
      assert.equal(session.finished, true, `tier ${tier} did not finish`);
      assert.equal(session.attempted, 3);
      assert.equal(session.collisions, 0, `tier ${tier} produced a taxonomy collision`);

      const decoded = decodeCompletionCode(code, BUILD_SECRET);
      assert.equal(decoded.verdict, 'VALID', `tier ${tier}: ${decoded.detail}`);
      assert.deepEqual(decoded.fields, payload, `tier ${tier} lost a field`);
      assert.equal(decoded.fields?.attempted, session.attempted);
      assert.equal(decoded.fields?.firstTryCorrect, session.firstTryCorrect);
      assert.equal(decoded.fields?.rosterId, 17);

      if (errors) {
        assert.ok(totalStageErrors(payload) > 0, `tier ${tier} recorded no errors with --errors`);
        assert.ok(session.firstTryCorrect < session.attempted);
      } else {
        assert.equal(totalStageErrors(payload), 0);
        assert.equal(session.firstTryCorrect, 3);
      }
    }
  }
});

test('the same options give the same transcript and the same code', () => {
  const options = {
    key: 'REPEAT',
    tier: 3,
    index: 0,
    roster: 5,
    assignmentKeyId: 77,
    problems: 2,
    count: 0,
    errors: true,
    quiet: true,
  };
  const first = runSession(options);
  const second = runSession(options);
  assert.equal(first.code, second.code);
  assert.deepEqual(first.transcript, second.transcript);
  assert.deepEqual(first.payload, second.payload);
});

test('the CLI prints a code and decodes it back, as a real command', () => {
  const output = run('session', '--key', 'CLI-SUB', '--tier', '3', '--problems', '2', '--errors');
  assert.match(output, /COMPLETION CODE/);
  assert.match(output, /verdict\s+VALID/);
  assert.match(output, /The decoded counts are the session counts\./);

  const code = /COMPLETION CODE\n\s+(\S+)/.exec(output)?.[1];
  assert.notEqual(code, undefined);
  const again = run('decode', code as string);
  assert.match(again, /verdict\s+VALID/);
  assert.match(again, /rosterId\s+17/);
});

test('the CLI refuses a code it cannot verify, and says so in its exit status', () => {
  const output = run('session', '--key', 'CLI-SUB2', '--tier', '1', '--problems', '1', '--quiet');
  const code = /COMPLETION CODE\n\s+(\S+)/.exec(output)?.[1] as string;
  const raw = code.replace(/-/g, '');
  const broken = `${raw.slice(0, 3)}${raw[3] === 'Z' ? 'Y' : 'Z'}${raw.slice(4)}`;

  assert.throws(() => run('decode', broken), (error: unknown) => {
    const message = String((error as { stdout?: string }).stdout ?? '');
    assert.match(message, /MAC_FAIL/);
    return true;
  });
});

test('the CLI shows a problem without showing its answer', () => {
  const output = run('problem', '--key', 'CLI-SHOW', '--tier', '1', '--index', '0');
  assert.match(output, /equation/);
  assert.match(output, /stages/);
  assert.match(output, /S1\s+COEFFICIENTS/);
  // The student view carries no coefficients and no molar masses.
  assert.doesNotMatch(output, /coefficients\s+\d/);
});

test('the CLI scan reports zero collisions and zero broken guarantees', () => {
  const output = run('scan', '--key', 'CLI-SCAN', '--tier', '3', '--count', '120');
  assert.match(output, /collisions\s+0/);
  assert.match(output, /guarantees broken\s+0/);
  assert.match(output, /E-UNCLASSIFIED\s+\d+/);
});

test('an unknown command exits non-zero rather than doing something', () => {
  assert.throws(() => run('frobnicate'));
});
