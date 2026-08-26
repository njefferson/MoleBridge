#!/usr/bin/env node
/**
 * language-check.mjs — the app never tells a reader it was built for somebody else.
 *
 *   node tools/language-check.mjs
 *
 * ## Why this is a gate and not a proofread
 *
 * MoleBridge was written for one chemistry classroom and the words came out
 * that way: "your teacher has put these on the board", "type it into the Canvas
 * assignment", "decode a class". Every one of those was accurate. Every one of
 * them also tells a homeschooled student — or an adult going back over this on
 * their own, or a co-op of four, or a tutor — that the thing in front of them
 * is somebody else's tool and they are reading over a shoulder.
 *
 * Nothing about the app is wrong for them. Only the sentences are. That is what
 * makes this the easy defect to reintroduce: writing "your teacher" is not a
 * decision anybody makes, it is the phrase that arrives when you picture the
 * room the app was built for. So it is checked rather than remembered.
 *
 * THE REPLACEMENT IS NOT VAGUENESS. "Someone" is worse than "your teacher" for
 * a fifteen-year-old in period three — it sounds like the app does not know
 * what it is for. Each forbidden phrase here names the wording that is true in
 * BOTH rooms and no less specific in either: whoever set the work, wherever you
 * hand it in, the codes you were handed.
 *
 * `src/ui/releases.ts` is not scanned. It is generated from CHANGELOG.md, which
 * is the record of what shipped and when; editing old entries so a gate goes
 * green is rewriting history to look like it never happened. New entries are
 * written in the neutral voice because they are written now.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Every phrase that puts one particular room around the reader, and what to say
 * instead. The advice is half the gate: a failure that only says "no" gets
 * worked around, and the way around this one is a synonym that excludes exactly
 * as much.
 */
const FORBIDDEN = [
  ['your teacher', 'whoever set the work'],
  ['their teacher', 'whoever marks it'],
  ['the teacher will', 'whoever set the work will'],
  ['canvas', 'wherever you hand your work in'],
  ['classroom', 'name what happens, not the room it happens in'],
  ['the board', 'however it reached you — say what it is, not where it was written'],
  ['your class', 'everyone with the same key'],
  ['the class', 'everyone, or the codes you were handed'],
  ['a class', 'a set of codes'],
  ['in class', 'when you sit down to it'],
  ['at school', 'anywhere'],
  ['school machine', 'a shared machine'],
];

/**
 * The file with its comments taken out — both spellings, because these surfaces
 * are half HTML and half TypeScript.
 *
 * COMMENTS ARE WHERE THE ROOM IS DESCRIBED HONESTLY. The note above the warm-up
 * builder says a teacher writes the link on the board, because that is the
 * thing that was asked for and the reason the feature exists. A gate that
 * failed on it would delete the reasoning to satisfy the rule about the copy.
 *
 * Conservative in the same way as `permissions-check.mjs`: block comments come
 * out whole, a line comment only when the whole line is one.
 */
function withoutComments(text) {
  // Blanked rather than deleted: this gate reports a line number, and a
  // stripper that collapses lines reports the wrong one — which sends somebody
  // to a sentence that is fine and teaches them the gate is unreliable.
  const blank = (match) => match.replace(/[^\n]/g, ' ');
  return text
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

function everyFile(directory, ending) {
  const out = [];
  if (!existsSync(directory)) return out;
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) out.push(...everyFile(full, ending));
    else if (full.endsWith(ending)) out.push(full);
  }
  return out;
}

/** Generated from CHANGELOG.md, which is a record rather than a surface. */
const GENERATED = join(REPO, 'src', 'ui', 'releases.ts');

const SURFACES = [
  join(REPO, 'public', 'index.html'),
  join(REPO, 'public', 'teacher', 'index.html'),
  ...everyFile(join(REPO, 'src', 'ui'), '.ts'),
  ...everyFile(join(REPO, 'src', 'learn'), '.ts'),
  ...everyFile(join(REPO, 'src', 'report'), '.ts'),
  ...everyFile(join(REPO, 'src', 'teacher'), '.ts'),
].filter((file) => file !== GENERATED && existsSync(file));

let failures = 0;

console.log('\n=== language · MoleBridge ===\n');

for (const file of SURFACES) {
  const lines = withoutComments(readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, at) => {
    const haystack = line.toLowerCase();
    for (const [phrase, instead] of FORBIDDEN) {
      // NOT FOLLOWED BY AN `=`, which is the one collision this list has with
      // markup: `<a class="skip">` contains the phrase "a class" and is an
      // anchor tag, not a sentence about a room. Flagging it would be the
      // pattern-over-list mistake the hub's LESSONS §108 records — honest
      // content in the shape of the thing being looked for.
      if (!new RegExp(`${phrase}(?!\\s*=)`).test(haystack)) continue;
      console.log(`  FAIL  ${relative(REPO, file)}:${at + 1} says "${phrase}" — ${instead}`);
      failures += 1;
    }
  });
}

if (failures === 0) {
  console.log(`  ok    ${SURFACES.length} surfaces, none of which puts one room around the reader`);
  console.log('\nPASS\n');
  process.exit(0);
}

console.log(`\nFAIL — ${failures} place(s) tell a reader this was built for somebody else\n`);
process.exit(1);
