/**
 * drill.test.ts — every drillable step really is drillable, and the app never
 * rewards anybody.
 *
 * The second half is the unusual one. "No shame, no false rewarding" is a design
 * instruction that a later session could undo in a single well-meaning commit —
 * a streak counter, a "Great job!", a target to hit — so it is held by a test
 * rather than by a paragraph somebody has to read first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DRILLABLE,
  drillItem,
  judge,
  summarise,
  shouldSaySomething,
  SAY_SOMETHING_AFTER,
  type DrillAnswer,
} from '../src/learn/drill.ts';
import { correctEntryFor } from '../src/engine/steps.ts';
import { ERROR_CLASSES } from '../src/engine/taxonomy.ts';
import { drillForClass } from '../src/learn/reference.ts';

test('every drillable step can actually be generated, repeatedly', () => {
  // A step whose tier does not produce it would hand a student an empty screen.
  for (const drillable of DRILLABLE) {
    for (let index = 0; index < 8; index += 1) {
      const item = drillItem(drillable, 'DRILL-A', index);
      assert.ok(item !== null, `${drillable.stageId} could not be generated at index ${index}`);
      assert.equal(item.stage.id, drillable.stageId);
    }
  }
});

test('a drill gives DIFFERENT problems, or it is not practice', () => {
  for (const drillable of DRILLABLE) {
    const seen = new Set<string>();
    for (let index = 0; index < 10; index += 1) {
      const item = drillItem(drillable, 'DRILL-B', index);
      assert.ok(item !== null);
      seen.add(item.problem.equation + '|' + item.problem.given.value);
    }
    // Not all ten need differ — the generator draws from a finite pool — but a
    // drill that showed one problem ten times would be a page, not practice.
    assert.ok(seen.size >= 4, `${drillable.stageId} only produced ${seen.size} distinct problems in ten`);
  }
});

test('the grader accepts its own answer at every drillable step', () => {
  for (const drillable of DRILLABLE) {
    const item = drillItem(drillable, 'DRILL-C', 0);
    assert.ok(item !== null);
    const verdict = judge(item, correctEntryFor(item.problem, item.solution, item.stage));
    assert.equal(verdict.correct, true, `${drillable.stageId} rejected the grader's own answer`);
  }
});

test('a wrong answer is attributed, not just marked', () => {
  const item = drillItem(DRILLABLE[3] as typeof DRILLABLE[number], 'DRILL-D', 0);
  assert.ok(item !== null);
  const upsideDown = 1 / (item.solution.ratio || 1);
  const verdict = judge(item, { kind: 'text', text: String(upsideDown) });
  assert.equal(verdict.correct, false);
  // The whole thesis: which mistake, not merely that there was one.
  assert.ok(verdict.errorClass !== null || verdict.why !== '', 'a wrong answer came back with nothing said about it');
});

test('ONE SLIP IS NOT A PATTERN, and the app does not invent one', () => {
  const once: DrillAnswer[] = [
    { right: true, errorClass: null },
    { right: false, errorClass: 'E-RATIO-INVERTED' },
    { right: true, errorClass: null },
  ];
  const summary = summarise(once);
  assert.equal(summary.repeated, null, 'a single mistake was reported as a pattern');
  assert.equal(summary.answered, 3);
  assert.equal(summary.right, 2);
});

test('a repeated mistake is named, and only after the third time during a run', () => {
  const twice: DrillAnswer[] = [
    { right: false, errorClass: 'E-RATIO-INVERTED' },
    { right: false, errorClass: 'E-RATIO-INVERTED' },
  ];
  assert.equal(summarise(twice).repeated, 'E-RATIO-INVERTED');
  // During the run it waits for the third: twice can be one slip made twice,
  // and interrupting somebody who is working costs something.
  assert.equal(shouldSaySomething(twice, 'E-RATIO-INVERTED'), false);
  const thrice = [...twice, { right: false, errorClass: 'E-RATIO-INVERTED' }];
  assert.equal(thrice.length, SAY_SOMETHING_AFTER);
  assert.equal(shouldSaySomething(thrice, 'E-RATIO-INVERTED'), true);
  // ...and only once. A thing repeated is nagging.
  assert.equal(shouldSaySomething([...thrice, { right: false, errorClass: 'E-RATIO-INVERTED' }], 'E-RATIO-INVERTED'), false);
});

test('it says a mistake STOPPED only when it actually stopped', () => {
  const got = (classes: readonly (string | null)[]): DrillAnswer[] =>
    classes.map((errorClass) => ({ right: errorClass === null, errorClass }));

  const improved = summarise(got([
    'E-RATIO-INVERTED', 'E-RATIO-INVERTED', 'E-RATIO-INVERTED',
    null, null, null, null, null,
  ]));
  assert.equal(improved.stoppedHappening, true);

  // Still happening at the end: nothing encouraging is said, because it is not
  // true, and a false encouragement is the thing this file exists to prevent.
  const stillGoing = summarise(got([
    'E-RATIO-INVERTED', null, null, null, 'E-RATIO-INVERTED', 'E-RATIO-INVERTED',
  ]));
  assert.equal(stillGoing.stoppedHappening, false);

  // Too short to mean anything.
  const brief = summarise(got(['E-RATIO-INVERTED', 'E-RATIO-INVERTED', null]));
  assert.equal(brief.stoppedHappening, false);
});

test('NOTHING IN THE DRILL REWARDS ANYBODY', () => {
  /*
    A design instruction a later session could undo in one well-meaning commit.
    Streaks, points, badges and exclamation marks teach a student to chase the
    animation, and they make stopping feel like failing — which is exactly wrong
    for the person who most needs to do twenty of these.

    So it is checked, over the drill's own source and its screen, rather than
    left in a comment somebody has to read first.
  */
  const sources = ['src/learn/drill.ts', 'src/ui/drill.ts'].map((path) => readFileSync(path, 'utf8'));
  const forbidden: readonly [RegExp, string][] = [
    [/\bstreak\b/i, 'a streak is a slot machine'],
    [/\bbadge\b/i, 'badges reward the app rather than the work'],
    [/\bpoints?\b(?!\s+(?:at|to|out))/i, 'points are a score by another name'],
    [/\btroph|\bstar\b|⭐|🎉|🔥|💯/i, 'no'],
    [/Great job|Well done|Awesome|Amazing|Nice work|Keep it up/i, 'praise the app cannot mean'],
    [/\b\d+\s*\/\s*\d+\b/, 'a fraction is a grade'],
  ];
  for (const [at, source] of sources.entries()) {
    // Comments say what must NOT be built, so they are stripped before matching
    // — the same trap `permissions-check.mjs` fell into, and it fired on prose.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => (/^\s*\/\//.test(line) ? '' : line))
      .join('\n');
    for (const [pattern, why] of forbidden) {
      assert.ok(!pattern.test(code), `drill source ${at} contains ${pattern} — ${why}`);
    }
  }
});

test('every mistake that belongs to a step can be drilled from its page', () => {
  // The route only exists if the class maps to a step the drill can generate.
  // A class mapping to a stage that is not in DRILLABLE would put a dead button
  // on a reference page — offered, and then nothing.
  const drillable = new Set(DRILLABLE.map((step) => step.stageId));
  const unmapped: string[] = [];
  for (const id of ERROR_CLASSES) {
    const stageId = drillForClass(id);
    if (stageId === null) {
      unmapped.push(id);
      continue;
    }
    assert.ok(drillable.has(stageId), `${id} offers a drill on ${stageId}, which is not drillable`);
  }
  // Named, so a fifth appearing is a decision rather than a drift. These happen
  // ANYWHERE, so "practise the step you got that wrong at" would be the app
  // pretending to know something it does not.
  assert.deepEqual(
    [...unmapped].sort(),
    ['E-ARITH', 'E-ROUND-EARLY', 'E-SIG-FIGS', 'E-UNCLASSIFIED', 'E-UNIT-MISSING'],
    'a class stopped belonging to a step, or started',
  );
});
