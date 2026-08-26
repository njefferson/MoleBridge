/**
 * warmup.test.ts — a link starts the right five minutes, and refuses the rest.
 *
 * The link is the only part of this app a teacher hands to a room, so it is the
 * only input that arrives from outside the app at all. It is parsed strictly for
 * that reason, not because a URL fragment is dangerous.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  warmupFrom,
  warmupLink,
  WARMUP_PROBLEMS,
  WARMUP_TIER,
  WARMUP_MAX_PROBLEMS,
} from '../src/ui/warmup.ts';

test('a plain code starts a short shared warm-up', () => {
  const config = warmupFrom('#w=MONDAY7');
  assert.ok(config !== null);
  assert.equal(config.assignmentKey, 'MONDAY7');
  assert.equal(config.problemCount, WARMUP_PROBLEMS);
  assert.equal(config.tier, WARMUP_TIER);
  // PRACTICE, ALWAYS. A warm-up hands nothing in, so it must be the mode that
  // refuses to produce a completion code rather than the mode that makes one.
  assert.equal(config.mode, 'practice');
});

test('EVERYONE GETS THE SAME PROBLEMS, which is the whole point', () => {
  // A warm-up you cannot discuss afterwards is homework done early. Two students
  // opening the same link must be looking at the same thing.
  const a = warmupFrom('#w=MONDAY7');
  const b = warmupFrom('#w=monday7');
  assert.deepEqual(a, b, 'the same code typed differently gives different problems');
  const other = warmupFrom('#w=TUESDAY7');
  assert.notEqual(a?.assignmentKey, other?.assignmentKey);
});

test('the set and the length can be asked for, within limits', () => {
  assert.equal(warmupFrom('#w=X&set=4')?.tier, 4);
  assert.equal(warmupFrom('#w=X&n=5')?.problemCount, 5);
  // A warm-up is five minutes. A link asking for more gets the default rather
  // than an error, because the failure mode of a mistyped link is a class
  // sitting in front of nothing.
  assert.equal(warmupFrom(`#w=X&n=${WARMUP_MAX_PROBLEMS + 40}`)?.problemCount, WARMUP_PROBLEMS);
  assert.equal(warmupFrom('#w=X&set=9')?.tier, WARMUP_TIER);
  assert.equal(warmupFrom('#w=X&set=0')?.tier, WARMUP_TIER);
  assert.equal(warmupFrom('#w=X&n=0')?.problemCount, WARMUP_PROBLEMS);
});

test('anything that is not a warm-up link starts nothing', () => {
  for (const hash of [
    '', '#', '#w=', '#w=%20', '#set=2', '#anchor', '#w=' + 'A'.repeat(30),
    '#w=has space', '#w=<script>', '#w=../../etc', '#w=a&w=b'.replace('a', ''),
  ]) {
    const config = warmupFrom(hash);
    if (config !== null) {
      // The one acceptable survivor: duplicate keys where the first is valid.
      assert.match(config.assignmentKey, /^[A-Z0-9][A-Z0-9-]*$/, `"${hash}" produced ${config.assignmentKey}`);
    }
  }
  assert.equal(warmupFrom(''), null);
  assert.equal(warmupFrom('#'), null);
  assert.equal(warmupFrom('#w='), null);
  assert.equal(warmupFrom('#w=has space'), null);
  assert.equal(warmupFrom('#w=<script>'), null);
  assert.equal(warmupFrom('#' + 'w=' + 'A'.repeat(40)), null);
});

test('the link a teacher builds is the link the app reads', () => {
  // The two halves of one fact, and they are in the same file so they cannot
  // drift — but a round trip is what proves it rather than the proximity.
  for (const [code, tier, problems] of [
    ['MONDAY7', 2, 2],
    ['UNIT-3-WARMUP', 4, 5],
    ['abc', 1, 1],
  ] as const) {
    const link = warmupLink('https://molebridge.pages.dev', code, tier, problems);
    const config = warmupFrom(link.slice(link.indexOf('#')));
    assert.ok(config !== null, `${link} did not read back`);
    assert.equal(config.assignmentKey, code.toUpperCase());
    assert.equal(config.tier, tier);
    assert.equal(config.problemCount, problems);
  }
});

test('a warm-up link is shorter than the defaults it does not change', () => {
  // She writes this on a whiteboard. Every character is one a class can mistype.
  const plain = warmupLink('https://molebridge.pages.dev', 'MONDAY7', WARMUP_TIER, WARMUP_PROBLEMS);
  assert.equal(plain, 'https://molebridge.pages.dev/#w=MONDAY7');
});
