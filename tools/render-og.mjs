#!/usr/bin/env node
/**
 * render-og.mjs — the social preview card, drawn by a real browser and MEASURED.
 *
 *   node tools/render-og.mjs        writes og.png (1280x640, what GitHub asks for)
 *
 * ## Why this is not just a screenshot
 *
 * A social card is looked at rather than read, which is exactly why nobody
 * notices it failing. It is also the one image of this app most people will
 * ever see, and it is rendered at thumbnail size in a link preview before it is
 * ever seen full size. So the contrast of every run of text on it is measured
 * here and the render FAILS below the floor, rather than being judged by
 * somebody looking at it on a good monitor.
 *
 * ## The one place the measurement is a BOUND rather than a reading
 *
 * The card's background is a gradient, and `getComputedStyle().backgroundColor`
 * on an element painted with a gradient reports transparent — a compositing
 * walk like the accessibility gate's would climb straight past it and end at
 * white, which is not what is there and would pass everything.
 *
 * So when the walk reaches <body> without meeting an opaque colour, the
 * WORST-CASE page colour is substituted: the lightest the gradient can reach,
 * with the accent tint composited over it at full strength. Every piece of text
 * on this card is light on dark, so the lightest possible backdrop is the worst
 * case, and a bound that is wrong in the safe direction is worth more than a
 * reading that is wrong in the other one.
 *
 * An element with its own opaque background — the chips — is measured against
 * that background as normal, because an opaque layer is what the gradient is
 * behind.
 */

import { chromium } from 'playwright-core';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromiumPath } from './serve.mjs';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const CARD = join(REPO, 'tools', 'og-card.html');
const OUT = join(REPO, 'og.png');

/** What GitHub renders a social preview at. */
const WIDTH = 1280;
const HEIGHT = 640;

/**
 * Two pixels per CSS pixel. The card is shown at perhaps 500px wide in a link
 * preview and at full size on the repository page, so it is rendered above the
 * larger of the two rather than being scaled up into softness.
 */
const SCALE = 2;

/** GitHub refuses a social preview over 1 MB. */
const MAX_BYTES = 1024 * 1024;

/** Text contrast. AA is 4.5; a value specced AT the line drifts under it. */
const TEXT_FLOOR = 4.6;

/**
 * The lightest the page can be: --page-alt at the top of the linear gradient,
 * with the accent radial at its full 0.14 over it. Both are read from the card
 * rather than retyped, so retuning a token cannot leave this bound stale.
 */
const PAGE_ALT = /--page-alt:\s*(#[0-9a-f]{6})/i;
const ACCENT_TINT = /radial-gradient\([^)]*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/i;

const card = readFileSync(CARD, 'utf8');
const pageAlt = card.match(PAGE_ALT);
const tint = card.match(ACCENT_TINT);
if (pageAlt === null || tint === null) {
  console.error('\n  Could not read --page-alt or the accent tint out of tools/og-card.html.');
  console.error('  The worst-case backdrop is derived from the card rather than retyped,');
  console.error('  so a card this cannot be read out of is a card this cannot measure.\n');
  process.exit(1);
}

const hex = (value) => ({
  r: parseInt(value.slice(1, 3), 16),
  g: parseInt(value.slice(3, 5), 16),
  b: parseInt(value.slice(5, 7), 16),
  a: 1,
});
const over = (top, bottom) => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
});
const WORST_PAGE = over(
  { r: Number(tint[1]), g: Number(tint[2]), b: Number(tint[3]), a: Number(tint[4]) },
  hex(pageAlt[1]),
);

/** Runs in the page. Reports each run of text with the colour actually behind it. */
const MEASURE = `((worstPage) => {
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

  // Climb until an opaque background is met. Reaching <body> means the gradient
  // is what is behind, and the gradient reports as transparent — so the bound
  // stands in for it.
  const backdrop = (node) => {
    const stack = [];
    for (let at = node; at !== null; at = at.parentElement) {
      const colour = parse(getComputedStyle(at).backgroundColor);
      if (colour === null || colour.a === 0) {
        if (at === document.body) return { colour: worstPage, bounded: true };
        continue;
      }
      stack.push(colour);
      if (colour.a === 1) {
        let result = stack[stack.length - 1];
        for (let i = stack.length - 2; i >= 0; i -= 1) result = over(stack[i], result);
        return { colour: result, bounded: false };
      }
    }
    return { colour: worstPage, bounded: true };
  };

  const runs = [];
  for (const node of document.querySelectorAll('h1, p, span, div')) {
    const text = Array.from(node.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (text === '') continue;
    const style = getComputedStyle(node);
    const colour = parse(style.color);
    if (colour === null) continue;
    const behind = backdrop(node);
    runs.push({
      text: text.length > 44 ? text.slice(0, 41) + '...' : text,
      size: Math.round(parseFloat(style.fontSize)),
      ratio: Math.round(ratio(colour, behind.colour) * 100) / 100,
      bounded: behind.bounded,
    });
  }
  return runs;
})`;

console.log('\n=== social preview · MoleBridge ===\n');

const executablePath = chromiumPath();
const browser = await chromium.launch(executablePath === null ? {} : { executablePath });
let failures = 0;

try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
  });
  await page.goto(pathToFileURL(CARD).href, { waitUntil: 'load' });

  const runs = await page.evaluate(`(${MEASURE})(${JSON.stringify(WORST_PAGE)})`);
  if (runs.length === 0) {
    console.error('  no text found on the card — a wordless social preview is a mistake, not a style\n');
    process.exit(1);
  }

  for (const run of runs) {
    const ok = run.ratio >= TEXT_FLOOR;
    if (!ok) failures += 1;
    const how = run.bounded ? 'worst-case page' : 'its own surface';
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'}  ${String(run.ratio).padStart(6)}:1  ${String(run.size).padStart(3)}px  ` +
        `against ${how.padEnd(15)} ${run.text}`,
    );
  }

  // The chip row must fit on one line. `flex-wrap: nowrap` makes an overflow
  // visible rather than tidy, and this turns visible into failing.
  const overflow = await page.evaluate(`(() => {
    const row = document.querySelector('.chips');
    if (row === null) return null;
    const chips = Array.from(row.children);
    const top = chips[0].getBoundingClientRect().top;
    const wrapped = chips.some((c) => Math.abs(c.getBoundingClientRect().top - top) > 1);
    return { wrapped, overflows: row.scrollWidth > row.clientWidth + 1 };
  })()`);
  if (overflow !== null && (overflow.wrapped || overflow.overflows)) {
    console.log('  FAIL          the chip row does not fit on one line');
    failures += 1;
  } else if (overflow !== null) {
    console.log('  ok            the chip row fits on one line');
  }

  await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
} finally {
  await browser.close();
}

const bytes = statSync(OUT).size;
console.log(`\n  ${WIDTH}x${HEIGHT} at ${SCALE}x, ${(bytes / 1024).toFixed(0)} KB`);
if (bytes > MAX_BYTES) {
  console.error(`  FAIL  over GitHub's 1 MB limit for a social preview — it would be refused on upload\n`);
  failures += 1;
} else {
  console.log(`  ok    under GitHub's 1 MB limit`);
}

if (failures > 0) {
  console.error(`\n${failures} problem(s). og.png was written anyway so it can be looked at — do not upload it.\n`);
  process.exit(1);
}
console.log('\nEvery run of text clears the floor. og.png is ready to upload.\n');
