/**
 * gradebook.test.ts — a pasted column, and the one thing that must not survive.
 *
 * The test that matters most here is the one asserting NAMES ARE DISCARDED. A
 * teacher pastes a gradebook column and it comes with people's names attached;
 * this application has no field for one and must never acquire one. Everything
 * else in this file is about a class picture being right, which is important.
 * That one is about the promise the product is built on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeGradebook,
  errorsOn,
  extractCodes,
  summarise,
  type DecodedLine,
} from '../src/code/gradebook.ts';
import { encodeCompletionCode, type CompletionPayload } from '../src/code/codec.ts';
import { assignmentKeyIdFor } from '../src/engine/assignment.ts';

const SECRET = 'gradebook-test-secret';
const KEY = 'CHEM-A';
const KEY_ID = assignmentKeyIdFor(KEY);

function code(overrides: Partial<CompletionPayload> = {}): string {
  const payload: CompletionPayload = {
    version: 1,
    assignmentKeyId: KEY_ID,
    rosterId: 7,
    attempted: 5,
    firstTryCorrect: 3,
    errS1: 1, errS2: 0, errS3: 2, errS4: 1, errS5: 0, errS6: 1,
    algebraTriggers: 2,
    unclassified: 1,
    durationMin: 22,
    dayOffset: 4,
    ...overrides,
  };
  return encodeCompletionCode(payload, SECRET);
}

test('a code is found wherever it sits on the line', () => {
  const one = code({ rosterId: 11 });
  for (const line of [
    one,
    `  ${one}  `,
    `11,${one}`,
    `11\t${one}`,
    `"${one}"`,
    `Period 3;11;${one};on time`,
    `${one},submitted`,
  ]) {
    const found = extractCodes(line);
    assert.equal(found.length, 1, JSON.stringify(line));
    assert.equal(found[0]?.code, one, JSON.stringify(line));
  }
});

test('NAMES DO NOT SURVIVE THE PARSE', () => {
  // The realistic paste: a Canvas export, names and all. This is the promise
  // the roster number exists to keep, so it is asserted rather than assumed.
  const first = code({ rosterId: 11 });
  const second = code({ rosterId: 12 });
  const pasted = [
    'Student,ID,Assignment',
    `Aguilar, Rosa,11,${first}`,
    `O'Donnell, Sean,12,${second}`,
  ].join('\n');

  const lines = extractCodes(pasted);
  const everythingKept = JSON.stringify(lines);
  for (const name of ['Aguilar', 'Rosa', "O'Donnell", 'Sean', 'Student']) {
    assert.ok(!everythingKept.includes(name), `"${name}" survived the parse: ${everythingKept}`);
  }
  // And the codes did survive, or the check above would pass trivially.
  assert.equal(lines.filter((line) => line.code !== null).length, 2);
});

test('a line with no code is counted, not silently dropped', () => {
  const lines = extractCodes(['Student,ID,Assignment', 'Aguilar, Rosa,11,', '', `x,${code()}`].join('\n'));
  // The blank line is skipped; the header and the empty submission are kept.
  assert.equal(lines.length, 3);
  assert.equal(lines.filter((line) => line.code === null).length, 2);
  assert.deepEqual(lines.map((line) => line.number), [1, 2, 4]);
});

test('something code-shaped but not a code decodes as MAC_FAIL, not silently', () => {
  const lines = decodeGradebook('ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZ', SECRET);
  assert.equal(lines[0]?.result?.verdict, 'MAC_FAIL');
  assert.equal(lines[0]?.result?.fields, null);
});

test('a class summary counts what it should and separates what it should not', () => {
  const pasted = [
    `Aguilar, Rosa,11,${code({ rosterId: 11, attempted: 5, firstTryCorrect: 4, errS2: 3 })}`,
    `Baptiste, Jean,12,${code({ rosterId: 12, attempted: 5, firstTryCorrect: 2, errS3: 4 })}`,
    // A code from a DIFFERENT assignment. It verifies — the MAC is keyed with
    // the id inside it — and must not be averaged into this class.
    `Chen, Wei,13,${code({ rosterId: 13, assignmentKeyId: (KEY_ID + 1) % 4096, attempted: 5, firstTryCorrect: 5 })}`,
    'Dubois, Marie,14,',
    'Evans, Tom,15,NOTACODE',
  ].join('\n');

  const summary = summarise(decodeGradebook(pasted, SECRET), KEY_ID);

  assert.equal(summary.counted, 2, 'only this assignment counts');
  assert.equal(summary.otherAssignment, 1);
  assert.equal(summary.linesWithoutCode, 2, 'the empty submission and the non-code');
  assert.equal(summary.problemsAttempted, 10);
  assert.equal(summary.firstTryCorrect, 6);
  assert.equal(summary.stageErrors.S2, 3, 'Aguilar had 3 there, Baptiste none');
  // 2 from the base payload that both students share, plus Baptiste's 4.
  assert.equal(summary.stageErrors.S3, 6);
  assert.equal(summary.byVerdict.VALID, 3, 'the other assignment is still a valid code');
  assert.deepEqual(summary.duplicates, []);
});

test('a roster number handed in twice is surfaced', () => {
  const pasted = [
    code({ rosterId: 11 }),
    code({ rosterId: 11, attempted: 3 }),
    code({ rosterId: 12 }),
  ].join('\n');
  const summary = summarise(decodeGradebook(pasted, SECRET), KEY_ID);
  assert.deepEqual(summary.duplicates, [{ rosterId: 11, times: 2 }]);
  assert.equal(summary.counted, 3, 'both are still counted; the teacher decides what to do');
});

test('the median duration is the middle, not the mean', () => {
  const pasted = [10, 12, 14, 16, 300].map((durationMin, i) => code({ rosterId: i + 1, durationMin })).join('\n');
  const summary = summarise(decodeGradebook(pasted, SECRET), KEY_ID);
  // The mean of these is 70. One student who left the tab open all afternoon
  // must not be able to say the class took an hour.
  assert.equal(summary.medianDurationMin, 14);
});

test('the unclassified count is carried through to the class picture', () => {
  const pasted = [
    code({ rosterId: 1, unclassified: 3 }),
    code({ rosterId: 2, unclassified: 2 }),
  ].join('\n');
  const summary = summarise(decodeGradebook(pasted, SECRET), KEY_ID);
  // §6.2: counted and reported, never suppressed. It is the number that says
  // whether the taxonomy needs work, and the teacher is who would notice.
  assert.equal(summary.unclassified, 5);
});

test('an empty paste summarises to nothing rather than throwing', () => {
  const summary = summarise(decodeGradebook('', SECRET), KEY_ID);
  assert.equal(summary.counted, 0);
  assert.equal(summary.linesWithCode, 0);
  assert.equal(summary.medianDurationMin, 0);
  assert.deepEqual(summary.duplicates, []);
});

test('errorsOn totals a line, and copes with a line that has none', () => {
  const lines = decodeGradebook(code({ errS1: 1, errS2: 2, errS3: 0, errS4: 0, errS5: 0, errS6: 3 }), SECRET);
  assert.equal(errorsOn(lines[0] as DecodedLine), 6);
  assert.equal(errorsOn({ number: 1, code: null, result: null }), 0);
});
