/**
 * serve.mjs — a static server for the built site, with no dependencies.
 *
 * ES modules and service workers both refuse to load over `file://`, so every
 * check that drives a real browser needs an origin. This is that origin and
 * nothing else: no directory listing, no range requests, no caching headers,
 * and it will not serve a path that climbs out of the root.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

/** What each extension is served as. A wrong type on a module is a blank page. */
const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

/**
 * Serve `root` on an ephemeral port.
 *
 * PRECONDITION: `root` is a directory that exists.
 * Returns the origin and a close function.
 */
export async function serve(root) {
  const base = resolve(root);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // A request cannot climb out of the root, however it is spelled.
    const target = join(base, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!target.startsWith(base + sep) && target !== base) {
      response.writeHead(403).end('no');
      return;
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end(`not here: ${pathname}`);
      return;
    }
    response.writeHead(200, {
      'content-type': TYPES.get(extname(target)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(target).pipe(response);
  });

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((done) => server.close(done));
    },
  };
}

/** Where a browser lives on this machine, or null to let playwright decide. */
export function chromiumPath() {
  for (const candidate of [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
