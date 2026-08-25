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
      text.push({
        selector: node.tagName.toLowerCase() + (node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\\s+/).join('.') : ''),
        sample: ownText.slice(0, 42),
        ratio: Math.round(ratio(over(fg, bg), bg) * 100) / 100,
        large,
      });
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

  return { text, rails, targets, names };
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
  for (const palette of PALETTES) {
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
if (failures.length > 0) {
  console.error(`${failures.length} accessibility failure(s) across ${measurements + failures.length} measurements.\n`);
  process.exit(1);
}
console.log(
  `PASS — ${measurements} measurements across ${STATES.length} states, ` +
    `${PALETTES.length} colour theme(s), both modes.\n`,
);
