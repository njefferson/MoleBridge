/**
 * whatsnew.ts — the reader finds out what changed without going looking.
 *
 * Doctrine §7d says the app shows what changed, from one source, reachable from
 * somewhere the reader already goes. MoleBridge had the notes and put them
 * behind the ⓘ under "What changed", which is a place you only visit if you
 * already suspect there is news. §7h's strip tells you a new version is WAITING
 * and lets you take it — and then it switches, the page reloads, and nothing
 * says what you got. The app changed under somebody who never asked what for.
 *
 * ## Why AFTER the switch and not on the strip
 *
 * The obvious version of this is a "what's in it" line on the update strip. It
 * cannot be honest. The page running that strip is the OLD build: its
 * `RELEASES` array was generated from the changelog as it stood when that build
 * was made, so the running code has never heard of the release it is offering.
 * Anything it said about the waiting version would be invented.
 *
 * So the news comes after the reload, from the new build, which is the first
 * moment anything in the app actually knows.
 *
 * ## Three rules about when it may interrupt
 *
 * A NEWCOMER IS NEVER TOLD. Nothing stored means nothing changed for them —
 * they get the first-run welcome, which is a different promise. The version is
 * recorded silently so their next update is news.
 *
 * NOT OVER WORK IN PROGRESS. A student arriving on a warm-up link is looking at
 * a problem within a second of tapping it, and one resuming a saved session has
 * something waiting. Neither is a moment for release notes, and neither loses
 * them: the version is not recorded, so the offer stands until they open the
 * app with nothing in front of them.
 *
 * ## Why the decision is here and the dialog is next door
 *
 * `whatsnew-panel.ts` holds the `<dialog>`; this file holds what to show and
 * touches nothing in a browser. The same split as `warmup.ts`, for the same
 * reason: every case worth getting right here is about ABSENCE — a device that
 * has never run the app, one that skipped four releases over a holiday, one
 * carrying a version this build has never heard of — and none of them is
 * convenient to arrange in a browser. A decision that can only be tested by
 * driving Chromium is a decision that gets tested once.
 *
 * EVERYTHING SINCE, NOT JUST THE LAST ONE. A Chromebook that sat on 1.2.0 over
 * a holiday comes back four releases behind, and being told only about the most
 * recent one is how a reader concludes the app changes for no reason.
 */

import { RELEASES, type Release } from './releases.ts';

/**
 * The last version this DEVICE was shown. Device-local like every other
 * preference here: it is not in the completion code, not in the problem report,
 * and there is no account for it to belong to.
 */
export const SEEN_VERSION_KEY = 'molebridge.version.seen';

/**
 * How many releases any surface inside the app shows at once.
 *
 * FIVE, AND THEN A DOOR OUT. An app that has shipped thirty releases and shows
 * all of them has built a wall: the way out of the dialog is under everything
 * the reader did not ask to read, and the ⓘ panel's other sections are pushed
 * off the bottom of it. The newest is the one they came for; four more is
 * enough to see what they missed if they were away a fortnight. Everything
 * older is a page — `/changes/`, part of the app and cached with it, so it
 * opens with no connection like the rest of it.
 */
export const NOTES_SHOWN = 5;

/** Where the whole history lives. In the app, on the same origin, offline. */
export const HISTORY_PATH = '/changes/';

/**
 * The newest `NOTES_SHOWN` of them, and how many were left behind.
 *
 * The count is returned rather than a boolean because a reader told there is
 * "more" learns nothing, and one told there are twenty-four more knows whether
 * the page is worth opening.
 */
export function forAPanel<T>(all: readonly T[]): { readonly notes: readonly T[]; readonly more: number } {
  return { notes: all.slice(0, NOTES_SHOWN), more: Math.max(0, all.length - NOTES_SHOWN) };
}

/**
 * Everything the reader has not been shown, newest first.
 *
 * PURE, and separated from the dialog for exactly that reason — the interesting
 * cases here are a device that has never run the app, one that skipped four
 * releases, and one carrying a version this build has never heard of, and none
 * of the three is convenient to arrange in a browser.
 *
 * A version that is not in the list is either older than the notes this build
 * carries or a rollback landing on a build that predates it. Both get the
 * current release and nothing else: a wall of every note ever written is worse
 * than a short one, and neither case is a reason to give somebody a history
 * lesson they did not ask for.
 *
 * `returning` IS THE CASE THIS FEATURE CREATES FOR ITSELF, and getting it wrong
 * would have made the release that adds it show nobody anything. Every existing
 * reader arrives at the first build that records a version with nothing
 * recorded — indistinguishable, from this key alone, from somebody who has
 * never opened the app. They are not the same person and the app already knows
 * which is which: a reader who has been here before has read the orientation.
 * A true newcomer has no news by definition; a returning reader with no
 * recorded version gets the release in front of them, which is the most the app
 * can say without inventing what they last saw.
 */
export function releasesSince(
  seen: string | null,
  returning: boolean,
  releases: readonly Release[] = RELEASES,
): readonly Release[] {
  const newest = releases[0];
  if (newest === undefined) return [];
  if (seen === null || seen === '') return returning ? [newest] : [];
  if (seen === newest.version) return [];
  const at = releases.findIndex((release) => release.version === seen);
  return at === -1 ? [newest] : releases.slice(0, at);
}
