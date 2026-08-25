#!/usr/bin/env node
/**
 * assets.mjs — the icons, and the list of everything the offline shell needs.
 *
 * Both are GENERATED and neither is committed. An icon in the tree drifts from
 * the drawing it came from, and a hand-maintained precache list drifts from the
 * files that actually exist — and the second one fails in the worst way, by
 * working perfectly until somebody is offline.
 *
 *   node tools/assets.mjs      after `tsc`, as part of `npm run build`
 */

import { chromium } from 'playwright-core';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumPath } from './serve.mjs';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC = join(REPO, 'public');

/** The PNG sizes a manifest and an iOS home screen ask for. */
const SIZES = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-180.png', size: 180, maskable: false },
  // Maskable icons are cropped to a circle by the platform, so the artwork is
  // inset to the safe zone rather than drawn to the edge and clipped.
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];

/** Never precached: the worker itself, and the list it reads. */
const NOT_PRECACHED = new Set(['sw.js', 'precache.json']);

function walk(directory) {
  const out = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const svg = readFileSync(join(PUBLIC, 'icon.svg'), 'utf8');
const executablePath = chromiumPath();
const browser = await chromium.launch(executablePath === null ? {} : { executablePath });

try {
  for (const { file, size, maskable } of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const inset = maskable ? Math.round(size * 0.1) : 0;
    await page.setContent(
      `<!doctype html><style>
         html,body{margin:0;padding:0;background:#17458f}
         div{width:${size}px;height:${size}px;display:grid;place-items:center}
         svg{width:${size - inset * 2}px;height:${size - inset * 2}px}
       </style><div>${svg}</div>`,
    );
    await page.screenshot({ path: join(PUBLIC, file), omitBackground: false });
    await page.close();
    console.log(`  icon  ${file} (${size}px${maskable ? ', maskable' : ''})`);
  }
} finally {
  await browser.close();
}

const files = walk(PUBLIC)
  .map((full) => `/${relative(PUBLIC, full).split(sep).join('/')}`)
  .filter((url) => !NOT_PRECACHED.has(url.slice(1)))
  .sort();

// `/` is what a home-screen launch actually requests, and it is not a file.
const precache = ['/', ...files];
writeFileSync(join(PUBLIC, 'precache.json'), `${JSON.stringify(precache, null, 2)}\n`);
console.log(`  cache ${precache.length} files listed for the offline shell`);
