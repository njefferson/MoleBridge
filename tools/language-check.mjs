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
 * ## The release notes are in scope, and that was a correction
 *
 * This first shipped scanning everything EXCEPT the patch notes, on the reasoning
 * that CHANGELOG.md is a record of what shipped and editing old entries is
 * rewriting history. That was wrong, and the distinction it missed is between
 * the FACTS of a release, which are fixed, and the VOICE they are told in, which
 * is the app's and belongs to now. The notes are not an archive; they are the
 * app talking to whoever is reading it today, in the same panel as every other
 * screen, and twenty-eight entries about a class and a gradebook teach a family
 * learning at home the same wrong thing any other screen would. Nothing about
 * what happened in each release changed — only the room the sentence puts
 * around it.
 *
 * ## The register question, decided here rather than mid-commit
 *
 * Hub LESSONS 146: a word gate encodes a rule about what may be SAID TO
 * somebody, and the same words are legitimate when the subject is the software
 * rather than the reader. A note describing the copy this app USED to carry has
 * to name that copy, and every rewrite that satisfies a gate instead says less
 * than the note it replaced.
 *
 * The line for this gate: a release note that ADDRESSES the reader is in scope
 * — "type it into the Canvas assignment" tells a homeschooler the app is
 * somebody else's whether it is on a screen or in a note. A note DESCRIBING the
 * old copy is the other register, and the answer there is to describe the room
 * rather than quote the sentence, which is better prose anyway: 1.6.0 says the
 * app named a whiteboard at the front and one piece of software for handing
 * work in, and needs no exemption to say it.
 *
 * No mechanism is built for that second case, deliberately, because it has come
 * up once and the rewrite was an improvement. If it recurs and a rewrite starts
 * saying LESS than the note it replaced, that is the signal to narrow by
 * register rather than to exempt a file — and the test of the narrowing is that
 * it can still be planted red.
 *
 * So CHANGELOG.md is scanned, and `src/ui/releases.ts` is not: it is generated
 * from CHANGELOG.md by `tools/changelog.mjs`, so the source is the honest place
 * to hold the line, and scanning a file that may not exist yet would be a check
 * that can silently skip.
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
  /*
    A DAY OF THE WEEK IS A TIMETABLE, and a timetable is a room.

    The warm-up builder's key field was pre-filled `MONDAY` and its first example
    was `MONDAY7`. Nobody chose that as copy — the feature was built around a real
    Monday warm-up, and the placeholder is where that room came out.

    A PRE-FILLED DEFAULT IS THE STRONGEST COPY IN A FIELD. It is the example
    somebody reads before they have decided what belongs there, so it teaches the
    shape of the answer more forcefully than the hint above it does. `MONDAY` told
    a family learning at home, or an adult going back over this across three
    evenings, that the work happens on a school week.

    All seven, because the way around a gate is a synonym that excludes exactly as
    much, and `TUESDAY` excludes precisely what `MONDAY` does. Every other day-name
    in this repository is inside a comment describing why the warm-up exists, which
    this gate reads past — the room may be explained, it may not be addressed.

    `today` is deliberately NOT here. The label says "A word for today", and that
    is true for anybody doing a warm-up now, whatever day it is. A day of the week
    presumes a timetable; today presumes only that somebody is sitting down to it.
  */
  ['monday', 'name the chemistry or where you are in it — GASLAWS, UNIT3, REVIEW2'],
  ['tuesday', 'name the chemistry or where you are in it — GASLAWS, UNIT3, REVIEW2'],
  ['wednesday', 'name the chemistry or where you are in it — GASLAWS, UNIT3, REVIEW2'],
  ['thursday', 'name the chemistry or where you are in it — GASLAWS, UNIT3, REVIEW2'],
  ['friday', 'name the chemistry or where you are in it — GASLAWS, UNIT3, REVIEW2'],
  ['saturday', 'name the chemistry or where you are in it — GASLAWS, UNIT3, REVIEW2'],
  ['sunday', 'name the chemistry or where you are in it — GASLAWS, UNIT3, REVIEW2'],
  // A PATH IS COPY TOO. /teacher was in the address bar and in every link to
  // that page for nine releases after its contents had been made neutral, so a
  // reader was told whose app it was before the page had loaded. The word is
  // forbidden in a path for the same reason it is forbidden in a sentence.
  ['href="/teacher', 'the page is /codes/ — a path names a room as loudly as a sentence'],
  ["'/teacher", 'the page is /codes/ — a path names a room as loudly as a sentence'],
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
  join(REPO, 'CHANGELOG.md'),
  join(REPO, 'public', 'index.html'),
  join(REPO, 'public', 'codes', 'index.html'),
  join(REPO, 'public', 'changes', 'index.html'),
  ...everyFile(join(REPO, 'src', 'ui'), '.ts'),
  ...everyFile(join(REPO, 'src', 'learn'), '.ts'),
  ...everyFile(join(REPO, 'src', 'report'), '.ts'),
  ...everyFile(join(REPO, 'src', 'codes'), '.ts'),
  ...everyFile(join(REPO, 'src', 'changes'), '.ts'),
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
