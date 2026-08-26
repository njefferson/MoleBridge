/**
 * whatsnew.test.ts — the notes a reader is owed after the app changed under them.
 *
 * THE INTERESTING CASES ARE ALL ABOUT ABSENCE: a device that has never run the
 * app, one that skipped four releases over a holiday, one carrying a version
 * this build has never heard of, and — the case this feature creates for itself
 * — a reader who was already using MoleBridge when it started keeping track.
 * None of the four is convenient to arrange in a browser, which is why the
 * decision is a pure function and not a branch inside the dialog.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { releasesSince } from '../src/ui/whatsnew.ts';
import { RELEASES } from '../src/ui/releases.ts';
import { VERSION } from '../src/version.ts';

/** A stand-in history, newest first, so the cases do not move with the app. */
const HISTORY = [
  { version: '1.4.0', kind: 'CAPABILITY', paragraphs: ['four'] },
  { version: '1.3.0', kind: 'ITERATION', paragraphs: ['three'] },
  { version: '1.2.0', kind: 'CAPABILITY', paragraphs: ['two'] },
  { version: '1.1.0', kind: 'ITERATION', paragraphs: ['one'] },
] as const;

const versions = (releases: readonly { version: string }[]): string[] =>
  releases.map((release) => release.version);

test('a newcomer is told nothing — there is no news for somebody with no before', () => {
  assert.deepEqual(releasesSince(null, false, HISTORY), []);
  assert.deepEqual(releasesSince('', false, HISTORY), []);
});

test('somebody who was here before the app kept track gets the release in front of them', () => {
  // The case this feature creates for itself. Every existing reader arrives at
  // the first build that records a version with nothing recorded, and showing
  // them nothing would mean the release that adds the panel shows nobody
  // anything. It is also the most that can be said without inventing what they
  // last saw, which is why it is one release rather than the whole history.
  assert.deepEqual(versions(releasesSince(null, true, HISTORY)), ['1.4.0']);
});

test('nothing to say where the recorded version is the one running', () => {
  assert.deepEqual(releasesSince('1.4.0', true, HISTORY), []);
});

test('everything since, newest first — and never the one they already saw', () => {
  // A Chromebook that sat on 1.1.0 over a holiday comes back three releases
  // behind. Being told only about the most recent is how a reader concludes the
  // app changes for no reason.
  assert.deepEqual(versions(releasesSince('1.1.0', true, HISTORY)), ['1.4.0', '1.3.0', '1.2.0']);
  assert.deepEqual(versions(releasesSince('1.3.0', true, HISTORY)), ['1.4.0']);
});

test('a version this build has never heard of gets the current release, not a history lesson', () => {
  // Either older than the notes this build carries, or a rollback landing on a
  // build that predates it. A wall of every note ever written is worse than a
  // short one, and neither case is a reason to give somebody a history lesson.
  assert.deepEqual(versions(releasesSince('0.0.1', true, HISTORY)), ['1.4.0']);
  assert.deepEqual(versions(releasesSince('9.9.9', true, HISTORY)), ['1.4.0']);
});

test('an empty history cannot crash the boot it runs inside', () => {
  assert.deepEqual(releasesSince(null, true, []), []);
  assert.deepEqual(releasesSince('1.0.0', true, []), []);
});

test('the panel reads the real changelog, and the app is its newest entry', () => {
  // §7d: one source. If these ever disagree the app is showing notes for a
  // release it is not — which is the exact drift `tools/changelog.mjs` and
  // `version-check.mjs` exist to prevent, asserted here from the other end.
  assert.equal(RELEASES[0]?.version, VERSION);
  assert.deepEqual(versions(releasesSince(VERSION, true)), []);
  assert.deepEqual(versions(releasesSince(null, true)), [VERSION]);
});
