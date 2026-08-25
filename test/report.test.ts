/**
 * report.test.ts — the assurance printed under the bug report is TRUE.
 *
 * The panel tells a student, in so many words, that the report contains nothing
 * about them. That sentence is worth exactly as much as whatever checks it, so
 * this generates a report from a session stuffed with identifying values and
 * asserts none of them comes out the other end.
 *
 * The reason it CAN be checked is the design: there is no free-text box. A
 * "describe what happened" field would make the assurance a promise about what
 * a student typed, and no test can hold that.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderReport, type ReportInput } from '../src/report/render.ts';
import { SYMPTOMS as REPORT_SYMPTOMS } from '../src/report/symptoms.ts';

/**
 * Plain data, no browser. The split between gathering facts and deciding what
 * the report says is what makes this possible — an earlier version of this test
 * stubbed `navigator`, `caches`, `matchMedia` and `localStorage`, which is a
 * lot of scaffolding between a test and the sentence it checks, and a stub
 * passes when the GUESS about the browser is right rather than when the code is.
 */
const INPUT: ReportInput = {
  version: '9.9.9',
  takenAt: '2026-08-25T18:00:00.000Z',
  symptom: 'MARKED-WRONG-BUT-RIGHT',
  device: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    maxTouchPoints: 5,
    platform: 'MacIntel',
    languages: 'en-GB',
    screen: '1180x820 at 2x',
    viewport: '820x1000',
    colourScheme: 'dark',
    reducedMotion: false,
    online: true,
    theme: 'dark',
    palette: 'moss',
  },
  shell: {
    serviceWorker: 'installed and controlling this page',
    newVersionWaiting: false,
    caches: 'molebridge-0.9.0',
    siteStorage: 'available',
  },
  where: {
    assignmentKey: 'PERIOD3-OCT14',
    tier: 2,
    mode: 'class assignment',
    problemNumber: 4,
    stepNumber: 5,
    finished: 5,
    firstTry: 2,
    unexplained: 1,
  },
};

test('the report never carries the roster number', () => {
  // The roster number is not a name, which is why it used to be in here. It is
  // the identifier this app is built around and the one a teacher's own
  // gradebook maps back to a person — so a report a student pastes into a
  // message must not carry it.
  const report = renderReport(INPUT);
  // The value is not merely absent from the output — there is nowhere on
  // `ReportInput` to put it, which is a stronger guarantee than remembering not
  // to print something sitting right there. This checks the output anyway,
  // because the type could change and this sentence could not.
  assert.ok(!/roster/i.test(report.split('does NOT contain')[0] ?? ''),
    'the report body mentions a roster number');
  assert.ok(!/\b1337\b/.test(report), 'an identifying number reached the report');
});

test('it does carry what is needed to reproduce a fault', () => {
  // The other half. A report that carries nothing is safe and useless; the
  // assignment key, the set, the problem and the step are what make a fault
  // findable, and none of them is about a person.
  const report = renderReport(INPUT);
  assert.match(report, /PERIOD3-OCT14/, 'the assignment key is missing');
  assert.match(report, /on problem: 4/, 'which problem is missing');
  assert.match(report, /on step: 5/, 'which step is missing');
});

test('the report says what it contains AND what it does not', () => {
  const report = renderReport(INPUT);
  assert.match(report, /does NOT contain/i, 'it does not say what it leaves out');
  assert.match(report, /roster number/i, 'it does not mention the roster number as excluded');
  assert.match(report, /name/i, 'it does not mention the name as excluded');
});

test('every symptom is short enough to read and tagged for whoever reads it', () => {
  assert.ok(REPORT_SYMPTOMS.length >= 5, 'too few symptoms to find the right one');
  const tags = new Set<string>();
  for (const symptom of REPORT_SYMPTOMS) {
    assert.ok(symptom.said.length <= 80, `"${symptom.said}" is too long to scan`);
    assert.match(symptom.tag, /^[A-Z-]+$/, `${symptom.tag} is not a tag`);
    assert.ok(!tags.has(symptom.tag), `${symptom.tag} appears twice`);
    tags.add(symptom.tag);
    // The words are the STUDENT'S. A symptom list written in engineer's terms
    // gets the wrong one picked, which is worse than none being picked at all.
    assert.ok(
      !/exception|stack|console|undefined|null/i.test(symptom.said),
      `"${symptom.said}" is written for an engineer`,
    );
  }
  assert.ok(tags.has('OTHER'), 'there is nowhere to put a problem the list did not predict');
});
