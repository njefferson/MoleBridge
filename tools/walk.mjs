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
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

try {
  console.log('=== the primary journey ===\n');
  await page.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded' });

  /* ---- the welcome screen, and the build stamp ---- */
  check(await page.locator('#screen-welcome').isVisible(), 'the welcome screen is the first thing shown');
  check(await page.locator('#orientation').isVisible(), 'the orientation is on it');
  const stamp = (await page.locator('#build-stamp').textContent())?.trim() ?? '';
  check(/^\d+\.\d+\.\d+$/.test(stamp), `the build stamp reads a version at boot (${stamp})`);

  /* ---- §7e: the orientation MOVES, it is not copied ---- */
  await page.locator('#welcome-begin').click();
  check(await page.locator('#screen-setup').isVisible(), 'pressing Get started reaches the setup screen');
  check(
    (await page.locator('#orientation').count()) === 1,
    'there is exactly ONE orientation block after the move, never a copy',
  );
  check(
    (await page.locator('#info-orientation-slot #orientation').count()) === 1,
    'and it now lives behind the information control',
  );

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

  /* ---- the information surface ---- */
  await page.locator('#info-open').click();
  check(await page.locator('#info-panel').isVisible(), 'the information control opens the panel');
  const info = (await page.locator('#info-panel').textContent()) ?? '';
  for (const owed of ['Installing', 'Chromebook', 'iPad', 'ViewBoard', 'IUPAC', 'Accessibility', 'What changed', 'Diagnostic']) {
    check(info.includes(owed), `the panel covers "${owed}"`);
  }
  check(info.includes('0.1.0'), 'the patch notes name the release that is running');
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
  check(report.includes('no answers and no name'), 'and it says so');
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
