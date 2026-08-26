/**
 * whatsnew-panel.ts — the dialog that shows it.
 *
 * The decision about WHAT to show, and the argument for showing it after the
 * reload rather than on the update strip, is in `whatsnew.ts`. This file is the
 * browser half: a modal, rendered from the same `RELEASES` the ⓘ panel renders,
 * so there is one source and no second copy of the notes to drift.
 */

import { forAPanel, HISTORY_PATH, releasesSince, SEEN_VERSION_KEY } from './whatsnew.ts';
import { el, fill, need } from './dom.ts';

/** The live panel. */
export interface WhatsNew {
  /**
   * Show the notes for everything since this device last saw a version, and
   * return true where anything was shown. False means there was nothing to say
   * — and the version has been recorded, so it stays that way.
   *
   * `returning` says whether this reader has used MoleBridge before. See
   * `releasesSince`: it is the difference between a newcomer and somebody who
   * was here before the app started keeping track.
   */
  offer(returning: boolean): boolean;
}

/**
 * Wire the panel up.
 *
 * PRECONDITION: the document contains `#whatsnew-panel` and its hooks.
 */
export function mountWhatsNew(current: string): WhatsNew {
  const panel = need<HTMLDialogElement>('#whatsnew-panel');
  const body = need('#whatsnew-body');
  const lede = need('#whatsnew-lede');
  const done = need<HTMLButtonElement>('#whatsnew-done');

  const remember = (): void => {
    try {
      localStorage.setItem(SEEN_VERSION_KEY, current);
    } catch {
      // Storage refused — private browsing, or a managed device with site data
      // off. The reader sees the notes; they are simply offered again next
      // time, which is a nuisance rather than a fault.
    }
  };

  const lastSeen = (): string | null => {
    try {
      return localStorage.getItem(SEEN_VERSION_KEY);
    } catch {
      return null;
    }
  };

  done.addEventListener('click', () => panel.close());
  // RECORDED ON `close`, NOT ON THE BUTTON. Escape and the backdrop close a
  // dialog too, and a reader who dismissed it that way has still been shown it
  // — the alternative is the same notes again on every launch, which teaches
  // people to dismiss the panel without reading it.
  panel.addEventListener('close', remember);
  panel.addEventListener('click', (event) => {
    if (event.target === panel) panel.close();
  });

  return {
    offer(returning: boolean): boolean {
      const since = releasesSince(lastSeen(), returning);
      if (since.length === 0) {
        remember();
        return false;
      }

      // CAPPED, AND THE COUNT IS STILL TOLD THE TRUTH. Somebody coming back
      // after a long gap is owed the fact that it moved nine times; they are
      // not owed nine sets of notes stacked between them and the way out.
      const { notes, more } = forAPanel(since);

      lede.textContent =
        since.length === 1
          ? 'MoleBridge updated itself. This is what is different.'
          : `MoleBridge updated itself ${since.length} times since you last had it open. This is what is different.`;

      fill(body, [
        ...notes.map((release) =>
          el('div', { className: 'release' }, [
            el('h3', { text: `${release.version} — ${release.kind.toLowerCase()}` }),
            ...release.paragraphs.map((paragraph) => el('p', { text: paragraph })),
          ]),
        ),
        el('p', {
          className: 'hint',
          text:
            more === 0
              ? 'Every release before this one is on its own page.'
              : `${more} older ${more === 1 ? 'release is' : 'releases are'} not shown here.`,
        }),
        // A LINK IS A CONTROL A FINGER HAS TO HIT, and an inline anchor is 18px
        // tall. The accessibility gate caught this one at 217x18 against the
        // 44px floor — these apps are used on a tablet, by touch, and a route
        // that is only reachable with a mouse pointer is the shape of defect
        // the hub's own rule about conformance is about.
        el('a', {
          className: 'button button-small',
          text: 'Everything that has changed',
          attrs: { href: HISTORY_PATH },
        }),
      ]);

      panel.showModal();
      done.focus();
      return true;
    },
  };
}
