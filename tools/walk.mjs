#!/usr/bin/env node
/**
 * walk.mjs — the primary journey, driven in a real browser.
 *
 * Doctrine §6: walk the primary user journey from the start screen before any
 * handoff. Type checks and unit tests say the engine is right; they say nothing
 * about whether a student can get from the welcome screen to a completion code,
 * which is the only thing the app is for.
 *
 * It deliberately gets one stage WRONG, because the diagnosis and the algebra
 * help are the product, and a walk that only ever answers correctly never draws
 * them.
 *
 *   npm run build && node tools/walk.mjs
 *   node tools/walk.mjs --keep   leave the browser open on failure
 */

import { chromium } from 'playwright-core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, chromiumPath } from './serve.mjs';
import { generateProblem, solve } from '../src/engine/problem.ts';
import { stagesFor, predictionsFor } from '../src/engine/taxonomy.ts';
import { decodeCompletionCode, encodeCompletionCode } from '../src/code/codec.ts';
import { assignmentKeyIdFor } from '../src/engine/assignment.ts';
import { BUILD_SECRET } from '../src/code/secret.ts';
import { formatUnambiguous } from '../src/chem/sigfig.ts';
import { LESSONS } from '../src/learn/lessons.ts';
import { REFERENCE } from '../src/learn/reference.ts';
import { ERROR_CLASSES } from '../src/engine/taxonomy.ts';
import { ELEMENTS } from '../src/chem/elements.ts';
import { warmupLink, WARMUP_PROBLEMS } from '../src/ui/warmup.ts';
import { RELEASES } from '../src/ui/releases.ts';
import { SEEN_VERSION_KEY } from '../src/ui/whatsnew.ts';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const KEY = 'WALK-A';
const TIER = 3;
const COUNT = 3;
const ROSTER = 42;
/** How long to wait for anything the page has to do. */
const TIMEOUT_MS = 8000;

const failures = [];
const check = (condition, what) => {
  if (condition) console.log(`  ok    ${what}`);
  else {
    console.error(`  FAIL  ${what}`);
    failures.push(what);
  }
};

/** What a student would type for a stage, correct. */
function correctText(problem, solution, stage) {
  const value = {
    S2: solution.mmGiven,
    S3: solution.molGiven,
    S3b: solution.molSecond,
    S4: solution.ratio,
    S4b: solution.molWantedFromSecond,
    S5: solution.molWanted,
    S6: solution.converted,
    S7: solution.percentYield,
  }[stage.id];
  const digits = stage.gradesSigFigs ? problem.answerSigFigs : 12;
  const text = formatUnambiguous(value, digits);
  return stage.unit === 'none' ? text : `${text} ${stage.unit}`;
}

const server = await serve(join(REPO, 'public'));
const executablePath = chromiumPath();
const browser = await chromium.launch(executablePath === null ? {} : { executablePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleErrors = [];

/**
 * EVERY CONTENT-SECURITY-POLICY VIOLATION, from the browser's own event rather
 * than by reading the console. A CSP breaks a page silently and completely —
 * the blocked thing simply does not happen — so a walk that only checked
 * whether screens appear could pass while the policy quietly removed something.
 *
 * `addInitScript` runs before any page script, so this is listening from before
 * the first byte the policy could refuse.
 */
const cspViolations = [];
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (event) => {
    const seen = (window.__csp ??= []);
    seen.push(`${event.violatedDirective} blocked ${event.blockedURI || '(inline)'}`);
  });
});
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

try {
  console.log('=== the primary journey ===\n');
  await page.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded' });

  /* ---- the first-run orientation, and the build stamp ---- */
  check(await page.locator('#welcome-panel[open]').isVisible(), 'the orientation opens over the app on a first run');
  check(await page.locator('#orientation').isVisible(), 'the orientation is in it');
  check(await page.locator('#screen-home').isVisible(), 'and the app is behind it, not replaced by it');
  // AND NOT ALSO THE RELEASE NOTES. There is no news for somebody with no
  // before, and two modals stacked on a first run would be the app talking
  // over itself at the one moment a reader is deciding what it is.
  check(
    !(await page.locator('#whatsnew-panel[open]').isVisible()),
    'and a newcomer is NOT also shown what changed',
  );

  // THE BUTTON IS ON SCREEN. This is the defect that made it a dialog: as a
  // full-height screen the content pushed "Get started" below the fold, so the
  // one control that mattered was the one nobody could see. Asserting it exists
  // would have passed then too — what has to be asserted is that it is inside
  // the viewport.
  //
  // AT THE SIZES WHERE IT ACTUALLY BROKE. This walk runs at 1280x900, which is
  // roomy enough that the old full-height screen fitted — so a check here alone
  // would have passed throughout the defect's life. The sizes below are a phone
  // held upright, a phone on its side, and a small Chromebook window.
  const SIZES = [
    { width: 390, height: 664, what: 'a phone upright' },
    { width: 740, height: 380, what: 'a phone on its side' },
    { width: 1024, height: 500, what: 'a short Chromebook window' },
    { width: 1280, height: 900, what: 'a full window' },
  ];
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    const box = await page.locator('#welcome-begin').boundingBox();
    check(
      box !== null && box.y >= 0 && box.y + box.height <= size.height + 1,
      `Get started is on screen on ${size.what} — ${
        box === null ? 'not found' : `bottom at ${Math.round(box.y + box.height)} of ${size.height}`
      }`,
    );
  }
  const stamp = (await page.locator('#build-stamp').textContent())?.trim() ?? '';
  check(/^\d+\.\d+\.\d+$/.test(stamp), `the build stamp reads a version at boot (${stamp})`);

  /* ---- §7e: the orientation MOVES, it is not copied ---- */
  await page.locator('#welcome-begin').click();
  check(!(await page.locator('#welcome-panel[open]').isVisible()), 'pressing Get started closes it');
  check(await page.locator('#screen-home').isVisible(), 'and the three-door menu is underneath');
  check(
    (await page.locator('#orientation').count()) === 1,
    'there is exactly ONE orientation block after the move, never a copy',
  );
  // WAITED FOR, NOT READ IMMEDIATELY. `dialog.close()` fires its `close` event
  // as a queued task rather than synchronously, so the move into the ⓘ panel
  // happens a tick after the click returns — and asserting straight afterwards
  // was a race that lost about one run in three.
  //
  // It was found by running this walk six times in a row rather than once,
  // which is the only reason it was found at all: a flaky gate passing on the
  // first attempt is indistinguishable from a working one, and this had already
  // passed twice before it failed.
  const moved = await page
    .locator('#info-orientation-slot #orientation')
    .waitFor({ state: 'attached', timeout: TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  check(moved, 'and it now lives behind the information control');

  /* ---- the doors ---- */
  //
  // THE ASSIGNMENT DOOR IS THE ONLY ONE THAT LEADS TO A CODE, and that is the
  // code wall expressed where a student can see it. Both halves are checked:
  // this journey takes the assignment door and ends holding a code, and the
  // practice pass further down takes the other one and ends without.
  await page.locator('#door-assignment').click();
  check(await page.locator('#screen-setup').isVisible(), 'the assignment door reaches setup');

  /* ---- setup refuses what it should ---- */
  await page.locator('#setup-roster').fill('0');
  await page.locator('#setup-key').fill(KEY);
  await page.locator('#setup-start').click();
  check(await page.locator('#setup-error').isVisible(), 'a roster number of 0 is refused, with a reason');

  await page.locator('#setup-roster').fill(String(ROSTER));
  await page.locator(`#setup-tier button[data-tier="${TIER}"]`).click();
  await page.locator(`#setup-count button[data-count="${COUNT}"]`).click();
  await page.locator('#setup-start').click();
  check(await page.locator('#screen-work').isVisible(), 'a valid setup starts the session');

  /* ---- work every stage of every problem ---- */
  let deliberateMistakes = 0;
  let sawRemediation = false;
  let deliberateAnswer = '';

  for (let index = 0; index < COUNT; index += 1) {
    const problem = generateProblem(KEY, TIER, index);
    const solution = solve(problem);
    const stages = stagesFor(problem);

    // Compared against the DISPLAYED form: the equation is stored with an ASCII
    // arrow for the parser and shown with a real one for the reader, and this
    // checks both that it is the right equation and that the swap happened.
    const onScreen = (await page.locator('#work-equation').textContent())?.trim();
    const expected = problem.equation.replace(/\s*->\s*/, ' → ');
    check(onScreen === expected, `problem ${index + 1} on screen is the one the key generates, with a real arrow`);

    for (const stage of stages) {
      // One deliberate wrong answer, at the first numeric stage of the first
      // problem, so the diagnosis and the algebra help actually get drawn.
      if (index === 0 && stage.id === 'S3' && deliberateMistakes === 0) {
        deliberateMistakes += 1;
        const inverted = problem.given.value * solution.mmGiven;
        deliberateAnswer = formatUnambiguous(inverted, 6);
        await page.locator('#stage-answer').fill(`${deliberateAnswer} mol`);
        await page.locator('#work-submit').click();
        const why = (await page.locator('#work-feedback .why').textContent()) ?? '';
        check(why.toLowerCase().includes('multiplied'), 'a wrong answer is diagnosed, not just marked wrong');
        const helpCount = await page.locator('#work-feedback .remediation').count();
        check(helpCount === 2, `the algebra help appears at the failing stage (${helpCount} branches)`);
        sawRemediation = helpCount > 0;

        const helpText = (await page.locator('#work-feedback').textContent()) ?? '';
        const answer = formatUnambiguous(solution.molGiven, problem.answerSigFigs);
        check(!helpText.includes(answer), 'and the help does not contain the answer to the stage');
      }

      if (stage.kind === 'COEFFICIENTS') {
        const boxes = page.locator('#work-inputs input');
        check((await boxes.count()) === problem.species.length, `${stage.id}: one box per substance`);
        for (let i = 0; i < solution.coefficients.length; i += 1) {
          await boxes.nth(i).fill(String(solution.coefficients[i]));
        }
      } else if (stage.kind === 'CHOICE') {
        await page.locator(`#work-inputs button[data-species="${solution.limitingIndex}"]`).click();
      } else {
        await page.locator('#stage-answer').fill(correctText(problem, solution, stage));
      }
      await page.locator('#work-submit').click();
    }
  }

  check(deliberateMistakes === 1, 'the walk got exactly one stage wrong on purpose');
  check(sawRemediation, 'and saw the algebra help for it');

  /* ---- the code ---- */
  await page.locator('#screen-done').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  const code = (await page.locator('#done-code').textContent())?.trim() ?? '';
  check(/^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{4}$/.test(code), `the code is shown, grouped (${code})`);

  const decoded = decodeCompletionCode(code, BUILD_SECRET);
  check(decoded.verdict === 'VALID', `the code the page printed decodes as VALID (${decoded.verdict})`);
  check(decoded.fields?.rosterId === ROSTER, 'it carries the roster number that was typed in');
  check(decoded.fields?.attempted === COUNT, `it carries ${COUNT} problems attempted`);
  check(decoded.fields?.firstTryCorrect === COUNT - 1, 'and one problem lost its first-try, from the deliberate mistake');
  check((decoded.fields?.errS3 ?? 0) === 1, 'the error is counted against the stage it happened at');

  /* ---- nothing invisible is handed in ---- */
  //
  // A student types a short string into Canvas. The screen used to carry a
  // SENTENCE about it — counts only, no answers, no name — which was true and
  // was written by whoever built the thing making the claim. What is checked
  // here is that the app shows the code DECODED, and that what it shows matches
  // what this file gets by decoding the same string independently.
  const saysVisible = await page.locator('#done-says').isVisible();
  check(saysVisible, 'the finished screen shows what the code says');

  const readoutText = (await page.locator('#done-readout').textContent()) ?? '';
  check(readoutText.includes(String(ROSTER)), `the readout names the roster number it carries (${ROSTER})`);
  check(readoutText.includes(String(COUNT)), `and how many problems were finished (${COUNT})`);

  // THE SAME NUMBERS THE TEACHER WILL SEE. `decoded` above came from decoding
  // the code this walk read off the screen, so this compares the app's own
  // reading against an independent one of the same string.
  for (const [what, value] of [
    ['problems finished', decoded.fields?.attempted],
    ['right first time', decoded.fields?.firstTryCorrect],
    ['roster number', decoded.fields?.rosterId],
  ]) {
    check(
      readoutText.includes(String(value)),
      `the readout agrees with the decoder on ${what} (${value})`,
    );
  }

  const notInText = (await page.locator('#done-not-in').textContent()) ?? '';
  for (const owed of ['name', 'answer', 'working']) {
    check(notInText.toLowerCase().includes(owed), `and says your ${owed} is not in it`);
  }

  /* ---- the information surface ---- */
  await page.locator('#info-open').click();
  check(await page.locator('#info-panel').isVisible(), 'the information control opens the panel');
  const info = (await page.locator('#info-panel').textContent()) ?? '';
  for (const owed of ['Installing', 'Chromebook', 'iPad', 'ViewBoard', 'IUPAC', 'Accessibility', 'What changed', 'Diagnostic']) {
    check(info.includes(owed), `the panel covers "${owed}"`);
  }
  // THIS SAID "the release that is running" AND ASSERTED `0.1.0`, which is the
  // OLDEST release in the file. It passed for thirty releases because the panel
  // rendered every one of them, so the literal was always present — and it went
  // red the moment the list was capped, which is the first time it was ever
  // asked the question its own sentence claims. A check's text and its
  // predicate are two different things and only one of them runs.
  check(
    info.includes(RELEASES[0].version),
    `the patch notes name the release that is running (${RELEASES[0].version})`,
  );
  // THE CONTROL, NOT THE PHRASE. Written first as a text match, it went green
  // against the 1.8.0 release note — which is prose IN the panel describing
  // this very link. The app's own copy is not evidence about the app; this
  // repository has been caught by that once before, on the word "molar mass".
  const historyLink = page.locator('#info-panel a[href="/changes/"]');
  check(await historyLink.count() > 0, 'and a control leads to the rest of them');
  const linkBox = await historyLink.first().boundingBox();
  check(
    linkBox !== null && linkBox.height >= 44,
    `which a finger can hit (${linkBox === null ? 'not found' : `${Math.round(linkBox.height)}px`})`,
  );
  check(info.includes('still missing'), 'and say what is still missing, not only what is new');

  /* ---- §7f: the diagnostic ---- */
  await page.getByRole('button', { name: 'Show the diagnostic' }).click();
  // The report is built on demand and half of it is awaited — which worker is
  // controlling the page, what is in the caches — so it arrives a tick after
  // the press rather than with it.
  await page.locator('.diagnostic').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  await page.waitForFunction(
    () => (document.querySelector('.diagnostic')?.textContent ?? '').includes('session'),
    undefined,
    { timeout: TIMEOUT_MS },
  );
  const report = (await page.locator('.diagnostic').textContent()) ?? '';
  check(report.includes('maxTouchPoints'), 'the diagnostic carries what the user agent hides');
  check(report.includes('a new version is waiting'), 'and whether a newer build is sitting there');
  check(report.includes('caches'), 'and which caches the device holds');
  check(report.includes('WALK-A'), 'and enough to reproduce the fault');
  check(!report.includes(String(ROSTER === 0 ? -1 : deliberateAnswer)), 'and NOT anything the student typed as an answer');
  // NOT THE ROSTER NUMBER EITHER. It is not a name, which is the reasoning it
  // was here on; it is also the identifier a teacher's gradebook maps back to a
  // person. The body is checked rather than the whole report, because the
  // paragraph underneath names it as one of the things left out.
  check(
    !/roster/i.test(report.split('does NOT contain')[0] ?? ''),
    'and NOT the roster number, which is the identifier this app is built around',
  );
  // The assurance is checked as the sentence it now IS. It said "no answers and
  // no name" for four releases while carrying the roster number: true, narrower
  // than a reader would take it, and this line passed the whole time.
  check(report.includes('What this report contains'), 'and it says what it carries');
  check(report.includes('does NOT contain'), 'and what it leaves out, by name');
  await page.locator('#info-close').click();
  check(!(await page.locator('#info-panel').isVisible()), 'and closes again');

  /* ---- §7h and offline: the shell survives losing the network ---- */
  const registered = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return r === undefined ? 'none' : r.active === null ? 'installing' : 'active';
  });
  check(registered !== 'none', `a service worker registers (${registered})`);
  check(
    await page.locator('#update-strip').isHidden(),
    'a first-time visitor is NOT told a new version is ready — there is nothing waiting for them',
  );

  await page.reload({ waitUntil: 'load' });
  const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null);
  check(controlled, 'the worker is controlling the page after a reload');

  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'load' });
  check(await page.locator('#build-stamp').isVisible(), 'and the app still opens with the network gone');
  const offlineStamp = (await page.locator('#build-stamp').textContent())?.trim();
  check(offlineStamp === stamp, `offline, it is still the same build (${offlineStamp})`);
  await page.context().setOffline(false);

  /* ---- the teacher's decoder ---- */
  const teacherKey = 'WALK-CLASS';
  const keyId = assignmentKeyIdFor(teacherKey);
  const mint = (over) =>
    encodeCompletionCode(
      {
        version: 1,
        assignmentKeyId: keyId,
        rosterId: 1,
        attempted: 5,
        firstTryCorrect: 3,
        errS1: 0, errS2: 2, errS3: 1, errS4: 0, errS5: 0, errS6: 0,
        algebraTriggers: 1,
        unclassified: 0,
        durationMin: 20,
        dayOffset: 2,
        ...over,
      },
      BUILD_SECRET,
    );

  // A realistic paste: names, a header, an empty submission, a code from last
  // week's assignment, and one that has been mistyped.
  const pastedNames = ['Aguilar', 'Rosa', "O'Donnell", 'Sean', 'Chen', 'Wei'];
  const pasted = [
    'Student,ID,Assignment',
    `Aguilar, Rosa,11,${mint({ rosterId: 11, errS2: 4 })}`,
    `O'Donnell, Sean,12,${mint({ rosterId: 12, errS3: 3, unclassified: 2 })}`,
    `Chen, Wei,13,${mint({ rosterId: 13, assignmentKeyId: (keyId + 1) % 4096 })}`,
    'Dubois, Marie,14,',
    `Evans, Tom,15,${'Z'.repeat(24)}`,
  ].join('\n');

  await page.goto(`${server.origin}/teacher/`, { waitUntil: 'load' });
  check(await page.locator('#decode-form').isVisible(), 'the decoder page loads');
  check(
    ((await page.locator('.why').textContent()) ?? '').includes('discarded'),
    'and says what it does with names BEFORE anything is pasted',
  );

  await page.locator('#teacher-key').fill(teacherKey);
  await page.locator('#teacher-paste').fill(pasted);
  await page.locator('#decode-run').click();
  await page.locator('#results').waitFor({ state: 'visible', timeout: TIMEOUT_MS });

  const rendered = (await page.locator('body').textContent()) ?? '';
  // THE ASSERTION THIS PAGE EXISTS TO KEEP.
  for (const name of pastedNames) {
    check(!rendered.includes(name), `"${name}" does not appear anywhere on the decoded page`);
  }

  check(rendered.includes('2 students handed in'), 'two codes counted for this assignment');
  check(/different assignment/i.test(rendered), 'the code from another assignment is called out, not counted');
  check(/no code on them/i.test(rendered), 'the empty submission is reported with its line number');
  check(/failed the check/i.test(rendered), 'the mistyped code is reported rather than dropped');
  check(rendered.includes('Roster 11') && rendered.includes('Roster 12'), 'each counted student gets a card');
  check(!rendered.includes('Roster 13'), 'and the other assignment does not get one');

  const bars = await page.locator('.histogram-row').count();
  check(bars === 6, `the histogram covers all six stages (${bars})`);

  /* ---- the learn door, and the progress code's round trip ---- */
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-learn').click();
  // COUNTED AGAINST THE SOURCE, not against a literal. This read `=== 7` and
  // went red the moment an eighth lesson was added — which is a check reporting
  // a deliberate change as a defect, and the kind of red that teaches people to
  // edit the number without reading why.
  // SCOPED TO THE LESSON LIST. `.lesson-row` is the shared row shape and the
  // drill's step list uses it too, so an unscoped count found sixteen the moment
  // that screen existed — a selector loose enough to catch a second list is a
  // check that reports someone else's feature as a defect.
  const lessonCount = await page.locator('#learn-list .lesson-row').count();
  check(lessonCount === LESSONS.length, `all ${LESSONS.length} lessons are listed (${lessonCount})`);

  // NOTHING IS LOCKED, and this is the assertion that says so. Every row must
  // be a live control on a first run — a disabled one would be a promise that
  // the lesson before it is required, which is not true here.
  const enabled = await page.locator('#learn-list .lesson-row:not([disabled])').count();
  check(enabled === lessonCount, `and every one of them opens (${enabled} of ${lessonCount})`);

  await page.locator('.lesson-row').first().click();
  check((await page.locator('.drill').count()) > 0, 'a lesson has something to try');

  // THE ANSWER ARRIVES ONLY AFTER AN ATTEMPT, in a lesson as much as in an
  // assignment. Asserted by looking before answering, not by reading the code.
  const beforeAnswering = await page.locator('.drill-verdict').first().isVisible();
  check(!beforeAnswering, 'and it does not show the answer before you have tried');

  await page.locator('.drill input').first().fill('13');
  await page.locator('.drill button').first().click();
  const wrong = (await page.locator('.drill-verdict').first().textContent()) ?? '';
  check(/not that one/i.test(wrong), 'a wrong answer is corrected, with the reason');

  await page.locator('.drill input').first().fill('12');
  await page.locator('.drill button').first().click();
  const right = (await page.locator('.drill-verdict').first().textContent()) ?? '';
  check(/^yes/i.test(right.trim()), 'and a right one is confirmed');

  await page.locator('#lesson-done').click();
  const state = (await page.locator('.lesson-row .lesson-state').first().textContent())?.trim() ?? '';
  check(state === 'Finished', `finishing a lesson is recorded in words (${state})`);

  // THE ROUND TRIP. Take the code, wipe the device, type the code back, and the
  // lesson must still be finished. Everything else here would pass on a
  // progress code that encoded nothing at all.
  await page.locator('#learn-progress').evaluate((node) => node.setAttribute('open', ''));
  const savedCode = (await page.locator('#learn-code').textContent())?.trim() ?? '';
  check(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(savedCode), `the progress code is four groups of four (${savedCode})`);

  await page.evaluate(() => {
    window.localStorage.removeItem('molebridge.progress');
    window.localStorage.removeItem('molebridge.progress.tally');
  });
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-learn').click();
  const wiped = (await page.locator('.lesson-row .lesson-state').first().textContent())?.trim() ?? '';
  check(wiped === 'Not finished yet', 'clearing the device really does clear it');

  await page.locator('#learn-progress').evaluate((node) => node.setAttribute('open', ''));
  await page.locator('#learn-restore').fill(savedCode);
  await page.locator('#learn-restore-go').click();
  const restored = (await page.locator('.lesson-row .lesson-state').first().textContent())?.trim() ?? '';
  check(restored === 'Finished', 'and the code brings the finished lesson back');

  // An older code must ADD NOTHING rather than take something away.
  await page.locator('#learn-restore').fill(savedCode);
  await page.locator('#learn-restore-go').click();
  const stillThere = (await page.locator('.lesson-row .lesson-state').first().textContent())?.trim() ?? '';
  check(stillThere === 'Finished', 'and using it twice takes nothing away');

  // A mistyped code is refused rather than silently loading something else.
  const mistyped = savedCode.slice(0, -1) + (savedCode.endsWith('Z') ? 'Y' : 'Z');
  await page.locator('#learn-restore').fill(mistyped);
  await page.locator('#learn-restore-go').click();
  const refused = (await page.locator('#learn-restore-status').textContent()) ?? '';
  check(/did not check out|does not look like/i.test(refused), `a mistyped code is refused (${refused.slice(0, 40)}...)`);

  /* ---- the practice door ---- */
  //
  // THE OTHER HALF OF THE CODE WALL. The assignment journey above ended holding
  // a completion code; this one must not be able to, and the engine refuses at
  // `completionPayload` rather than trusting a screen to hide a button. What is
  // checked here is the part a student sees: a seed they can read and reuse, an
  // answer available on request, and that same request absent when it is graded.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-practice').click();
  check(await page.locator('#screen-practice').isVisible(), 'the practice door reaches practice');

  const firstSeed = await page.locator('#practice-seed').inputValue();
  check(firstSeed.trim() !== '', `a seed is already there to start with (${firstSeed})`);
  await page.locator('#practice-random').click();
  const secondSeed = await page.locator('#practice-seed').inputValue();
  check(secondSeed.trim() !== '' && secondSeed !== firstSeed, `Random rolls a different one (${secondSeed})`);

  await page.locator('#practice-start').click();
  check(await page.locator('#screen-work').isVisible(), 'practice starts a session');
  check(await page.locator('#work-reveal').isVisible(), 'and the answer is available on request');

  await page.locator('#work-reveal').click();
  const revealed = (await page.locator('#work-revealed').textContent())?.trim() ?? '';
  check(revealed !== '', `asking shows the step's answer (${revealed.slice(0, 46)}...)`);

  // THE SAME CONTROL MUST BE GONE WHEN IT IS GRADED. Hidden rather than
  // disabled, and checked from a real assignment session rather than by reading
  // the markup — the app removes it on the mode, not on the stylesheet.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-assignment').click();
  await page.locator('#setup-roster').fill(String(ROSTER));
  await page.locator('#setup-key').fill(KEY);
  await page.locator('#setup-start').click();
  check(
    !(await page.locator('#work-reveal').isVisible()),
    'and there is no such offer in a class assignment',
  );

  /* ---- the way out of a set, and where the verdict lands ---- */
  //
  // BOTH FOUND ON A REAL TABLET, not here. A set had no exit at all — finish it
  // or reload the page — and the diagnosis rendered below the whole form, so
  // with the keyboard up a student saw "Not that one." and nothing else. The
  // sentence underneath is the entire product.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-practice').click();
  await page.locator('#practice-start').click();

  check(await page.locator('#work-leave').isVisible(), 'a set can be left, and the way out is on screen');

  // THE ORDER OF THE DOORS IS THE OWNER'S CALL and is asserted rather than left
  // to whoever edits the markup: learning first, practice second, the class
  // assignment last.
  const doorOrder = await page.evaluate(() =>
    [...document.querySelectorAll('.door')].map((node) => node.id));
  check(
    JSON.stringify(doorOrder) === JSON.stringify(['door-learn', 'door-practice', 'door-assignment']),
    `learning comes before the errand, on the menu (${doorOrder.join(', ')})`,
  );

  {
    const inputs = page.locator('#work-inputs input');
    const count = await inputs.count();
    for (let at = 0; at < count; at += 1) await inputs.nth(at).fill('9');
    await page.locator('#work-form button[type="submit"]').click();
    await page.locator('#work-feedback .note-wrong').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  }

  // THE VERDICT IS ABOVE THE REVEAL, in document order, so an opened reveal
  // cannot push the diagnosis further down the page.
  const order = await page.evaluate(() => {
    const feedback = document.querySelector('#work-feedback');
    const reveal = document.querySelector('#work-reveal');
    if (feedback === null || reveal === null) return 'missing';
    return (feedback.compareDocumentPosition(reveal) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      ? 'verdict first'
      : 'reveal first';
  });
  check(order === 'verdict first', `the verdict comes before the reveal (${order})`);

  // AND FOCUS IS ON IT, not back in the box. Re-focusing the field is what put
  // the keyboard over the diagnosis on a tablet.
  const focused = await page.evaluate(() => document.activeElement?.id ?? '(none)');
  check(focused === 'work-feedback', `focus lands on the diagnosis after a rejection (${focused})`);

  // IN VIEW, measured rather than assumed, on a viewport the size of a phone
  // with a keyboard taking half of it.
  await page.setViewportSize({ width: 390, height: 380 });
  await page.locator('#work-form button[type="submit"]').click();
  await page.locator('#work-feedback .note-wrong').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  const seen = await page.evaluate(() => {
    const why = document.querySelector('#work-feedback .why') ?? document.querySelector('#work-feedback .note-wrong');
    if (why === null) return null;
    const box = why.getBoundingClientRect();
    return { top: Math.round(box.top), bottom: Math.round(box.bottom), height: innerHeight };
  });
  check(
    seen !== null && seen.top >= 0 && seen.bottom <= seen.height,
    `the reason a step was wrong is on screen at 390x380 (${JSON.stringify(seen)})`,
  );
  await page.setViewportSize({ width: 1280, height: 900 });

  // Practice leaves in one tap; there is nothing to lose.
  await page.locator('#work-leave').click();
  check(await page.locator('#screen-home').isVisible(), 'and leaving practice takes one tap');

  // An assignment takes two, because leaving throws the code away.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-assignment').click();
  await page.locator('#setup-roster').fill(String(ROSTER));
  await page.locator('#setup-key').fill(KEY);
  await page.locator('#setup-start').click();
  await page.locator('#work-leave').click();
  check(await page.locator('#screen-work').isVisible(), 'leaving an assignment does not happen on one tap');
  const armedText = (await page.locator('#work-leave').textContent()) ?? '';
  check(/code/i.test(armedText), `and the second tap says what it costs (${armedText.trim()})`);
  await page.locator('#work-leave').click();
  check(await page.locator('#screen-home').isVisible(), 'and the second tap leaves');

  /* ---- practising one step, as long as you like ---- */
  //
  // THE ROUTE A STRUGGLING STUDENT TAKES: get it wrong, read what the mistake
  // was, and practise that one step rather than walking five others to reach it.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-practice').click();
  await page.locator('#practice-start').click();
  {
    const boxes = page.locator('#work-inputs input');
    const count = await boxes.count();
    for (let at = 0; at < count; at += 1) await boxes.nth(at).fill('9');
    await page.locator('#work-submit').click();
    await page.locator('#work-feedback .note-wrong').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  }
  await page.locator('#work-feedback [data-explain]').click();
  const drillOffer = page.locator('#reference-detail [data-drill-step]');
  check((await drillOffer.count()) > 0, 'the page about a mistake offers to drill that step');
  await drillOffer.first().click();
  check(await page.locator('#screen-drill').isVisible(), 'and one tap starts it');

  // AS MANY AS YOU LIKE. Answer several, right and wrong, and confirm the app
  // keeps handing them over without ever asking for a target.
  let asked = 0;
  for (let round = 0; round < 4; round += 1) {
    const boxes = page.locator('#drill-inputs input');
    const count = await boxes.count();
    if (count === 0) break;
    for (let at = 0; at < count; at += 1) await boxes.nth(at).fill(round === 0 ? '9' : '1');
    await page.locator('#drill-check').click();
    await page.locator('#drill-feedback .note').first().waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    asked += 1;
    await page.locator('#drill-next').click();
  }
  check(asked >= 3, `it keeps giving new ones (${asked})`);

  // NOTHING THAT REWARDS OR SHAMES, on the screen a student actually reads.
  const drillText = (await page.locator('#screen-drill').textContent()) ?? '';
  for (const forbidden of ['streak', 'badge', 'great job', 'well done', 'keep it up', 'score']) {
    check(!drillText.toLowerCase().includes(forbidden), `the drill screen never says "${forbidden}"`);
  }
  check(!/\b\d+\s*\/\s*\d+\b/.test(drillText), 'and never shows a mark out of anything');

  // STOPPING IS NOT A STATE THE APP HAS AN OPINION ABOUT.
  await page.locator('#drill-stop').click();
  const said = (await page.locator('#drill-summary').textContent()) ?? '';
  check(said.trim() !== '', 'stopping says what happened');
  check(
    !/try again|keep going|next time|you should/i.test(said),
    `and does not tell them what to do about it (${said.trim().slice(0, 80)})`,
  );

  // And it is reachable without getting anything wrong first.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-learn').click();
  await page.locator('#learn-drill').click();
  const steps = await page.locator('#drill-list [data-drill]').count();
  check(steps >= 6, `every step can be chosen deliberately (${steps})`);

  /* ---- no screen states a count the app can contradict ---- */
  //
  // THE HOME SCREEN SAID "Seven short lessons" WITH EIGHT IN THE APP. Nothing
  // failed: no gate reads prose, and the number was right when it was typed.
  // This is 3d-printing-pal's checkOrientationTypes in the hub's own notes,
  // happening here — a welcome describing three job types after a fourth was
  // added. The fix is not a better number, it is prose that does not carry one.
  // AND THE FIX WENT TO THE ONE SCREEN THE CHECK READ. The learn screen said
  // "Seven lessons" for four releases after this gate was written, because the
  // gate asked `#screen-home` and the sentence was one screen further in. A
  // check narrower than the rule it enforces is the defect wearing the fix's
  // clothes — so this reads every screen at once, hidden ones included.
  //
  // `#main` and not the whole document, deliberately: the patch notes live in a
  // dialog outside it and say "Lessons. Seven of them", which was true in the
  // release it describes. A record of what shipped is not a claim about now.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  const appCopy = (await page.locator('#main').textContent()) ?? '';
  const counted = /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(short\s+)?lessons\b/i.exec(appCopy);
  check(
    counted === null,
    `no screen states how many lessons there are (${counted?.[0] ?? 'none'})`,
  );

  /* ---- the warm-up: a link, and five minutes ---- */
  //
  // THE ONE USE A REAL TEACHER NAMED. She sees the same students twice a week,
  // so a period spent on practice is a period not spent on chemistry — but five
  // minutes at the start of a Monday is real. That has to cost a student ZERO
  // taps, which is why it is a link rather than a screen.
  const boardLink = warmupLink(server.origin, 'MONDAY7', 2, WARMUP_PROBLEMS);

  // FROM A PAGE THAT IS ALREADY OPEN, first, because that is the case that
  // broke. A URL differing only by its fragment is a same-document navigation:
  // no reload, so boot never runs again. After the first visit — and MoleBridge
  // installs to a home screen — most students tapping her link are in exactly
  // this state, and it would have worked for everyone with a fresh tab.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.evaluate((href) => { location.href = href; }, boardLink);
  await page.locator('#screen-work').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  check(true, 'the link works from a tab that already had the app open');

  await page.goto(boardLink, { waitUntil: 'load' });
  check(await page.locator('#screen-work').isVisible(), 'a warm-up link opens straight into a problem');
  const warmProgress = (await page.locator('#work-progress').textContent()) ?? '';
  check(
    warmProgress.includes(String(WARMUP_PROBLEMS)),
    `and it is ${WARMUP_PROBLEMS} problems, not a lesson (${warmProgress.trim()})`,
  );

  // NO WELCOME IN FRONT OF A CLASS, and the orientation is not lost either:
  // §7e wants it reachable, and the app must not record that somebody read a
  // thing it never showed them.
  check(
    !(await page.locator('#welcome-panel[open]').isVisible()),
    'without a first-run modal in front of twenty-eight students',
  );
  await page.locator('#info-open').click();
  const infoAfterWarmup = (await page.locator('#info-panel').textContent()) ?? '';
  check(infoAfterWarmup.includes('Installing'), 'and the orientation is still reachable behind the ⓘ');
  await page.locator('#info-close').click();

  // THE LINK IS SPENT. Left in the address bar, a reload restarts the warm-up
  // from the beginning rather than resuming it.
  const barAfter = await page.evaluate(() => location.hash);
  check(barAfter === '', `the link is cleared from the address bar once used ("${barAfter}")`);

  // EVERYONE GETS THE SAME PROBLEMS, which is what makes it discussable.
  const firstEquation = (await page.locator('#work-equation').textContent()) ?? '';
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto(boardLink, { waitUntil: 'load' });
  await second.locator('#screen-work').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  const secondEquation = (await second.locator('#work-equation').textContent()) ?? '';
  check(
    firstEquation === secondEquation && firstEquation !== '',
    `two students opening the same link get the same problem (${firstEquation.trim()})`,
  );
  await other.close();

  // AND NOTHING IS HANDED IN. A warm-up is practice with a shared seed, so the
  // engine's own wall means there is no completion code to produce.
  check(
    !(await page.locator('#work-reveal').isHidden()),
    'the answer can still be asked for, because this is practice',
  );

  /* ---- a session survives the tab closing ---- */
  //
  // A REAL RELOAD, because nothing else proves this. Before, a refresh threw
  // away a half-finished set and everything typed into it — which for a student
  // whose accommodation is stopping mid-task made the app punish the
  // accommodation.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-assignment').click();
  await page.locator('#setup-roster').fill(String(ROSTER));
  await page.locator('#setup-key').fill(KEY);
  // TIER AND COUNT SET EXPLICITLY. Left to the form's defaults, the problem on
  // screen was not the one generated below, and the first submit silently did
  // not advance — which surfaced thirty seconds later as a missing answer box.
  await page.locator(`#setup-tier button[data-tier="${TIER}"]`).click();
  await page.locator(`#setup-count button[data-count="${COUNT}"]`).click();
  await page.locator('#setup-start').click();

  // Get one step right, so the restored session has a position to be wrong
  // about, then type into the next one WITHOUT submitting.
  {
    const first = generateProblem(KEY, TIER, 0);
    const answers = solve(first).coefficients;
    const boxes = page.locator('#work-inputs input');
    for (let at = 0; at < answers.length; at += 1) await boxes.nth(at).fill(String(answers[at]));
    await page.locator('#work-submit').click();
    await page.locator('#stage-answer').fill('123.456 g/mol');
  }
  const wasProgress = (await page.locator('#work-progress').textContent()) ?? '';

  await page.reload({ waitUntil: 'load' });

  check(await page.locator('#resume-strip').isVisible(), 'after a reload, the open problem is offered back');
  const offered = (await page.locator('#resume-message').textContent()) ?? '';
  check(offered.includes(KEY), `and names the set it belongs to (${offered.trim()})`);
  // OFFERED, NOT FORCED. A student who closed the tab may have meant to leave.
  check(await page.locator('#screen-home').isVisible(), 'and does not drag them back into it');

  await page.locator('#resume-go').click();
  check(await page.locator('#screen-work').isVisible(), 'and one tap goes back to the problem');
  const nowProgress = (await page.locator('#work-progress').textContent()) ?? '';
  check(nowProgress === wasProgress, `at the same place in the set (${nowProgress} was ${wasProgress})`);
  const keptInBox = await page.locator('#stage-answer').inputValue();
  check(keptInBox === '123.456 g/mol', `with what was typed and never submitted still in the box (${keptInBox})`);

  // Leaving clears it: a set abandoned on purpose must not come back.
  await page.locator('#work-leave').click();
  await page.locator('#work-leave').click();
  await page.reload({ waitUntil: 'load' });
  check(
    !(await page.locator('#resume-strip').isVisible()),
    'a set left on purpose is not offered back after a reload',
  );

  /* ---- what changed, after the app changed under you ---- */
  //
  // §7h TOLD THE READER A NEW VERSION WAS WAITING AND THEN SAID NOTHING ABOUT
  // IT. The strip offers the switch, the page reloads, the app is different,
  // and the account of what changed sat behind the ⓘ — which is a place you
  // only open if you already suspect there is news.
  //
  // AFTER THE RELOAD RATHER THAN ON THE STRIP, because the page showing the
  // strip is the OLD build: its release notes were generated before the release
  // it is offering existed, so anything it said about the waiting version would
  // be invented.
  check(RELEASES.length >= 4, `there are enough releases to walk this (${RELEASES.length})`);

  /** Wait until the device has actually recorded that it was shown `version`. */
  const readingRecorded = (version) =>
    page.waitForFunction(
      ([key, want]) => localStorage.getItem(key) === want,
      [SEEN_VERSION_KEY, version],
      { timeout: TIMEOUT_MS },
    );

  // A RETURNING READER WITH NOTHING RECORDED — which is every existing reader
  // on the release that starts recording it. They are not a newcomer and must
  // not be treated as one.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.evaluate((key) => {
    localStorage.setItem('molebridge.orientation.seen', 'yes');
    localStorage.removeItem(key);
  }, SEEN_VERSION_KEY);
  await page.reload({ waitUntil: 'load' });

  check(await page.locator('#whatsnew-panel[open]').isVisible(), 'a returning reader is shown what changed');
  check(
    !(await page.locator('#welcome-panel[open]').isVisible()),
    'and not the first-run welcome on top of it',
  );
  const firstNotes = await page.locator('#whatsnew-body .release').count();
  check(
    firstNotes === 1,
    `one release, which is the most it can say without inventing what they last saw (${firstNotes})`,
  );
  const headed = (await page.locator('#whatsnew-body .release h3').first().textContent()) ?? '';
  check(headed.includes(RELEASES[0].version), `and it is the release they are running (${headed.trim()})`);

  // WAITED FOR, NOT READ IMMEDIATELY — the same race that lost one run in three
  // on the orientation move. `dialog.close()` fires its `close` event as a
  // queued task rather than synchronously, and the version is recorded there
  // (so that Escape and the backdrop count too), which means a reload issued
  // straight after the click can outrun the write.
  await page.locator('#whatsnew-done').click();
  await readingRecorded(RELEASES[0].version);
  await page.reload({ waitUntil: 'load' });
  check(
    !(await page.locator('#whatsnew-panel[open]').isVisible()),
    'and once read it does not come back on the next launch',
  );

  // BEHIND BY THREE. A Chromebook that sat over a holiday comes back several
  // releases behind, and being told only about the most recent one is how a
  // reader concludes the app changes for no reason.
  const wayBack = RELEASES[3].version;
  await page.evaluate(([key, version]) => localStorage.setItem(key, version), [SEEN_VERSION_KEY, wayBack]);
  await page.reload({ waitUntil: 'load' });
  const catchUp = await page.locator('#whatsnew-body .release').count();
  check(catchUp === 3, `three releases behind shows all three (${catchUp})`);
  const listed = await page.locator('#whatsnew-body .release h3').allTextContents();
  check(
    !listed.some((line) => line.includes(wayBack)),
    `and never the release they already had (${wayBack})`,
  );

  // ESCAPE COUNTS AS READ. A dialog closes on Escape and on the backdrop, and a
  // reader who dismissed it that way has still been shown it — recording only
  // on the button would mean the same notes on every launch, which is how
  // people learn to dismiss a panel without reading it.
  await page.keyboard.press('Escape');
  await readingRecorded(RELEASES[0].version);
  await page.reload({ waitUntil: 'load' });
  check(
    !(await page.locator('#whatsnew-panel[open]').isVisible()),
    'dismissing with Escape counts as having been shown it',
  );

  // NOT OVER WORK IN PROGRESS, AND NOT LOST EITHER. A student resuming a saved
  // session has a problem waiting with their working still in it. Release notes
  // are not what that moment is for — and nothing is recorded, so the offer
  // stands until they open the app with nothing in front of them.
  //
  // THE SET IS STARTED BEFORE THE NEWS IS OWED, in that order deliberately: the
  // panel is modal, so making it due first puts it over the home screen and
  // there is nothing to click through to. That is the panel working — it is the
  // welcome's behaviour exactly — and it is also how this step was written the
  // first time, which cost a thirty-second timeout to notice.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-assignment').click();
  await page.locator('#setup-roster').fill(String(ROSTER));
  await page.locator('#setup-key').fill(KEY);
  await page.locator(`#setup-tier button[data-tier="${TIER}"]`).click();
  await page.locator(`#setup-count button[data-count="${COUNT}"]`).click();
  await page.locator('#setup-start').click();
  await page.locator('#screen-work').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  await page.evaluate(([key, version]) => localStorage.setItem(key, version), [SEEN_VERSION_KEY, wayBack]);
  await page.reload({ waitUntil: 'load' });

  check(await page.locator('#resume-strip').isVisible(), 'a resumed session is offered back');
  check(
    !(await page.locator('#whatsnew-panel[open]').isVisible()),
    'and the release notes do NOT open over it',
  );
  const stillOwed = await page.evaluate((key) => localStorage.getItem(key), SEEN_VERSION_KEY);
  check(stillOwed === wayBack, `and the news is still owed rather than swallowed (${stillOwed})`);

  await page.locator('#resume-go').click();
  await page.locator('#work-leave').click();
  await page.locator('#work-leave').click();
  await page.reload({ waitUntil: 'load' });
  check(
    await page.locator('#whatsnew-panel[open]').isVisible(),
    'and it arrives the next time nothing is in front of them',
  );
  // WAITED FOR AGAIN, and this one was found the hard way: leaving without it
  // left the notes still owed, so the panel opened over the home screen in a
  // later section and intercepted a click thirty seconds from here. A modal is
  // shared state between parts of a walk that do not know about each other.
  await page.locator('#whatsnew-done').click();
  await readingRecorded(RELEASES[0].version);

  /* ---- no way out is inside the box that scrolls ---- */
  //
  // ONE INVARIANT OVER EVERY <dialog> IN THE DOCUMENT, with no app state, so it
  // covers surfaces this walk has never found a route to and a new one is red
  // from the day it exists. Hub LESSONS 141: an app shipped 142 releases with
  // two dialogs carrying this defect untouched, under a check that reported
  // "every scrolling surface with a way out" — because it found its subjects by
  // looking for the class the FIX added, so a surface that never got the fix
  // was not a failing row, it was not a row.
  //
  // THE WAY OUT IS DECLARED (`data-way-out`), not inferred from an id ending in
  // "-close": that convention would silently exempt the two dialogs here that
  // leave by "Get started" and "Got it", which are the two longest.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  const exits = await page.evaluate(() => {
    const scrolls = (node) => {
      const overflow = getComputedStyle(node).overflowY;
      return overflow === 'auto' || overflow === 'scroll';
    };
    return [...document.querySelectorAll('dialog')].map((dialog) => {
      const ways = [...dialog.querySelectorAll('[data-way-out]')];
      const scrollers = [...dialog.querySelectorAll('*')].filter(scrolls);
      return {
        id: dialog.id,
        ways: ways.length,
        buried: ways
          .filter((way) => scrollers.some((box) => box !== way && box.contains(way)))
          .map((way) => way.id || (way.textContent ?? '').trim()),
      };
    });
  });

  check(exits.length > 0, `every dialog in the document is measured (${exits.length})`);
  for (const dialog of exits) {
    check(dialog.ways > 0, `#${dialog.id} declares a way out`);
    check(
      dialog.buried.length === 0,
      `#${dialog.id} keeps its way out clear of the scrolling body${
        dialog.buried.length === 0 ? '' : ` (${dialog.buried.join(', ')})`
      }`,
    );
  }

  /* ---- the whole history is a page in the app, not a link off it ---- */
  //
  // The dialog and the ⓘ show the newest few. A reader who wants the rest gets
  // a page that is part of the app and cached with it — not a code host, which
  // is a different audience's document in a different audience's language.
  await page.goto(`${server.origin}/changes/`, { waitUntil: 'load' });
  const everyRelease = await page.locator('#changes-list .release').count();
  check(
    everyRelease === RELEASES.length,
    `the history page carries every release (${everyRelease} of ${RELEASES.length})`,
  );
  const historyStamp = (await page.locator('#build-stamp').textContent())?.trim() ?? '';
  check(historyStamp === RELEASES[0].version, `and says which version it is (${historyStamp})`);

  /* ---- the number goes back in the box, and the chain stays on screen ---- */
  //
  // TWO THINGS A STUDENT SHOULD NOT NEED PAPER FOR. The calculator's result had
  // to be read off a panel and retyped, and the steps already passed took their
  // numbers off the screen — while a revealed intermediate tells the student to
  // carry the unrounded value into the next step, which cannot be done against
  // a number that is gone.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-practice').click();
  await page.locator('#practice-seed').fill('CARRY-WALK');
  await page.locator(`#practice-tier button[data-value="2"]`).click();
  await page.locator(`#practice-count button[data-value="3"]`).click();
  await page.locator('#practice-start').click();
  await page.locator('#screen-work').waitFor({ state: 'visible', timeout: TIMEOUT_MS });

  // The calculator hands its answer to the box the student was last in.
  await page.locator('#work-inputs input').first().click();
  await page.locator('#calc-open').click();
  await page.locator('#calc-entry').fill('2*3');
  const calcResult = (await page.locator('#calc-out').textContent())?.trim() ?? '';
  check(calcResult === '6', `the calculator works the sum out (${calcResult})`);
  check(await page.locator('#calc-use').isVisible(), 'and offers to put it in the answer box');
  await page.locator('#calc-use').click();
  const landed = await page.locator('#work-inputs input').first().inputValue();
  check(landed === '6', `which is where it lands (${landed})`);
  check(!(await page.locator('#calc-panel[open]').isVisible()), 'and the panel gets out of the way');

  // NOT OFFERED WHERE THERE IS NOWHERE TO PUT IT. The calculator opens from
  // every screen and most of them have no answer to fill in; a control that can
  // never do anything here is not a control that is temporarily unavailable.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#calc-open').click();
  check(
    !(await page.locator('#calc-use').isVisible()),
    'and it is not offered on a screen with no answer box',
  );
  await page.locator('#calc-close').click();

  // Now walk a problem and watch the chain build up in the rail.
  {
    await page.goto(`${server.origin}/`, { waitUntil: 'load' });
    await page.locator('#door-practice').click();
    await page.locator('#practice-seed').fill('CARRY-WALK');
    await page.locator(`#practice-tier button[data-value="2"]`).click();
    await page.locator(`#practice-count button[data-value="3"]`).click();
    await page.locator('#practice-start').click();

    const problem = generateProblem('CARRY-WALK', 2, 0);
    const solution = solve(problem);
    const stages = stagesFor(problem);

    check(
      (await page.locator('#work-rail .rail-value').count()) === 0,
      'nothing is carried before the first step is finished',
    );

    // Two stages is enough: the first produces a value, the second has to be
    // able to see it.
    const coefficients = solution.coefficients;
    const boxes = page.locator('#work-inputs input');
    for (let at = 0; at < coefficients.length; at += 1) await boxes.nth(at).fill(String(coefficients[at]));
    await page.locator('#work-submit').click();

    const carriedNow = await page.locator('#work-rail .rail-value').allTextContents();
    check(carriedNow.length === 1, `the finished step keeps what was put in it (${carriedNow.length})`);
    const wanted = coefficients.join(', ');
    check(
      carriedNow[0]?.trim() === wanted,
      `and it is what the student typed, not the grader's copy (${carriedNow[0]?.trim()} vs ${wanted})`,
    );

    // AND IT IS THEIRS, NOT THE EXACT VALUE. A deliberately rounded entry that
    // is still inside tolerance must come back rounded — showing the exact one
    // would silently correct them, and would repair rounding-early behind their
    // back, which is a class this taxonomy names and reports.
    const second = stages[1];
    if (second !== undefined && second.kind !== 'CHOICE' && second.kind !== 'COEFFICIENTS') {
      const exact = correctText(problem, solution, second);
      const rounded = exact.replace(/^(\d+\.\d{3})\d+/, '$1');
      await page.locator('#stage-answer').fill(rounded);
      await page.locator('#work-submit').click();
      const shown = (await page.locator('#work-rail .rail-value').allTextContents()).at(-1)?.trim() ?? '';
      const advanced = (await page.locator('#work-rail .rail-value').count()) === 2;
      check(
        !advanced || shown === rounded,
        `an accepted entry is shown as the student wrote it (${shown} vs ${rounded})`,
      );
    }

    // ONE-STEP-AT-A-TIME MUST NOT TAKE THE CHAIN AWAY. That setting hides the
    // rail, which is what the student asked for — and was hiding with it the
    // numbers the next step needs. Exactly one of the two routes is on screen,
    // and never neither.
    await page.evaluate(() => localStorage.setItem('molebridge.focus', 'on'));
    await page.reload({ waitUntil: 'load' });
    await page.locator('#resume-go').click();
    await page.locator('#screen-work').waitFor({ state: 'visible', timeout: TIMEOUT_MS });

    check(
      !(await page.locator('#work-rail').isVisible()),
      'one step at a time hides the row of steps, as it is meant to',
    );
    const soFar = page.locator('#work-so-far');
    check(await soFar.isVisible(), 'and What you have so far takes its place');
    check(
      !(await page.locator('#work-so-far-list').isVisible()),
      'folded away, so the setting still puts less on screen',
    );
    const summaryBox = await soFar.locator('summary').boundingBox();
    check(
      summaryBox !== null && summaryBox.height >= 44,
      `which a finger can open (${summaryBox === null ? 'not found' : `${Math.round(summaryBox.height)}px`})`,
    );
    await soFar.locator('summary').click();
    const keptValues = await page.locator('#work-so-far-list .so-far-value').allTextContents();
    check(
      keptValues.some((text) => text.trim() === wanted),
      `and it holds what they typed (${keptValues.join(' | ')})`,
    );

    // BACK OFF AGAIN, so the two are never both hidden and never both shown.
    await page.evaluate(() => localStorage.setItem('molebridge.focus', 'off'));
    await page.reload({ waitUntil: 'load' });
    await page.locator('#resume-go').click();
    await page.locator('#screen-work').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    check(await page.locator('#work-rail').isVisible(), 'with the setting off the row of steps is back');
    check(
      !(await page.locator('#work-so-far').isVisible()),
      'and the folded copy is not also there, which would be the same numbers twice',
    );

    // AND NONE OF IT LEAVES THE DEVICE. The problem report says in its own words
    // that it carries no answers and no working.
    await page.locator('#report-open').click();
    await page.locator('#report-what input').first().check();
    // WAITED FOR — the report repaints through a promise, and reading straight
    // after the click races it. Third time in this file.
    await page
      .waitForFunction(
        () => /what went wrong: [A-Z-]+/.test(document.querySelector('#report-body')?.textContent ?? ''),
        undefined,
        { timeout: TIMEOUT_MS },
      )
      .catch(() => {});
    const reportBody = (await page.locator('#report-body').textContent()) ?? '';
    check(
      !reportBody.includes(wanted),
      'and what was typed is NOT in the problem report',
    );
    await page.locator('#report-close').click();
  }

  /* ---- the periodic table ---- */
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-practice').click();
  await page.locator('#practice-start').click();

  await page.locator('#table-open').click();
  check(await page.locator('#table-panel[open]').isVisible(), 'the periodic table opens from the chrome');
  const cells = await page.locator('#table-grid .table-cell').count();
  check(cells === ELEMENTS.length, `all ${ELEMENTS.length} elements are on it (${cells})`);

  await page.locator('#table-grid [data-z="6"]').click();
  const carbon = (await page.locator('#table-detail').textContent()) ?? '';
  check(/Carbon/.test(carbon), 'picking one writes its name out');
  check(/12\.011/.test(carbon), 'with its atomic weight at the published figures');

  // WEIGHTS ONLY. A table that turned a formula into a molar mass would delete
  // the same error classes the calculator's refusal protects, so the panel is
  // checked for the one number that would prove it had.
  // Checked against VALUES rather than against the words. The first version of
  // this matched /molar mass is/ and went red on the panel's own sentence
  // explaining that it will not work one out — a check that fires on the copy
  // saying the rule is being kept.
  const panelText = (await page.locator('#table-panel').textContent()) ?? '';
  check(!/159\.6\d|249\.6\d|180\.1\d/.test(panelText), 'and no molar mass is anywhere on it');
  check(/practising/i.test(panelText), 'and it says why it stops there');

  await page.locator('#table-close').click();
  check(await page.locator('#work-inputs').isVisible(), 'and closing it leaves the problem where it was');

  /* ---- reading settings, and what they must never do ---- */
  //
  // Device-local accommodations: text size, spacing, and one-step-at-a-time.
  // The load-bearing assertion is the LAST one — none of this reaches the code
  // a student hands in. An accommodation somebody discloses by using it is not
  // an accommodation.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-practice').click();
  await page.locator('#practice-start').click();

  const rootSize = () =>
    page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  const normalSize = await rootSize();

  await page.locator('#info-open').click();
  await page.locator('#reading-text input[value="largest"]').check();
  const biggerSize = await rootSize();
  check(biggerSize > normalSize, `largest text really is bigger (${normalSize} to ${biggerSize})`);

  await page.locator('#reading-spacing input[value="roomy"]').check();
  const spacing = await page.evaluate(() => getComputedStyle(document.body).letterSpacing);
  check(spacing !== 'normal', `spacing opens up the letters (${spacing})`);
  // NOT THE CODE OR THE FORMULAS. A completion code is transcribed character by
  // character, and a formula's subscripts are part of its meaning.
  await page.locator('#info-close').click();
  const equationSpacing = await page.evaluate(() => {
    const node = document.querySelector('.equation');
    return node === null ? 'normal' : getComputedStyle(node).letterSpacing;
  });
  check(equationSpacing === 'normal', `the equation keeps its own spacing (${equationSpacing})`);

  await page.locator('#info-open').click();
  await page.locator('#reading-focus input[value="on"]').check();
  await page.locator('#info-close').click();
  check(!(await page.locator('#work-rail').isVisible()), 'one-step-at-a-time hides the step rail');
  check(await page.locator('#work-inputs').isVisible(), 'and keeps the step you are on');

  // It survives a reload, like every other preference here.
  await page.reload({ waitUntil: 'load' });
  const keptSize = await rootSize();
  check(keptSize === biggerSize, `the reading settings survive a reload (${keptSize})`);

  // BACK INTO THE PROBLEM FIRST. The reload above left a saved session, so the
  // app is on the home screen offering it — which is 1.2.0 working, and is why
  // the work screen's own controls are not on screen yet.
  await page.locator('#resume-go').click();
  await page.locator('#screen-work').waitFor({ state: 'visible', timeout: TIMEOUT_MS });

  /*
    THE ONE THAT MATTERS, and the first version of it was worthless: it set the
    three values itself and then checked they were in localStorage, which is
    true by construction and could never fail.

    What is actually worth asserting is that they do NOT reach the two things
    that leave the device. The completion code is held to its declared fields by
    `readout.test.ts`; the problem report is checked here, with every reading
    setting turned on, because it is the other thing a student hands over.
  */
  await page.locator('#report-open').click();
  await page.waitForFunction(
    () => /what went wrong/i.test(document.querySelector('#report-body')?.textContent ?? ''),
    undefined,
    { timeout: TIMEOUT_MS },
  );
  const reportWithSettings = (await page.locator('#report-body').textContent()) ?? '';
  for (const setting of ['largest', 'roomy', 'spacing', 'text size', 'read aloud']) {
    check(
      !reportWithSettings.toLowerCase().includes(setting),
      `the problem report says nothing about "${setting}"`,
    );
  }
  await page.locator('#report-close').click();

  // Read-aloud: present, and it is the browser's own speech rather than
  // anything that listens. The permissions gate is what holds the second half.
  check(await page.locator('#work-speak').isVisible(), 'a step can be read out loud');
  await page.locator('#work-speak').click();
  check(
    (await page.evaluate(() => typeof speechSynthesis !== 'undefined')) === true,
    'using the browser\'s own speech, which asks for nothing',
  );

  /* ---- the calculator, and what it must refuse ---- */
  //
  // THE REFUSAL IS THE FEATURE. A box that takes CuSO4 and returns 159.6 deletes
  // three error classes from the taxonomy, so the refusal is walked on a real
  // screen rather than trusted to the unit test alone.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-practice').click();
  await page.locator('#practice-start').click();

  check(await page.locator('#calc-open').isVisible(), 'the calculator is in the chrome, on every screen');
  await page.locator('#calc-open').click();
  check(await page.locator('#calc-panel[open]').isVisible(), 'and it opens over the problem');

  await page.locator('#calc-entry').fill('2.50 * 4');
  const sum = (await page.locator('#calc-out').textContent())?.trim();
  check(sum === '10', `it does the arithmetic (${sum})`);

  await page.locator('#calc-entry').fill('CuSO4');
  const refusal = (await page.locator('#calc-out').textContent()) ?? '';
  check(/molar mass/i.test(refusal), 'and refuses a formula, saying what it is for');
  check(!/\d{2,}/.test(refusal), 'without leaking a number while refusing');

  // The keypad works too — the board at the front has no keyboard in reach.
  await page.locator('#calc-entry').fill('');
  for (const key of ['6', '×', '7']) await page.locator(`#calc-keys [data-key="${key}"]`).click();
  const tapped = (await page.locator('#calc-out').textContent())?.trim();
  check(tapped === '42', `the keys work as well as the keyboard (${tapped})`);

  await page.locator('#calc-close').click();
  check(await page.locator('#work-inputs').isVisible(), 'and closing it leaves the problem where it was');

  // NOTHING CARRIES BETWEEN OPENS. A calculator that remembers is one step from
  // a calculator that knows which problem you are on.
  await page.locator('#calc-open').click();
  const reopened = await page.locator('#calc-entry').inputValue();
  check(reopened === '', `it is empty when it opens again ("${reopened}")`);
  await page.locator('#calc-close').click();

  /* ---- the reference, and the route into it from a wrong answer ---- */
  //
  // THE POINT OF THE WHOLE SURFACE is that a diagnosis is not the last word. A
  // student who reads "the ratio is upside down" and does not know what the
  // ratio is has been told the name of their problem and nothing else, so the
  // route from the sentence to the explanation is walked rather than assumed.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-practice').click();
  await page.locator('#practice-start').click();

  // Get the first step wrong on purpose, the same way the journey above does.
  {
    const inputs = page.locator('#work-inputs input');
    const count = await inputs.count();
    for (let at = 0; at < count; at += 1) await inputs.nth(at).fill('9');
    await page.locator('#work-form button[type="submit"]').click();
    await page.locator('#work-feedback .note-wrong').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  }

  const explain = page.locator('#work-feedback [data-explain]');
  const attributed = await explain.count();
  check(attributed === 1, `a diagnosed wrong answer offers a way to read more (${attributed})`);
  if (attributed === 1) {
    const which = await explain.getAttribute('data-explain');
    await explain.click();
    check(await page.locator('#reference-panel[open]').isVisible(), 'and it opens the reference');
    // AT THE ENTRY, not at a list of twenty. Making somebody find their own
    // mistake in a contents page asks them to diagnose themselves before they
    // can read the diagnosis.
    check(
      await page.locator('#reference-detail').isVisible(),
      'at the page for the mistake, not at the contents',
    );
    const shown = (await page.locator('#reference-title').textContent()) ?? '';
    const expected = REFERENCE.find((entry) => entry.id === which)?.called ?? '(none)';
    check(shown.trim() === expected, `showing "${expected}" (${shown.trim()})`);

    // The problem is STILL THERE underneath. A screen would have had to unmount
    // it; a dialog does not, and that is the reason it is a dialog.
    await page.locator('#reference-close').click();
    check(await page.locator('#work-inputs').isVisible(), 'and closing it leaves the problem where it was');
  }

  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-learn').click();
  await page.locator('#learn-reference').click();
  const pages = await page.locator('#reference-list .reference-row').count();
  check(
    pages === ERROR_CLASSES.length,
    `every class the engine can attribute has a page (${pages} of ${ERROR_CLASSES.length})`,
  );

  // The lesson link goes somewhere. Followed rather than counted, because a
  // button that opens nothing looks identical to one that works.
  await page.locator('#reference-list .reference-row').first().click();
  const toLesson = page.locator('#reference-detail [data-goto-lesson]');
  if ((await toLesson.count()) > 0) {
    await toLesson.first().click();
    check(await page.locator('#screen-lesson').isVisible(), 'and its lesson link opens that lesson');
    check(
      !(await page.locator('#reference-panel[open]').isVisible()),
      'closing the reference behind it rather than leaving it stacked',
    );
  }

  /* ---- work is never stranded ---- */
  //
  // THE EXACT PATH THAT STRANDED SOMEBODY: get a step wrong, follow the
  // reference to the lesson that teaches it, and try to get back. The session
  // was alive and holding everything typed into it, and no control anywhere led
  // to it. What a student would call losing their work.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-practice').click();
  await page.locator('#practice-start').click();

  const typed = ['7', '8', '9', '6'];
  {
    const boxes = page.locator('#work-inputs input');
    const count = await boxes.count();
    for (let at = 0; at < count; at += 1) await boxes.nth(at).fill(typed[at] ?? '5');
  }
  const readBack = async () =>
    page.evaluate(() => [...document.querySelectorAll('#work-inputs input')].map((box) => box.value).join(','));
  const before = await readBack();

  // Every tool a student might open mid-step, and back again.
  for (const [what, open, close] of [
    ['the calculator', '#calc-open', '#calc-close'],
    ['the periodic table', '#table-open', '#table-close'],
    ['the information panel', '#info-open', '#info-close'],
    ['the report panel', '#report-open', '#report-close'],
  ]) {
    await page.locator(open).click();
    await page.locator(close).click();
    const after = await readBack();
    check(after === before, `what is typed survives opening ${what} (${after || '(empty)'})`);
  }

  // And the route that leaves the screen entirely.
  await page.locator('#work-form button[type="submit"]').click();
  await page.locator('#work-feedback .note-wrong').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  await page.locator('#work-feedback [data-explain]').click();
  const lessonLink = page.locator('#reference-detail [data-goto-lesson]');
  if ((await lessonLink.count()) > 0) {
    await lessonLink.first().click();
    check(await page.locator('#screen-lesson').isVisible(), 'a wrong answer can be followed to its lesson');
    check(
      await page.locator('#resume-strip').isVisible(),
      'and the way back to the problem is on screen there',
    );
    const said = (await page.locator('#resume-message').textContent()) ?? '';
    check(/still open/i.test(said), `which says what is waiting (${said.trim()})`);
    await page.locator('#resume-go').click();
    check(await page.locator('#screen-work').isVisible(), 'and it goes back to the problem');
    check(
      !(await page.locator('#resume-strip').isVisible()),
      'and stops offering once you are there',
    );
  }

  /* ---- reporting a problem ---- */
  //
  // THE ASSURANCE UNDER THE REPORT HAS TO BE TRUE ON A REAL SCREEN, not just in
  // the pure function a unit test can reach. So this runs a real assignment
  // session with a known roster number and reads the report the panel actually
  // renders.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });
  await page.locator('#door-assignment').click();
  await page.locator('#setup-roster').fill('1337');
  await page.locator('#setup-key').fill(KEY);
  await page.locator('#setup-start').click();

  check(await page.locator('#report-open').isVisible(), 'the report control is in the chrome, on every screen');
  await page.locator('#report-open').click();
  check(await page.locator('#report-panel[open]').isVisible(), 'and it opens in one tap');

  // NO FREE-TEXT BOX. This is the design that makes the assurance checkable
  // rather than a promise about what a student typed, so it is asserted rather
  // than left to whoever edits the markup next.
  const writable = await page.locator('#report-panel textarea, #report-panel input[type="text"]').count();
  check(writable === 0, `there is nowhere to type in the report panel (${writable} boxes)`);

  await page.locator('#report-what input').first().check();
  // WAITED FOR, NOT READ. The report repaints asynchronously — it asks the
  // service worker and the cache store about themselves — so reading straight
  // after the click races the repaint. This is the SECOND time that shape has
  // bitten in this file; the first was `dialog.close()` firing its event as a
  // queued task. Anything the app does through a promise needs waiting for, and
  // an assertion that happens to win the race is a flake wearing a green tick.
  const gotSymptom = await page
    .waitForFunction(
      () => /what went wrong: [A-Z-]+/.test(document.querySelector('#report-body')?.textContent ?? ''),
      undefined,
      { timeout: TIMEOUT_MS },
    )
    .then(() => true)
    .catch(() => false);
  check(gotSymptom, 'the chosen symptom is in the report');
  const reported = (await page.locator('#report-body').textContent()) ?? '';
  check(!reported.includes('1337'), 'and the roster number is NOT — that is the whole assurance');
  check(/does NOT contain/i.test(reported), 'the report says what it leaves out');
  check(reported.includes(KEY.toUpperCase()) || reported.includes(KEY), 'the assignment key IS there, so a fault can be found');

  /* ---- the appearance picker actually changes the appearance ---- */
  //
  // Asserting the attribute alone would pass on a picker wired to nothing but
  // itself, so the PAINTED page colour is read back each time. And the choice
  // is checked across a RELOAD, because a preference that does not survive one
  // is not a preference — it is a toggle that forgets.

  // Harvest the teacher page's violations before navigating away — `window`
  // does not survive a navigation, and the decoder is a different module from
  // the one the student journey exercises.
  for (const seen of await page.evaluate(() => window.__csp ?? [])) cspViolations.push(seen);

  // Back to the student app: the walk finished on the teacher page, which has
  // no ⓘ and therefore no picker.
  await page.goto(`${server.origin}/`, { waitUntil: 'load' });

  const themePage = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      mode: root.getAttribute('data-theme'),
      pref: root.getAttribute('data-theme-pref'),
      palette: root.getAttribute('data-palette'),
      page: getComputedStyle(root).getPropertyValue('--page').trim(),
      bar: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '',
    };
  });
  check(themePage.palette === 'moss', `the default colour theme is moss (${themePage.palette})`);
  check(themePage.pref === 'auto', `the default mode is auto (${themePage.pref})`);
  check(
    themePage.bar === themePage.page,
    `the status-bar colour equals the page (${themePage.bar} / ${themePage.page})`,
  );

  await page.locator('#info-open').click();
  await page.locator('#theme-palette input[value="clay"]').check();
  const afterColour = await page.evaluate(() => ({
    palette: document.documentElement.getAttribute('data-palette'),
    mode: document.documentElement.getAttribute('data-theme'),
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  }));
  check(afterColour.palette === 'clay', 'choosing Clay sets the palette attribute');
  // MODE-AWARE ON PURPOSE. The mode here is still `auto`, so it depends on what
  // the machine running this prefers — and a check hard-coded to one of the two
  // accents passes or fails on the runner's operating-system setting rather
  // than on the app. That is a flake with a plausible-looking cause, which is
  // the worst kind. The first version of this line was exactly that.
  const wantAccent = afterColour.mode === 'light' ? '#6d3410' : '#eab896';
  check(
    afterColour.accent.toLowerCase() === wantAccent,
    `and repaints the accent for ${afterColour.mode} (${afterColour.accent})`,
  );

  await page.locator('#theme-mode input[value="light"]').check();
  const afterMode = await page.evaluate(() => ({
    mode: document.documentElement.getAttribute('data-theme'),
    page: getComputedStyle(document.documentElement).getPropertyValue('--page').trim(),
    bar: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '',
  }));
  check(afterMode.mode === 'light', 'choosing Light sets the resolved mode');
  check(afterMode.page.toLowerCase() === '#c4bcab', `and repaints the page (${afterMode.page})`);
  check(afterMode.bar === afterMode.page, 'and the status bar follows it');

  await page.reload({ waitUntil: 'load' });
  const afterReload = await page.evaluate(() => ({
    mode: document.documentElement.getAttribute('data-theme'),
    palette: document.documentElement.getAttribute('data-palette'),
  }));
  check(
    afterReload.mode === 'light' && afterReload.palette === 'clay',
    `both choices survive a reload (${afterReload.mode}/${afterReload.palette})`,
  );

  /* ---- the policy did not quietly remove anything ---- */
  //
  // Collected from every page this walk visited, not just the last one — the
  // teacher decoder loads a different module and would be the easy one to miss.
  for (const seen of await page.evaluate(() => window.__csp ?? [])) cspViolations.push(seen);
  check(
    cspViolations.length === 0,
    `the Content-Security-Policy blocked nothing (${cspViolations.slice(0, 3).join(' | ') || 'clean'})`,
  );

  /* ---- nothing went wrong quietly ---- */
  check(consoleErrors.length === 0, `no console errors (${consoleErrors.slice(0, 2).join(' | ')})`);
} finally {
  if (!process.argv.includes('--keep')) await browser.close();
  await server.close();
}

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} of the journey's checks failed.\n`);
  process.exit(1);
}
console.log('The primary journey works, start to code.\n');
