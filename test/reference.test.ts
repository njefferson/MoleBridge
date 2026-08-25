/**
 * reference.test.ts — the reference covers the taxonomy exactly, and gives
 * nothing away.
 *
 * The engine can attribute twenty classes. A student who reads "the ratio is
 * upside down" and does not already know what the ratio is has been told the
 * name of their problem and nothing else — so every class needs somewhere to
 * go, and a class that quietly has no page is the failure this file exists to
 * catch.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ERROR_CLASSES } from '../src/engine/taxonomy.ts';
import { REFERENCE, entryFor, lessonsForClass } from '../src/learn/reference.ts';
import { LESSONS } from '../src/learn/lessons.ts';

test('every error class the engine can attribute has exactly one page', () => {
  const seen = new Set<string>();
  for (const entry of REFERENCE) {
    assert.ok(!seen.has(entry.id), `${entry.id} has two pages`);
    seen.add(entry.id);
  }
  // BOTH DIRECTIONS. A missing page is a dead end for a student; a page for a
  // class that no longer exists is one nobody can reach, and neither shows up
  // by reading either file on its own.
  for (const id of ERROR_CLASSES) {
    assert.ok(seen.has(id), `${id} can be attributed and has no page in the reference`);
  }
  for (const entry of REFERENCE) {
    assert.ok(
      (ERROR_CLASSES as readonly string[]).includes(entry.id),
      `${entry.id} has a page and is not a class the engine can attribute`,
    );
  }
  assert.equal(REFERENCE.length, ERROR_CLASSES.length);
});

test('the lesson link is derived from the lessons, in both directions', () => {
  for (const [at, lesson] of LESSONS.entries()) {
    for (const id of lesson.answers) {
      // The reverse edge is computed off `Lesson.answers`, so this checks the
      // computation rather than a second copy of the same fact. EVERY claiming
      // lesson has to be offered: two lessons can legitimately teach the same
      // mistake, and dropping one of them sends half the students who need it
      // to the wrong page.
      assert.ok(
        lessonsForClass(id).includes(at),
        `${id} is claimed by "${lesson.title}" and the reference does not offer it`,
      );
    }
  }
  // Three classes are claimed by nothing, on purpose: a slip in the arithmetic,
  // a missing unit and an unexplained answer are not a concept a lesson can
  // teach. Naming them here means a fourth one appearing is a decision rather
  // than a drift.
  const unclaimed = ERROR_CLASSES.filter((id) => lessonsForClass(id).length === 0);
  assert.deepEqual(
    [...unclaimed].sort(),
    ['E-ARITH', 'E-UNCLASSIFIED', 'E-UNIT-MISSING'],
    'a class stopped being taught by any lesson, or started being taught by one',
  );
});

test('no page gives away a value', () => {
  // The reference is reachable at any time, INCLUDING mid-step. The rule that
  // the correct answer is never shown before the attempt has no exception for
  // the help screen, so these pages are about procedure and never about a
  // number from a problem.
  //
  // The allowance is a constant of nature or a definition — 22.4 L/mol, 100 for
  // a percentage, Avogadro's number, the mass of water — which is a fact a
  // student may look up in any book on the shelf.
  const ALLOWED = /22\.4|6\.022|10²³|18\.02|\b100\b|\b1\b|\b2\b|\b3\b|\b4\b|\b5\b|\b6\b|\b10\b|\b47\b|2\.31/;
  for (const entry of REFERENCE) {
    const prose = `${entry.what} ${entry.tell} ${entry.fix}`;
    for (const number of prose.match(/\d+\.?\d*/g) ?? []) {
      assert.match(
        number,
        ALLOWED,
        `"${number}" in ${entry.id} is a value, and this page is read mid-problem`,
      );
    }
  }
});

test('every page is written for a student and says what to do', () => {
  for (const entry of REFERENCE) {
    assert.ok(entry.called.length <= 60, `${entry.id}'s name is too long to scan`);
    for (const [field, text] of [['what', entry.what], ['tell', entry.tell], ['fix', entry.fix]] as const) {
      assert.ok(text.length > 0, `${entry.id} has no ${field}`);
      assert.ok(text.length <= 320, `${entry.id}'s ${field} is too long to read on a phone`);
      assert.match(text, /[.!?]$/, `${entry.id}'s ${field} does not end in a sentence`);
      // The words are the STUDENT'S. A reference written in the engine's terms
      // sends somebody to a page that names their mistake in vocabulary they do
      // not have, which is the exact failure it was built to fix.
      assert.ok(
        !/\bE-[A-Z]|errorClass|taxonomy|coefficient set|stage S\d/i.test(text),
        `${entry.id}'s ${field} is written for whoever built this`,
      );
    }
    assert.ok(entryFor(entry.id) === entry, `${entry.id} is not findable by its own id`);
  }
});
