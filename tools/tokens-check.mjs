#!/usr/bin/env node
/**
 * tokens-check.mjs — the palette is declared in three files and they must agree.
 *
 *   node tools/tokens-check.mjs
 *
 * ## Why this exists
 *
 * PALETTES.md §6 is blunt about it: if a palette is declared in N places,
 * adding F families makes it N x F x 2 blocks that must never drift, and this
 * family has already been bitten repeatedly by must-change-together token
 * definitions. It says to collapse to one source before adding themes.
 *
 * Here that is nearly done and honestly cannot be finished:
 *
 *   palettes/molebridge.json   what the hub's palette gate measures
 *   public/styles.css          what the browser paints
 *   public/theme.js            which names can be selected at all
 *
 * The JSON is the source the FLOORS are checked against and the CSS is the
 * source the reader actually sees, and no build step joins them because this
 * repository deliberately has no CSS build. So the join is this gate: every
 * value in the stylesheet must equal the value the hub measured, and every
 * theme offered in the picker must exist in both.
 *
 * It also holds the ONE unavoidable duplicate. The light tokens appear twice —
 * once under `[data-theme="light"]`, and once under a `prefers-color-scheme`
 * media block for a reader with JavaScript off, where `data-theme` is never
 * set. Those two must be identical, and nothing but this notices if they stop
 * being.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const CSS = readFileSync(join(REPO, 'public', 'styles.css'), 'utf8');
const JS = readFileSync(join(REPO, 'public', 'theme.js'), 'utf8');
const PALETTES = JSON.parse(readFileSync(join(REPO, 'palettes', 'molebridge.json'), 'utf8'));

let failures = 0;
const fail = (message) => {
  console.log(`  FAIL  ${message}`);
  failures += 1;
};
const ok = (message) => console.log(`  ok    ${message}`);

/**
 * Colour written two ways is still one colour. The JSON says
 * `rgba(255,255,255,.62)` and the stylesheet says `rgba(255, 255, 255, 0.62)`;
 * comparing those as strings would fail on whitespace and teach everyone to
 * ignore this gate.
 */
function normalise(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/([(,])\./g, '$10.');
}

/** Every `--token: value` inside one brace-balanced block, by selector. */
function tokensOf(selector) {
  const at = CSS.indexOf(selector);
  if (at < 0) return null;
  let depth = 0;
  let start = -1;
  let i = at;
  for (; i < CSS.length; i += 1) {
    if (CSS[i] === '{') {
      if (depth === 0) start = i + 1;
      depth += 1;
    } else if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (start < 0) return null;
  const body = CSS.slice(start, i);
  const out = new Map();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out.set(m[1], normalise(m[2]));
  }
  return out;
}

console.log('\n=== palette tokens · MoleBridge ===\n');

/* ---- 1. the two light blocks are the same block ---- */

const attribute = tokensOf(':root[data-theme="light"]');
const fallback = tokensOf(':root:not([data-theme])');
if (attribute === null || fallback === null) {
  fail('one of the two light-mode blocks is missing from styles.css');
} else {
  const names = new Set([...attribute.keys(), ...fallback.keys()]);
  const differing = [...names].filter((n) => attribute.get(n) !== fallback.get(n));
  if (differing.length > 0) {
    fail(
      `the no-JavaScript light block has drifted from the real one: ${differing.join(', ')}`,
    );
  } else {
    ok(`both light-mode blocks declare the same ${attribute.size} tokens`);
  }
}

/* ---- 2. the stylesheet says what the hub measured ---- */

const dark = tokensOf(':root {');
const ROLES = [
  ['--page', (p) => p.page],
  ['--page-alt', (p) => p.pageAlt],
  ['--surface-1', (p) => p.surfaces[0]],
  ['--surface-2', (p) => p.surfaces[1]],
  ['--surface-3', (p) => p.surfaces[2]],
  ['--rail', (p) => p.rail],
  ['--hairline', (p) => p.hairline],
  ['--text-1', (p) => p.text[0]],
  ['--text-2', (p) => p.text[1]],
  ['--text-3', (p) => p.text[2]],
];

const named = Object.keys(PALETTES).filter((k) => !k.startsWith('_'));
const themes = [...new Set(named.map((k) => k.split('-')[1]))];

for (const [mode, block, suffix] of [
  ['dark', dark, 'night'],
  ['light', attribute, 'day'],
]) {
  if (block === null) continue;
  /* The neutrals are identical in every theme by design, so any one of them is
     the reference — and if that ever stops being true, the loop below finds it
     because every theme is checked against the same block. */
  for (const theme of themes) {
    const palette = PALETTES[`molebridge-${theme}-${suffix}`];
    if (palette === undefined) {
      fail(`palettes/molebridge.json has no molebridge-${theme}-${suffix}`);
      continue;
    }
    for (const [token, pick] of ROLES) {
      const want = normalise(pick(palette));
      const have = block.get(token);
      if (have !== want) {
        fail(`${mode}: ${token} is ${have} in styles.css, ${want} in the measured palette`);
      }
    }
  }
}
if (failures === 0) ok(`every neutral token matches the palette the hub gate measured`);

/* ---- 3. every accent offered exists, measured, in both modes ---- */

const before = failures;
for (const theme of themes) {
  for (const [suffix, selector] of [
    ['night', `[data-palette="${theme}"] {`],
    ['day', `[data-palette="${theme}"][data-theme="light"]`],
  ]) {
    const block = tokensOf(selector);
    const palette = PALETTES[`molebridge-${theme}-${suffix}`];
    if (block === null) {
      fail(`styles.css has no ${suffix} accent block for "${theme}"`);
      continue;
    }
    if (palette === undefined) continue;
    const want = normalise(palette.accents.primary);
    if (block.get('--accent') !== want) {
      fail(`${theme} ${suffix}: --accent is ${block.get('--accent')}, measured as ${want}`);
    }
    if (!block.has('--on-accent')) {
      fail(`${theme} ${suffix}: no --on-accent, so button text falls back to a token meant for something else`);
    }
  }
}
if (failures === before) ok(`all ${themes.length} accents match, in both modes, with their own --on-accent`);

/* ---- 4. the picker cannot offer a theme that does not exist ---- */

const listed = JS.match(/var PALETTES = \[([^\]]+)\]/);
if (listed === null) {
  fail('could not read the PALETTES list out of public/theme.js');
} else {
  const offered = [...listed[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  const missing = offered.filter((name) => !themes.includes(name));
  const unoffered = themes.filter((name) => !offered.includes(name));
  if (missing.length > 0) fail(`theme.js offers ${missing.join(', ')}, which nothing has measured`);
  else if (unoffered.length > 0) fail(`${unoffered.join(', ')} is measured and styled but not offered`);
  else ok(`theme.js offers exactly the ${offered.length} themes that exist: ${offered.join(', ')}`);
}

const defaulted = JS.match(/var DEFAULT_PALETTE = '([a-z]+)'/);
if (defaulted === null) fail('could not read DEFAULT_PALETTE out of public/theme.js');
else if (!themes.includes(defaulted[1])) fail(`the default theme "${defaulted[1]}" does not exist`);
else ok(`the default theme is "${defaulted[1]}"`);

if (failures > 0) {
  console.error(`\n${failures} disagreement(s) between the three files that declare the palette.\n`);
  process.exit(1);
}
console.log('\nThe stylesheet, the measured palettes and the picker all say the same thing.\n');
