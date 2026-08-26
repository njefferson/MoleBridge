/**
 * whatsnew-panel.ts — the dialog that shows it.
 *
 * The decision about WHAT to show, and the argument for showing it after the
 * reload rather than on the update strip, is in `whatsnew.ts`. This file is the
 * browser half: a modal, rendered from the same `RELEASES` the ⓘ panel renders,
 * so there is one source and no second copy of the notes to drift.
 */

import { releasesSince, SEEN_VERSION_KEY } from './whatsnew.ts';
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

      lede.textContent =
        since.length === 1
          ? 'MoleBridge updated itself. This is what is different.'
          : `MoleBridge updated itself ${since.length} times since you last had it open. This is what is different.`;

      fill(
        body,
        since.map((release) =>
          el('div', { className: 'release' }, [
            el('h3', { text: `${release.version} — ${release.kind.toLowerCase()}` }),
            ...release.paragraphs.map((paragraph) => el('p', { text: paragraph })),
          ]),
        ),
      );

      panel.showModal();
      done.focus();
      return true;
    },
  };
}
