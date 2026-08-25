#!/usr/bin/env node
/**
 * version-check.mjs — the release triplet is written once and read everywhere.
 *
 * Doctrine §7 and §7b: the service worker's cache name, the changelog's top
 * entry and the on-screen build stamp all carry the same
 * `version.capability.iteration`, and they get bumped together in one commit.
 * The way that fails is never dramatic — one of the three is missed, the app
 * reports a version its code is not, and the next screenshot sends somebody
 * after a bug that was fixed two releases ago.
 *
 * So the version lives in `src/version.ts` and nowhere else, and this holds
 * every other copy to it. The stamp needs no check: it reads the constant.
 *
 *   node tools/version-check.mjs
 *
 * Exits non-zero on any drift. Wired as a `.branch-guard also=` entry once this
 * repository has a branch model, so it runs on every commit rather than when
 * somebody remembers.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const checked = [];

const read = (relative) => readFileSync(join(REPO, relative), 'utf8');

/* ---- the one source ---- */
const versionSource = read('src/version.ts');
const declared = /export const VERSION = '([^']+)'/.exec(versionSource)?.[1];
if (declared === undefined) {
  console.error('src/version.ts does not export a VERSION string this can read.');
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(declared)) {
  failures.push(`src/version.ts declares "${declared}", which is not a version.capability.iteration triplet`);
}

/* ---- the changelog's top entry ---- */
const changelog = read('CHANGELOG.md');
const topEntry = /^## (\S+)/m.exec(changelog)?.[1];
if (topEntry !== declared) {
  failures.push(`CHANGELOG.md's top entry is ${topEntry ?? '(none)'}, and src/version.ts says ${declared}`);
} else {
  checked.push(`CHANGELOG.md top entry is ${declared}`);
}

// Every release states its KIND, because "which slot moved" is not recoverable
// from the number alone once two of them have moved.
//
// ANCHORED TO THE TOP ENTRY, not searched for. The first version of this was
//
//     /^## \S+ — (VERSION|CAPABILITY|ITERATION)\b/m
//
// which with the `m` flag finds the first VALID kind ANYWHERE in the file. So a
// top entry headed `## 0.4.1 — FIX` — a word that is not one of the three —
// passed, and the gate printed "ok  it is a CAPABILITY release", having read
// that off an older entry further down. It reported a fact about a release
// nobody was making.
//
// It went green on exactly that, once, and was caught by the printed line
// disagreeing with what had just been typed. A gate whose output is not read is
// a gate; a gate whose output is read and believed is worse when it lies.
const firstHeading = changelog.indexOf('\n## ');
const topBlock = firstHeading < 0 ? changelog : changelog.slice(firstHeading + 1);
const topLine = /^## \S+ — (VERSION|CAPABILITY|ITERATION)\b/.exec(topBlock);
if (topLine === null) {
  const asWritten = /^## .*/.exec(topBlock)?.[0] ?? '(no heading)';
  failures.push(
    `CHANGELOG.md's top entry does not say whether it is a VERSION, CAPABILITY ` +
      `or ITERATION release — it reads "${asWritten.trim()}"`,
  );
} else {
  checked.push(`it is a ${topLine[1]} release`);
}

/* ---- the service worker's cache name, once there is one ---- */
const workerPath = 'public/sw.js';
if (existsSync(join(REPO, workerPath))) {
  const worker = read(workerPath);
  const cacheName = /const CACHE_NAME = '([^']+)'/.exec(worker)?.[1];
  if (cacheName === undefined) {
    failures.push(`${workerPath} has no CACHE_NAME this can read`);
  } else if (!cacheName.includes(declared)) {
    // A cache name that does not move with the release means the old shell is
    // served to everyone who already has it, forever, and the app cannot
    // notice — that is what caching means.
    failures.push(`${workerPath} caches as "${cacheName}", which does not carry ${declared}`);
  } else {
    checked.push(`${workerPath} caches as ${cacheName}`);
  }
} else {
  checked.push(`${workerPath} does not exist yet — nothing to hold to the version`);
}

/* ---- the manifest, once there is one ---- */
const manifestPath = 'public/manifest.webmanifest';
if (existsSync(join(REPO, manifestPath))) {
  const manifest = JSON.parse(read(manifestPath));
  const name = typeof manifest.name === 'string' ? manifest.name : '';
  checked.push(`${manifestPath} names the app "${name}"`);
}

console.log(`=== release triplet · ${declared} ===\n`);
for (const line of checked) console.log(`  ok    ${line}`);
if (failures.length > 0) {
  console.error('');
  for (const line of failures) console.error(`  FAIL  ${line}`);
  console.error('\nBump the triplet in one commit, or the app reports a version its code is not.\n');
  process.exit(1);
}
console.log('\nOne source, and nothing has drifted from it.\n');
