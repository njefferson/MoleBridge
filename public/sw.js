/*
  sw.js — the offline shell.

  DOCTRINE §7h, AND THE WHOLE REASON THIS FILE IS CAREFUL: an app that caches
  itself CANNOT NOTICE it has gone stale. That is what caching means. So the
  rules here are not defaults and must not be "tidied up" into them:

  1. NO `skipWaiting()` ON INSTALL. A new version waits. Swapping the shell out
     from under an open page gives a reader half of one build and half of
     another — new markup with old modules, or the reverse — and the failures
     that produces are unreproducible and blamed on the app being flaky.
  2. The page is TOLD, in words, that a new version is ready, and the reader
     decides. `skipWaiting` happens only when they press the button.
  3. The cache name carries the release, so `caches.keys()` in the §7f
     diagnostic answers "which build is this reader actually on".

  The precache list is generated (tools/assets.mjs) rather than written here: a
  hand-maintained list drifts from the files that exist, and it fails by working
  perfectly until somebody is offline.
*/

const CACHE_NAME = 'molebridge-1.10.0';

/** Where the generated file list lives. */
const PRECACHE_MANIFEST = '/precache.json';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(PRECACHE_MANIFEST, { cache: 'no-store' });
        const files = await response.json();
        await cache.addAll(files);
      } catch {
        // A single missing file must not fail the whole install and leave the
        // reader with no offline shell at all. Take what can be taken.
        const cache2 = await caches.open(CACHE_NAME);
        await cache2.addAll(['/', '/index.html', '/styles.css']).catch(() => undefined);
      }
      // Deliberately NO self.skipWaiting() here. See rule 1.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== CACHE_NAME && name.startsWith('molebridge-')) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached !== undefined) return cached;
      try {
        const response = await fetch(request);
        // Only successful, basic responses are worth keeping; caching an error
        // page under a real URL is how an app serves a 404 forever.
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          void cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        // Offline and not cached. A navigation still gets the shell, so the app
        // opens rather than showing the browser's dinosaur.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell !== undefined) return shell;
        }
        throw error;
      }
    })(),
  );
});

self.addEventListener('message', (event) => {
  // The ONLY route to skipWaiting, and it is a button press.
  if (event.data === 'molebridge:use-it-now') void self.skipWaiting();
});
