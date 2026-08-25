/**
 * updates.ts — telling the reader a new version is waiting.
 *
 * Doctrine §7h. An offline-first app serves itself from a cache, so a reader
 * can sit on a build from three releases ago indefinitely and nothing in the
 * app would say so. Every app in this family has that defect until it is fixed
 * on purpose; this is the fix.
 *
 * The reader decides. The worker waits, the strip says so in words they can
 * see, and pressing the button is the only thing that ever calls
 * `skipWaiting`. A newcomer is never interrupted, because there is nothing
 * waiting for them.
 */

import { need } from './dom.ts';

/** The message the page sends the waiting worker when the reader says go. */
const USE_IT_NOW = 'molebridge:use-it-now';

/** Where the worker lives. Scope is the whole origin. */
const WORKER_URL = '/sw.js';

/** The live update strip. */
export interface Updates {
  /** True where a new version is sitting there waiting to be used. */
  isWaiting(): boolean;
}

/**
 * Register the worker and wire the strip up.
 *
 * PRECONDITION: the document contains the update strip's hooks. Does nothing at
 * all where service workers are unsupported or blocked, which is a managed
 * Chromebook's prerogative — the app still works, it just cannot go offline.
 */
export function mountUpdates(): Updates {
  const strip = need('#update-strip');
  const apply = need<HTMLButtonElement>('#update-apply');
  const later = need<HTMLButtonElement>('#update-later');

  let waiting: ServiceWorker | null = null;

  const show = (worker: ServiceWorker): void => {
    waiting = worker;
    strip.hidden = false;
  };

  later.addEventListener('click', () => {
    // Dismissed, not resolved. The ⓘ panel still reports a version waiting, so
    // the offer stands rather than disappearing until the next reload.
    strip.hidden = true;
  });

  apply.addEventListener('click', () => {
    if (waiting === null) return;
    apply.disabled = true;
    need('#update-message').textContent = 'Switching over…';
    waiting.postMessage(USE_IT_NOW);
  });

  if (!('serviceWorker' in navigator)) return { isWaiting: () => false };

  void (async () => {
    try {
      const registration = await navigator.serviceWorker.register(WORKER_URL);

      if (registration.waiting !== null && navigator.serviceWorker.controller !== null) {
        show(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (installing === null) return;
        installing.addEventListener('statechange', () => {
          // `installed` WITH a controller means this is a replacement rather
          // than a first install. Without that check, every first-time visitor
          // is told a new version is ready the moment they arrive.
          if (installing.state === 'installed' && navigator.serviceWorker.controller !== null) {
            show(installing);
          }
        });
      });

      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Reload ONLY after the reader asked. A controllerchange the app did not
        // ask for must never reload the page: that is the silent-reload defect
        // this whole file exists to avoid.
        if (!reloading && apply.disabled) {
          reloading = true;
          location.reload();
        }
      });
    } catch {
      // Blocked, or served from a context that cannot register one. Nothing to
      // report to the reader: the app works, it just will not go offline.
    }
  })();

  return { isWaiting: () => waiting !== null };
}
