#!/usr/bin/env node
/**
 * changelog.mjs — the patch notes the app shows come from CHANGELOG.md.
 *
 * Doctrine §7d: every app that has shipped more than one release shows the
 * reader what changed, in their words, INCLUDING what is still broken, and
 * generated from one source rather than typed twice. Typed twice is how a
 * release ships with notes describing the release before it — the app and the
 * changelog drift, and nothing says so.
 *
 *   node tools/changelog.mjs           write src/ui/releases.ts
 *   node tools/changelog.mjs --check   compare without writing
 *
 * `src/ui/releases.ts` IS NOT COMMITTED, and that is what makes drift
 * impossible rather than merely detectable: `npm run generate` runs ahead of
 * every type check and every build, so the only version that can exist is the
 * one this file just made from the changelog.
 *
 * `--check` is therefore not in `npm run check`, and putting it back would be
 * theatre — it cannot fail against a file that was regenerated a moment before.
 * It stays for the case where somebody wants to compare without writing.
 *
 * THE ORDERING IS LOAD-BEARING, and it was got wrong first: the generated file
 * was ignored but the type check did not generate it, so a fresh clone had a
 * source importing a module that did not exist. Every local run passed because
 * the file was left over from a previous build; the first fresh clone was CI.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = join(REPO, 'CHANGELOG.md');
const TARGET = join(REPO, 'src', 'ui', 'releases.ts');

/**
 * Read CHANGELOG.md into releases.
 *
 * PRECONDITION: each release is a `## <version> — <KIND>` heading followed by
 * prose. Bold markers are stripped: the app renders text nodes, never markup,
 * so an asterisk would reach the screen as an asterisk.
 */
function parse(markdown) {
  const releases = [];
  let current = null;

  for (const rawLine of markdown.split('\n')) {
    const heading = /^## (\S+)\s+—\s+(VERSION|CAPABILITY|ITERATION)\s*$/.exec(rawLine);
    if (heading !== null) {
      current = { version: heading[1], kind: heading[2], paragraphs: [] };
      releases.push(current);
      continue;
    }
    if (current === null) continue;
    if (/^#{1,2} /.test(rawLine)) {
      current = null;
      continue;
    }
    const line = rawLine.replace(/\*\*/g, '').trimEnd();
    if (line.trim() === '') {
      if (current.paragraphs.length > 0 && current.paragraphs.at(-1) !== '') current.paragraphs.push('');
      continue;
    }
    if (current.paragraphs.length === 0 || current.paragraphs.at(-1) === '') current.paragraphs.push(line.trim());
    else current.paragraphs[current.paragraphs.length - 1] += ` ${line.trim()}`;
  }

  return releases.map((release) => ({
    version: release.version,
    kind: release.kind,
    paragraphs: release.paragraphs.filter((paragraph) => paragraph !== ''),
  }));
}

function render(releases) {
  const body = releases
    .map(
      (release) =>
        `  {\n    version: ${JSON.stringify(release.version)},\n`
        + `    kind: ${JSON.stringify(release.kind)},\n`
        + `    paragraphs: [\n${release.paragraphs.map((p) => `      ${JSON.stringify(p)},`).join('\n')}\n    ],\n  },`,
    )
    .join('\n');

  return `/**
 * releases.ts — GENERATED FROM CHANGELOG.md. Do not edit.
 *
 * Doctrine §7d: the reader sees what changed, from one source. Run
 * \`node tools/changelog.mjs\` to regenerate; \`--check\` fails on drift and is
 * part of \`npm run check\`.
 */

/** One release, as a reader sees it. */
export interface Release {
  readonly version: string;
  /** VERSION, CAPABILITY or ITERATION — Doctrine §7's release taxonomy. */
  readonly kind: string;
  /** The notes, one string per paragraph. Plain text: the app renders nodes. */
  readonly paragraphs: readonly string[];
}

/** Every release, newest first. */
export const RELEASES: readonly Release[] = [
${body}
];
`;
}

const releases = parse(readFileSync(SOURCE, 'utf8'));
if (releases.length === 0) {
  console.error('CHANGELOG.md has no release headings this can read.');
  process.exit(1);
}
const generated = render(releases);

if (process.argv.includes('--check')) {
  let existing = '';
  try {
    existing = readFileSync(TARGET, 'utf8');
  } catch {
    console.error('src/ui/releases.ts does not exist. Run: node tools/changelog.mjs');
    process.exit(1);
  }
  if (existing !== generated) {
    console.error('src/ui/releases.ts has drifted from CHANGELOG.md.');
    console.error('The app would show notes for a different release than the changelog does.');
    console.error('Run: node tools/changelog.mjs\n');
    process.exit(1);
  }
  console.log(`patch notes: ${releases.length} release(s), and the app matches the changelog.`);
} else {
  writeFileSync(TARGET, generated);
  console.log(`patch notes: wrote ${releases.length} release(s) to src/ui/releases.ts`);
}
