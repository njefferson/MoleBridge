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
