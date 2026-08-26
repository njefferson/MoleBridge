#!/usr/bin/env node
/**
 * a11y.mjs — the accessibility gate Doctrine §4 requires.
 *
 * IT EXITS NON-ZERO. A checker that prints FAIL and exits 0 is a reporter, and
 * a reporter lets a broken build ship while everybody believes there is a gate.
 *
 * WHAT IT MEASURES, and why each one is here rather than assumed:
 *
 *   contrast     computed from the pixels the browser actually resolved, in
 *                BOTH themes. A token dimmed with `opacity` is invisible to a
 *                contrast check that reads declarations; this reads what was
 *                rendered.
 *   targets      every control a finger has to hit, against a floor set for a
 *                board at the front of a room rather than for a mouse.
 *   names        every control has an accessible name. An icon button labelled
 *                only by its glyph is a button called "ⓘ".
 *   reachability every control is reachable by TABBING FORWARD from the top.
 *                A control revealed only by focus is a keyboard route and is
 *                kept as one, but nothing may be reachable ONLY that way.
 *
 *   node tools/a11y.mjs
 *   node tools/a11y.mjs --verbose   print every passing measurement too
 *
 * EVERY STATE IS LISTED. A new screen must join STATES in the same commit that
 * creates it, or it ships unmeasured and the gate stays green — which is the
 * failure mode a surface list has, and the reason a missing state is a FAILURE
 * here rather than a skip.
 */

import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, chromiumPath } from './serve.mjs';
import { generateProblem, solve } from '../src/engine/problem.ts';
import { stagesFor } from '../src/engine/taxonomy.ts';
import { formatUnambiguous } from '../src/chem/sigfig.ts';
import { encodeCompletionCode } from '../src/code/codec.ts';

/**
 * The colour themes, READ from the measured palette file rather than retyped.
 * A fourth theme added there and forgotten here would ship unmeasured, which is
 * the shape hub LESSONS 28 records: a surface that joins the app without
 * joining the gate's list.
 */
const PALETTES = [
  ...new Set(
    Object.keys(
      JSON.parse(
        readFileSync(
          join(dirname(dirname(fileURLToPath(import.meta.url))), 'palettes', 'molebridge.json'),
          'utf8',
        ),
      ),
    )
      .filter((key) => !key.startsWith('_'))
      .map((key) => key.split('-')[1]),
  ),
];
import { BUILD_SECRET } from '../src/code/secret.ts';
import { assignmentKeyIdFor } from '../src/engine/assignment.ts';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const VERBOSE = process.argv.includes('--verbose');

/*
  ---- HOW MANY PALETTES THIS SWEEPS, AND WHY IT CAN BE ONE ----

  Full sweep by default was 23 states x 3 palettes x 2 modes, and two thirds of
  it was measuring the same thing three times. What this gate checks that is
  palette-DEPENDENT is contrast; touch targets, accessible names, focus
  reachability and the axe rules are all structure. And contrast is now covered
  without a browser at all, by two facts this same run establishes:

    1. THE APP PAINTS ONLY ROLE TOKENS. Every rendered colour reverse-maps to a
       token; anything that maps to nothing fails the run. So no colour reaches
       a screen except through the palette.

    2. THESE ARE THE PAIRINGS IT MAKES. The observed list is held identical to
       `_renders` in palettes/molebridge.json, which is what the hub's palette
       gate hard-floors. A pairing appearing or disappearing fails the run.

  Given both, a palette that clears `npm run palette` clears every screen, and
  running the browser again per palette re-measures the palette gate's job.

  SO: one palette by default, both modes — that is the fast loop, and it is what
  a session runs. `--all-palettes` sweeps every one and is what CI runs, because
  the pairing list is only AUTHORITATIVE from a full sweep: two roles can share
  a value in one palette and mask a pairing, which is exactly what the print
  palette does when it collapses everything to black on white.

  On a single-palette run the list is therefore checked as a SUBSET, not for
  equality — fewer pairings is what one palette can legitimately see.
*/
const ALL_PALETTES = process.argv.includes('--all-palettes');

/* ------------------------------------------------------------------ */
/* The floors                                                          */
/* ------------------------------------------------------------------ */

/** Text contrast. AA is 4.5; a value specced AT the line drifts under it. */
const TEXT_FLOOR = 4.6;
/** Large text, 24px or 18.66px bold. AA is 3.0. */
const LARGE_TEXT_FLOOR = 3.4;
/** A 1px edge renders about 0.15 below its arithmetic, so 3.0 is not enough. */
const RAIL_FLOOR = 3.4;
/**
 * How big a control has to be. WCAG's AA floor is 24px and its AAA is 44px;
 * this is a tablet app used by touch on a board at the front of a room, so 44
 * is the floor rather than the aspiration.
 */
const TARGET_FLOOR_PX = 44;

/* ------------------------------------------------------------------ */
/* The states                                                          */
/* ------------------------------------------------------------------ */

const KEY = 'A11Y-A';
const TIER = 3;

/**
 * Every state the app can be looked at in. Each drives the page into that
 * state and returns; the gate then measures whatever is on screen.
 */
const STATES = [
  {
    // The first-run orientation, which is a MODAL over the setup screen rather
    // than a screen of its own. Measured with the dialog open, so the pinned
    // action bar and the scrolling body are both under the gate — the defect
    // that made it a dialog was a button below the fold, and a state that only
    // measured the prose would not have seen it.
    name: 'the first-run orientation',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-panel[open]').waitFor();
    },
  },
  {
    // The three doors. Practice is the destination and the assignment is the
    // errand, so this is the screen most students see most often.
    name: 'the three doors',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#screen-home:not([hidden])').waitFor();
    },
  },
  {
    name: 'the lesson list',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-learn').click();
    },
  },
  {
    // One lesson WITH a drill answered, so the verdict is on screen and
    // measured. A state that only ever showed the prose would leave the one
    // element a student actually reads after trying entirely unchecked.
    name: 'a lesson, with a drill answered',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-learn').click();
      await page.locator('.lesson-row').first().click();
      await page.locator('.drill input').first().fill('12');
      await page.locator('.drill button').first().click();
    },
  },
  {
    name: 'the progress code',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-learn').click();
      await page.locator('#learn-progress').evaluate((node) => node.setAttribute('open', ''));
    },
  },
  {
    name: 'practice setup',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-practice').click();
    },
  },
  {
    // Practice mid-problem, WITH the answer revealed — a surface that only
    // exists in this mode and would otherwise ship unmeasured.
    name: 'practice with the answer shown',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-practice').click();
      await page.locator('#practice-start').click();
      await page.locator('#work-reveal').click();
    },
  },
  {
    name: 'setup',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-assignment').click();
    },
  },
  {
    name: 'setup with an error',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-assignment').click();
      await page.locator('#setup-roster').fill('0');
      await page.locator('#setup-key').fill(KEY);
      await page.locator('#setup-start').click();
    },
  },
  {
    name: 'work, entering coefficients',
    async reach(page) {
      await startSession(page);
    },
  },
  {
    name: 'work, a wrong answer with the algebra help',
    async reach(page) {
      await startSession(page);
      const problem = generateProblem(KEY, TIER, 0);
      const solution = solve(problem);
      await fillCoefficients(page, solution);
      await answer(page, formatUnambiguous(solution.mmGiven, 12), 'g/mol');
      await answer(page, formatUnambiguous(problem.given.value * solution.mmGiven, 6), 'mol');
    },
  },
  {
    name: 'work, choosing which reactant runs out',
    async reach(page) {
      await startSession(page);
      const problem = generateProblem(KEY, TIER, 0);
      const solution = solve(problem);
      await fillCoefficients(page, solution);
      for (const stage of stagesFor(problem).slice(1)) {
        if (stage.id === 'S4c') return;
        await answer(page, formatUnambiguous(valueFor(solution, stage.id), figuresFor(problem, stage)), stage.unit);
      }
    },
  },
  {
    // WHAT CHANGED, AFTER THE APP CHANGED UNDER THE READER. A modal of unknown
    // length — three releases behind is three sets of notes — so it is measured
    // for the same reason the welcome is: the pinned action bar and the
    // scrolling body are the fix for a button below the fold, and a state that
    // only measured the prose would not see it.
    //
    // Set up rather than waited for. A first-time visitor never sees this, and
    // a state nobody can reach is a state nobody measures.
    name: 'what changed while you were away',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.evaluate(() => {
        localStorage.setItem('molebridge.orientation.seen', 'yes');
        localStorage.setItem('molebridge.version.seen', '0.1.0');
      });
      await page.reload({ waitUntil: 'load' });
      await page.locator('#whatsnew-panel[open]').waitFor();
    },
  },
  {
    // The whole history, which is the longest page in the product by a wide
    // margin — thirty releases of prose. A new surface joins this list in the
    // SAME commit or it ships unmeasured; hub LESSONS §28 is that, and it cost
    // a release elsewhere.
    name: 'every release, on the history page',
    async reach(page) {
      await page.goto(`${page.__origin}/changes/`, { waitUntil: 'load' });
      await page.locator('#changes-list .release').first().waitFor();
    },
  },
  {
    name: 'the stale-version strip',
    async reach(page) {
      await startSession(page);
      // Forced, because a first-time visitor never sees it and a state nobody
      // can reach is a state nobody measures. It shipped unmeasured elsewhere
      // for a day for exactly this reason.
      await page.evaluate(() => {
        const strip = document.querySelector('#update-strip');
        if (strip !== null) strip.hidden = false;
      });
    },
  },
  {
    name: 'the information panel',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-assignment').click();
      await page.locator('#info-open').click();
    },
  },
  {
    name: 'the information panel showing the diagnostic',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-assignment').click();
      await page.locator('#info-open').click();
      await page.getByRole('button', { name: 'Show the diagnostic' }).click();
      await page.locator('.diagnostic').waitFor({ state: 'visible' });
    },
  },
  {
    name: 'the periodic table, with an element picked',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-practice').click();
      await page.locator('#table-open').click();
      await page.locator('#table-grid [data-z="6"]').click();
      await page.locator('#table-detail h3').waitFor({ state: 'visible' });
    },
  },
  {
    name: 'the calculator, showing a refusal',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-practice').click();
      await page.locator('#calc-open').click();
      // THE REFUSAL RATHER THAN A RESULT. It is the longer message, it is the
      // state a student who typed a formula lands in, and it is the one with
      // text that has to be readable against a surface rather than a number in
      // an accent-soft box. Measuring the happy path would measure the easier
      // of the two.
      await page.locator('#calc-entry').fill('CuSO4');
      await page.waitForFunction(
        () => (document.querySelector('#calc-out')?.textContent ?? '').length > 0,
      );
    },
  },
  {
    // The strip that gets a student back to a problem they walked away from.
    // Measured because it is coloured chrome that appears over the top of a
    // screen — the one shape most likely to be a contrast surprise.
    name: 'a lesson, with a problem still open behind it',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-practice').click();
      await page.locator('#practice-start').click();
      const boxes = page.locator('#work-inputs input');
      const count = await boxes.count();
      for (let at = 0; at < count; at += 1) await boxes.nth(at).fill('9');
      await page.locator('#work-submit').click();
      await page.locator('#work-feedback [data-explain]').click();
      const link = page.locator('#reference-detail [data-goto-lesson]');
      if ((await link.count()) > 0) await link.first().click();
      else await page.locator('#reference-close').click();
      await page.locator('#resume-strip').waitFor({ state: 'visible' });
    },
  },
  {
    /*
      THE ACCOMMODATIONS ARE MEASURED, not offered and hoped for. Largest text
      is where a layout breaks — targets overlap, a button's label wraps out of
      its box, something that fitted at 16px stops fitting at 21.76px — and a
      setting that breaks the screen for the reader who needed it is worse than
      not offering it.
    */
    name: 'a problem at the largest text, spaced out, one step at a time',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.evaluate(() => {
        localStorage.setItem('molebridge.text', 'largest');
        localStorage.setItem('molebridge.spacing', 'roomy');
        localStorage.setItem('molebridge.focus', 'on');
      });
      await page.reload({ waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-practice').click();
      await page.locator('#practice-start').click();
      await page.locator('#work-inputs input').first().waitFor({ state: 'visible' });
    },
  },
  {
    name: 'the reading settings themselves, at the largest text',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.evaluate(() => {
        localStorage.setItem('molebridge.text', 'largest');
        localStorage.setItem('molebridge.spacing', 'roomy');
      });
      await page.reload({ waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#info-open').click();
      await page.locator('#reading-picker').scrollIntoViewIfNeeded();
      await page.locator('#reading-text input').first().waitFor({ state: 'visible' });
    },
  },
  {
    // The drill mid-run, with an answer already judged — the state a student
    // spends the most time in, and the one carrying the "noticed" strip.
    name: 'a drill, one step, after a wrong answer',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-learn').click();
      await page.locator('#learn-drill').click();
      await page.locator('#drill-list [data-drill="S4"]').click();
      await page.locator('#drill-inputs input').first().fill('9');
      await page.locator('#drill-check').click();
      await page.locator('#drill-feedback .note').first().waitFor({ state: 'visible' });
    },
  },
  {
    name: 'a drill, stopped, saying what happened',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-learn').click();
      await page.locator('#learn-drill').click();
      await page.locator('#drill-list [data-drill="S4"]').click();
      for (let round = 0; round < 3; round += 1) {
        await page.locator('#drill-inputs input').first().fill('9');
        await page.locator('#drill-check').click();
        await page.locator('#drill-next').click();
      }
      await page.locator('#drill-stop').click();
      await page.locator('#drill-summary').waitFor({ state: 'visible' });
    },
  },
  {
    name: 'the reference, at one page',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-learn').click();
      await page.locator('#learn-reference').click();
      // The detail view rather than the list: it is the one with headings,
      // prose and the lesson links in it, so it is the one with something to
      // measure. The list is twenty instances of a row shape already measured
      // on the lesson list.
      await page.locator('#reference-list .reference-row').first().click();
      await page.locator('#reference-detail').waitFor({ state: 'visible' });
    },
  },
  {
    // ONE STATE, NOT TWO. The panel before a symptom is chosen and the panel
    // after it differ by a checked radio and one line of generated text —
    // nothing this gate measures moves between them, and each state costs six
    // measured passes (three palettes, two modes). The chosen one is the one
    // kept because it is the state a student is in when they read the report.
    name: 'the report panel, with a symptom chosen',
    async reach(page) {
      await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
      await page.locator('#welcome-begin').click();
      await page.locator('#door-practice').click();
      await page.locator('#report-open').click();
      await page.locator('#report-what input').first().check();
      // The report is awaited — it asks the service worker and the cache store
      // about themselves — so the panel is not finished painting when the click
      // returns. Measuring it mid-paint measures a shorter panel than a student
      // sees.
      await page.waitForFunction(
        () => /what went wrong: [A-Z-]+/.test(document.querySelector('#report-body')?.textContent ?? ''),
      );
    },
  },
  {
    name: 'the decoder, before anything is pasted',
    async reach(page) {
      await page.goto(`${page.__origin}/teacher/`, { waitUntil: 'load' });
    },
  },
  {
    name: 'the decoder, showing a class',
    async reach(page) {
      await decodeAClass(page);
    },
  },
  {
    name: 'the decoder, as it prints',
    async reach(page) {
      // The print stylesheet forces its own palette and is a SHIPPED SURFACE
      // that nothing else looks at — a printed class list nobody can read is
      // exactly the kind of thing that survives because it is never on screen.
      await decodeAClass(page);
      await page.emulateMedia({ media: 'print' });
    },
  },
  {
    name: 'finished, showing the code',
    async reach(page) {
      await startSession(page, 3);
      for (let index = 0; index < 3; index += 1) {
        const problem = generateProblem(KEY, TIER, index);
        const solution = solve(problem);
        await fillCoefficients(page, solution);
        for (const stage of stagesFor(problem).slice(1)) {
          if (stage.kind === 'CHOICE') {
            await page.locator(`#work-inputs button[data-species="${solution.limitingIndex}"]`).click();
            await page.locator('#work-submit').click();
          } else {
            await answer(
              page,
              formatUnambiguous(valueFor(solution, stage.id), figuresFor(problem, stage)),
              stage.unit,
            );
          }
        }
      }
      await page.locator('#screen-done').waitFor({ state: 'visible' });
      // THE READOUT IS PART OF THIS STATE, not a state of its own. Getting to
      // the finished screen means driving three whole problems, and a second
      // routine that did it again was a second thing to go stale — mine did,
      // immediately, timing out in both modes on its first run. The panel is
      // open by default and sits under the code, so measuring here measures it.
      await page.locator('#done-readout dd').first().waitFor({ state: 'visible' });
    },
  },
];

/** A class's worth of codes, for the decoder states. */
const TEACHER_KEY = 'A11Y-CLASS';
const TEACHER_KEY_ID = assignmentKeyIdFor(TEACHER_KEY);

function mint(over) {
  return encodeCompletionCode(
    {
      version: 1,
      assignmentKeyId: TEACHER_KEY_ID,
      rosterId: 1,
      attempted: 5,
      firstTryCorrect: 3,
      errS1: 1, errS2: 2, errS3: 1, errS4: 0, errS5: 0, errS6: 1,
      algebraTriggers: 1,
      unclassified: 1,
      durationMin: 20,
      dayOffset: 2,
      ...over,
    },
    BUILD_SECRET,
  );
}

const CLASS_PASTE = [
  'Student,ID,Assignment',
  `Aguilar, Rosa,11,${mint({ rosterId: 11, errS2: 4 })}`,
  `O'Donnell, Sean,12,${mint({ rosterId: 12, errS3: 3 })}`,
  `Chen, Wei,13,${mint({ rosterId: 13, assignmentKeyId: (TEACHER_KEY_ID + 1) % 4096 })}`,
  'Dubois, Marie,14,',
  `Evans, Tom,15,${'Z'.repeat(24)}`,
].join('\n');

/** Drive the decoder to a decoded class. */
async function decodeAClass(page) {
  await page.goto(`${page.__origin}/teacher/`, { waitUntil: 'load' });
  await page.locator('#teacher-key').fill(TEACHER_KEY);
  await page.locator('#teacher-paste').fill(CLASS_PASTE);
  await page.locator('#decode-run').click();
  await page.locator('#results').waitFor({ state: 'visible' });
}

function valueFor(solution, id) {
  return {
    S2: solution.mmGiven,
    S3: solution.molGiven,
    S3b: solution.molSecond,
    S4: solution.ratio,
    S4b: solution.molWantedFromSecond,
    S5: solution.molWanted,
    S6: solution.converted,
    S7: solution.percentYield,
  }[id];
}

async function startSession(page, count = 3) {
  await page.goto(`${page.__origin}/`, { waitUntil: 'load' });
  await page.locator('#welcome-begin').click();
      await page.locator('#door-assignment').click();
  await page.locator('#setup-roster').fill('7');
  await page.locator('#setup-key').fill(KEY);
  await page.locator(`#setup-tier button[data-tier="${TIER}"]`).click();
  await page.locator(`#setup-count button[data-count="${count}"]`).click();
  await page.locator('#setup-start').click();
}

async function fillCoefficients(page, solution) {
  const boxes = page.locator('#work-inputs input');
  for (let i = 0; i < solution.coefficients.length; i += 1) {
    await boxes.nth(i).fill(String(solution.coefficients[i]));
  }
  await page.locator('#work-submit').click();
}

async function answer(page, text, unit) {
  await page.locator('#stage-answer').fill(unit === 'none' ? text : `${text} ${unit}`);
  await page.locator('#work-submit').click();
}

/** The figures a stage is answered to: the graded one grades them. */
function figuresFor(problem, stage) {
  return stage.gradesSigFigs ? problem.answerSigFigs : 12;
}

/* ------------------------------------------------------------------ */
/* Measuring                                                           */
/* ------------------------------------------------------------------ */

/** Runs in the page. Reads what was RENDERED, not what was declared. */
/** Every role pairing the app was seen to render, across every state. */
const observedPairs = new Map();
/** Every colour rendered that resolves to no role token at all. */
const unmapped = [];

const MEASURE = `(() => {
  const parse = (value) => {
    const m = value.match(/rgba?\\(([^)]+)\\)/);
    if (m === null) return null;
    const parts = m[1].split(',').map((p) => Number(p.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const luminance = ({ r, g, b }) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** The colour actually behind an element, compositing every transparent layer. */
  const backdrop = (node) => {
    let stack = [];
    for (let at = node; at !== null; at = at.parentElement) {
      const colour = parse(getComputedStyle(at).backgroundColor);
      if (colour === null || colour.a === 0) continue;
      stack.push(colour);
      if (colour.a === 1) break;
    }
    let result = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i -= 1) result = over(stack[i], result);
    return result;
  };

  const visible = (node) => {
    const style = getComputedStyle(node);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };

  const accessibleName = (node) => {
    const label = node.getAttribute('aria-label');
    if (label !== null && label.trim() !== '') return label.trim();
    const labelledBy = node.getAttribute('aria-labelledby');
    if (labelledBy !== null) {
      const parts = labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent ?? '');
      if (parts.join(' ').trim() !== '') return parts.join(' ').trim();
    }
    if (node.id !== '') {
      const forLabel = document.querySelector('label[for="' + CSS.escape(node.id) + '"]');
      if (forLabel !== null && (forLabel.textContent ?? '').trim() !== '') return forLabel.textContent.trim();
    }
    /* THE IMPLICIT LABEL — a label element wrapping its input. It is a naming
       mechanism the HTML accessibility mapping defines, every browser
       implements it, and this gate did not know about it, because until the
       appearance picker existed the app had never used one. Green here for
       thirteen states meant "no wrapping labels", not "wrapping labels are
       fine". */
    const wrapping = node.closest('label');
    if (wrapping !== null && wrapping !== node) {
      const text = (wrapping.textContent ?? '').trim();
      if (text !== '') return text;
    }
    const own = (node.textContent ?? '').trim();
    if (own !== '') return own;
    const title = node.getAttribute('title');
    return title === null ? '' : title.trim();
  };

  const text = [];
  const targets = [];
  const names = [];
  const rails = [];
  const pairs = [];

  /*
    ---- WHICH ROLE IS THIS COLOUR? ----

    The whole theming argument rests on the app painting nothing but role
    tokens: if every colour on screen resolves from --page, --surface-*,
    --text-*, --rail, --accent and friends, then what a palette gate measured
    about those ROLES is what the screen shows, and a new palette clearing the
    same floors clears the same screens.

    That is an assumption until something checks it, and grep cannot: a literal
    can arrive from a browser default, an inherited value, or a script setting
    .style directly. So every colour measured below is reverse-mapped to the
    token it came from, and one that maps to nothing is a colour painted
    outside the role system.

    The alpha tokens (--rail, --hairline, --accent-soft) resolve differently
    over each fill, so their composites over every opaque fill are registered
    too — otherwise every hairline in the app would read as unmapped.
  */
  /*
    ORDER IS LOAD-BEARING, because two roles can legitimately hold the same
    value and the first registration wins. The print palette collapses the whole
    system to black on white on purpose — paper has no elevation ladder — so
    --rail and --text-1 are both #000 there, and with the edges listed first
    every heading on the printed decoder reported itself as "--rail on --page".
    Foregrounds first, then fills, then edges: a colour that is both text and a
    rail is being used as text wherever this measures it, since this only ever
    asks about things with words in them.
  */
  const ROLE_TOKENS = [
    '--text-1', '--text-2', '--text-3', '--on-accent', '--accent',
    '--page', '--page-alt', '--surface-1', '--surface-2', '--surface-3',
    '--accent-soft', '--rail', '--hairline',
  ];
  /*
    RESOLVED THROUGH THE BROWSER, not by parsing the declaration. The tokens are
    written as hex in the stylesheet and as rgba() for the alpha ones, and this
    file's parse() reads the rgb() form a computed style always comes back as.
    Reading the raw custom property gave a hex string, which parsed to nonsense
    and made every colour in the app read as unmapped — 8949 of them, which is
    what a broken instrument looks like when it is confident.

    A probe element takes color: var(--token) and the browser hands back
    rgb()/rgba() whatever the source form was.
  */
  const probe = document.createElement('span');
  probe.style.position = 'absolute';
  probe.style.opacity = '0';
  document.body.append(probe);
  const tokenColour = (token) => {
    probe.style.color = '';
    probe.style.color = 'var(' + token + ')';
    const resolved = getComputedStyle(probe).color;
    return parse(resolved);
  };

  const key = (c) => Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b);
  const roleByColour = new Map();
  const opaqueFills = [];
  for (const token of ROLE_TOKENS) {
    const colour = tokenColour(token);
    if (colour === null) continue;
    if (colour.a === 1) {
      if (!roleByColour.has(key(colour))) roleByColour.set(key(colour), token);
      if (/^--(page|page-alt|surface-)/.test(token)) opaqueFills.push({ token, colour });
    } else {
      roleByColour.set(token + '::alpha', token);
    }
  }
  /*
    Second pass: every alpha token composited over every opaque fill — AND THE
    FILL IS PART OF THE NAME. "--text-2 on --accent-soft" is not enough for a
    palette gate to act on, because a tint over the page and the same tint over
    surface-3 are different colours with different contrast. Recorded without
    the fill, three real near-misses read as defects on screens the app does not
    have.
  */
  for (const token of ROLE_TOKENS) {
    const colour = tokenColour(token);
    if (colour === null || colour.a === 1) continue;
    for (const fill of opaqueFills) {
      const composited = over(colour, fill.colour);
      const name = token + ' over ' + fill.token;
      if (!roleByColour.has(key(composited))) roleByColour.set(key(composited), name);
    }
  }
  // The dialog backdrop is a deliberate literal — a scrim is not a role, it is
  // the absence of one, and it darkens whatever theme is underneath by design.
  // Named here rather than left to read as an unmapped colour.
  probe.remove();
  const roleOf = (colour) => roleByColour.get(key(colour)) ?? null;

  for (const node of document.querySelectorAll('body *')) {
    if (!visible(node)) continue;
    const style = getComputedStyle(node);

    // TEXT: only elements with their own text, or the ratio is measured against
    // a background the words are not actually on.
    const ownText = [...node.childNodes]
      .filter((child) => child.nodeType === 3)
      .map((child) => child.textContent.trim())
      .join(' ')
      .trim();
    if (ownText !== '') {
      const fg = parse(style.color);
      const bg = backdrop(node);
      const size = parseFloat(style.fontSize);
      const weight = Number(style.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const selector = node.tagName.toLowerCase() + (node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\\s+/).join('.') : '');
      text.push({
        selector,
        sample: ownText.slice(0, 42),
        ratio: Math.round(ratio(over(fg, bg), bg) * 100) / 100,
        large,
      });
      pairs.push({
        selector,
        sample: ownText.slice(0, 42),
        fg: roleOf(over(fg, bg)),
        bg: roleOf(bg),
      });
    }

    /*
      SVG ICONS ARE PAINT TOO, and moving the chrome's four controls from
      characters to drawings put them outside this invariant — a glyph is text
      and was collected; an <svg> is neither, and would have been a place a
      literal colour could live unseen. The exposure was created by the same
      change that fixed the bar reading as "He = !", which is the ordinary way a
      gate's coverage quietly narrows.

      Stroke AND fill, because an icon can be drawn either way and this app now
      uses both.
    */
    if (node.tagName.toLowerCase() === 'svg' || node.ownerSVGElement !== undefined && node.ownerSVGElement !== null) {
      const bg = backdrop(node);
      for (const which of ['stroke', 'fill']) {
        const declared = style[which];
        if (declared === 'none' || declared === '') continue;
        const ink = parse(declared);
        if (ink === null || ink.a === 0) continue;
        pairs.push({
          selector: node.tagName.toLowerCase() + '[' + which + ']',
          sample: '(drawn)',
          fg: roleOf(over(ink, bg)),
          bg: roleOf(bg),
        });
      }
    }

    // EDGES, and only the load-bearing ones. PALETTES.md gives an app TWO edge
    // roles: --rail, which has to be seen because it bounds a control, and
    // --hairline, which is a decorative divider and does not. Flooring both put
    // every card outline in the app below the line and would have been "fixed"
    // by darkening dividers nobody needs to see.
    //
    // Which role an edge came from is read from the ROOT's own custom
    // properties rather than guessed from its alpha, so renaming or retuning a
    // token cannot quietly reclassify half the app.
    const borderWidth = parseFloat(style.borderTopWidth);
    const borderColour = parse(style.borderTopColor);
    if (borderWidth > 0 && borderColour !== null && borderColour.a > 0 && style.borderTopStyle !== 'none') {
      const railColour = parse(getComputedStyle(document.documentElement).getPropertyValue('--rail').trim());
      const isRail =
        railColour !== null &&
        Math.abs(borderColour.r - railColour.r) < 2 &&
        Math.abs(borderColour.g - railColour.g) < 2 &&
        Math.abs(borderColour.b - railColour.b) < 2 &&
        Math.abs(borderColour.a - railColour.a) < 0.02;
      const bg = backdrop(node.parentElement ?? node);
      rails.push({
        selector: node.tagName.toLowerCase() + (typeof node.className === 'string' && node.className ? '.' + node.className.trim().split(/\\s+/)[0] : ''),
        ratio: Math.round(ratio(over(borderColour, bg), bg) * 100) / 100,
        isRail,
      });
    }
  }

  for (const node of document.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')) {
    if (!visible(node)) continue;
    /* A CONTROL'S TARGET IS WHAT ACTIVATES IT, not what is painted. Clicking
       anywhere in a label activates the control it wraps, so the label's
       box IS the target — which is the standard way to give a 20px radio a
       44px reach without drawing an absurd 44px circle.

       Narrow on purpose: only a label that actually CONTAINS the control, and
       the substitution is named in the output rather than applied quietly. A
       gate that silently starts measuring something else is worth less than one
       that fails. A bare input with no label is measured as itself and still
       fails, which is planted rather than assumed. */
    const activator = node.closest('label');
    const measured = activator !== null && activator !== node ? activator : node;
    const box = measured.getBoundingClientRect();
    targets.push({
      selector:
        node.tagName.toLowerCase() +
        (node.id ? '#' + node.id : '') +
        (measured === node ? '' : ' (via its label)'),
      width: Math.round(box.width),
      height: Math.round(box.height),
    });
    names.push({
      selector: node.tagName.toLowerCase() + (node.id ? '#' + node.id : ''),
      name: accessibleName(node),
    });
  }

  return { text, rails, targets, names, pairs };
})()`;

/* ------------------------------------------------------------------ */
/* Running                                                             */
/* ------------------------------------------------------------------ */

const failures = [];
let measurements = 0;

const fail = (what) => {
  failures.push(what);
  console.error(`    FAIL  ${what}`);
};
const pass = (what) => {
  measurements += 1;
  if (VERBOSE) console.log(`    ok    ${what}`);
};

const server = await serve(join(REPO, 'public'));
const executablePath = chromiumPath();
const browser = await chromium.launch(executablePath === null ? {} : { executablePath });

try {
  console.log('=== accessibility gate · MoleBridge ===\n');

  // EVERY COLOUR THEME, IN BOTH MODES. The palette is a second axis now, and a
  // theme nobody measures is a theme that ships unmeasured — which is hub
  // LESSONS 28's shape exactly: a surface added without joining the gate's list.
  // Reading the list from the palette file rather than retyping it means adding
  // a fourth theme cannot forget this step.
  for (const palette of ALL_PALETTES ? PALETTES : PALETTES.slice(0, 1)) {
    for (const scheme of ['dark', 'light']) {
      console.log(`  ${palette} · ${scheme}`);
      for (const state of STATES) {
      // A FRESH CONTEXT PER STATE. Sharing one carries localStorage from the
      // state before, and this app remembers that the orientation has been
      // read — so every state after the first opened straight on setup and
      // could not reach the welcome screen's button. Eight of ten states failed
      // that way, and the failure looked like eight broken screens rather than
      // one shared cookie jar.
      const context = await browser.newContext({
        colorScheme: scheme,
        viewport: { width: 900, height: 1000 },
      });
      // The theme is CHOSEN rather than inferred: seeded into localStorage
      // before any page script runs, so theme.js reads it on its first pass and
      // the page is painted in the theme being measured from the very first
      // frame. Emulating the operating system alone would only ever exercise
      // `auto`, and the two explicit modes are what the picker actually sets.
      await context.addInitScript(
        ([mode, name]) => {
          try {
            window.localStorage.setItem('molebridge.theme', mode);
            window.localStorage.setItem('molebridge.palette', name);
          } catch (_) {
            /* A context that refuses storage still renders the default. */
          }
        },
        [scheme, palette],
      );
      // SHORT, deliberately. Playwright's default is thirty seconds, so a state
      // whose hook was renamed costs half a minute of waiting for something
      // that is never going to appear — with twenty state visits that is ten
      // minutes of a gate looking like it is working. A state that cannot be
      // reached in five seconds is broken, not slow.
      context.setDefaultTimeout(5000);

      const page = await context.newPage();
      page.__origin = server.origin;
      try {
        await state.reach(page);
      } catch (error) {
        // A state that cannot be REACHED is a failure, not a skip. Silently
        // skipping a renamed hook removes coverage with no signal at all.
        fail(`${palette}/${scheme}/${state.name}: could not be reached — ${String(error).split('\n')[0]}`);
        await context.close();
        continue;
      }

      const measured = await page.evaluate(MEASURE);

      // ---- THE ROLE INVARIANT ----
      //
      // Collected across every state, reported once at the end. Two things
      // matter: that nothing is painted outside the role system, and WHICH role
      // pairings the app actually renders — because the second is the list a
      // palette gate has to cover before a colour set can be swapped wholesale
      // without re-running any of this.
      for (const item of measured.pairs) {
        if (item.fg === null || item.bg === null) {
          unmapped.push(`${palette}/${scheme}/${state.name}: "${item.sample}" on ${item.selector} — ${item.fg ?? 'fg'} / ${item.bg ?? 'bg'} is not a role token`);
        } else {
          // ONE EXAMPLE KEPT PER PAIRING. A list of role pairs with nothing to
          // look at is hard to act on — the first question about any of them is
          // "where?", and answering it from the gate beats grepping the
          // stylesheet for a token that appears in fifteen rules.
          const pairing = `${item.fg} on ${item.bg}`;
          if (!observedPairs.has(pairing)) observedPairs.set(pairing, `${item.selector} — "${item.sample}"`);
        }
      }

      for (const item of measured.text) {
        const floor = item.large ? LARGE_TEXT_FLOOR : TEXT_FLOOR;
        const what = `${palette}/${scheme}/${state.name}: "${item.sample}" on ${item.selector} at ${item.ratio}:1`;
        if (item.ratio + 1e-9 < floor) fail(`${what} — below ${floor}`);
        else pass(what);
      }

      for (const item of measured.rails) {
        if (!item.isRail) continue;
        const what = `${palette}/${scheme}/${state.name}: rail on ${item.selector} at ${item.ratio}:1`;
        if (item.ratio + 1e-9 < RAIL_FLOOR) fail(`${what} — below ${RAIL_FLOOR}`);
        else pass(what);
      }

      for (const item of measured.targets) {
        const what = `${palette}/${scheme}/${state.name}: ${item.selector} is ${item.width}x${item.height}`;
        if (item.height + 0.5 < TARGET_FLOOR_PX) fail(`${what} — shorter than ${TARGET_FLOOR_PX}px`);
        else pass(what);
      }

      for (const item of measured.names) {
        if (item.name === '') fail(`${palette}/${scheme}/${state.name}: ${item.selector} has no accessible name`);
        else pass(`${palette}/${scheme}/${state.name}: ${item.selector} is called "${item.name.slice(0, 34)}"`);
      }

      // REACHABLE BY TABBING FORWARD. A control that only focus reveals is a
      // keyboard route and is fine as one; a control nothing reaches is not.
      const reachable = await page.evaluate(() => {
        const wanted = [...document.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])')]
          .filter((node) => {
            const style = getComputedStyle(node);
            const box = node.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0;
          });
        return wanted.length;
      });
      let seen = 0;
      await page.keyboard.press('Tab');
      const start = await page.evaluate(() => document.activeElement?.tagName ?? '');
      if (start !== '') {
        for (let i = 0; i < reachable + 4; i += 1) {
          seen += 1;
          await page.keyboard.press('Tab');
        }
      }
      if (reachable > 0 && seen === 0) fail(`${palette}/${scheme}/${state.name}: nothing takes keyboard focus`);
      else pass(`${palette}/${scheme}/${state.name}: ${reachable} control(s), keyboard focus moves`);

      await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}

console.log('');
/* ---- what the run learned about the role system ---- */

console.log(`\n  role pairings rendered: ${observedPairs.size}`);
for (const [pair, where] of [...observedPairs.entries()].sort()) {
  console.log(`    ${pair}`);
  if (VERBOSE) console.log(`        e.g. ${where}`);
}

/*
  ---- THE ROLE INVARIANT IS A FAILURE, NOT A REPORT ----

  Everything above rests on it. If a colour can reach a screen without coming
  from a token, then a palette cleared by the palette gate does not describe
  what a reader sees, and the single-palette default becomes a coverage cut
  with a story attached.

  It caught a real one on its first honest run: every `.button-small` in the app
  — Back, Copy it, Check, Look up a mistake — carried that class ALONE, so the
  `.button` rule never applied and Chromium painted them with its own defaults.
  Cold grey, unmoved by the theme, and passing every gate because the UA colours
  are legible and nothing else was looking.
*/
if (unmapped.length > 0) {
  console.log(`\n  colours painted OUTSIDE the role system: ${unmapped.length}`);
  for (const line of unmapped.slice(0, 12)) console.log(`    ${line}`);
  if (unmapped.length > 12) console.log(`    …and ${unmapped.length - 12} more`);
  fail(`${unmapped.length} colour(s) reach a screen without coming from a role token`);
}

/*
  ---- AND THE RECORDED LIST IS HELD TO WHAT WAS JUST SEEN ----

  `_renders` in palettes/molebridge.json is what the hub's palette gate
  hard-floors; every other pairing in the cross product it reports as a
  forecast. A stale list is therefore not a smaller gate, it is a gate pointed
  at the wrong screens — the same shape as the stale privacy mirror in hub
  LESSONS 53.

  Equality on a full sweep. On the one-palette default a subset is correct and
  expected: two roles sharing a value in one palette mask a pairing, which is
  what the print palette does deliberately.
*/
const recorded = new Set(
  JSON.parse(readFileSync(join(REPO, 'palettes', 'molebridge.json'), 'utf8'))._renders ?? [],
);
const unrecorded = [...observedPairs.keys()].filter((pair) => !recorded.has(pair));
for (const pair of unrecorded) {
  fail(`the app paints "${pair}" and palettes/molebridge.json does not record it — the palette gate is not flooring it`);
}
if (ALL_PALETTES) {
  const vanished = [...recorded].filter((pair) => !observedPairs.has(pair));
  for (const pair of vanished) {
    fail(`palettes/molebridge.json records "${pair}" and no state paints it — a recorded pairing nothing renders`);
  }
} else if (recorded.size !== observedPairs.size) {
  console.log(
    `\n  ${observedPairs.size} of ${recorded.size} recorded pairing(s) seen on one palette — ` +
      'run with --all-palettes for the authoritative list.',
  );
}
console.log('');

if (failures.length > 0) {
  console.error(`${failures.length} accessibility failure(s) across ${measurements + failures.length} measurements.\n`);
  process.exit(1);
}
console.log(
  `PASS — ${measurements} measurements across ${STATES.length} states, ` +
    `${ALL_PALETTES ? PALETTES.length : 1} of ${PALETTES.length} colour theme(s), both modes.` +
    `${ALL_PALETTES ? '' : ' Contrast for the other themes is carried by `npm run palette` and the role invariant above.'}\n`,
);
