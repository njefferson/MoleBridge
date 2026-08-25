/**
 * serve.mjs — a static server for the built site, with no dependencies.
 *
 * ES modules and service workers both refuse to load over `file://`, so every
 * check that drives a real browser needs an origin. This is that origin and
 * nothing else: no directory listing, no range requests, and it will not serve
 * a path that climbs out of the root.
 *
 * ## It applies `public/_headers`, and that is not a nicety
 *
 * `_headers` is a Cloudflare Pages file, so for most of this repository's life
 * the headers it declares existed only in production — the journey walk and the
 * accessibility gate both ran against a server that sent none of them. That was
 * survivable while they were `X-Content-Type-Options` and friends, which cannot
 * break a page.
 *
 * A Content-Security-Policy can break a page, silently and completely, and a
 * policy nothing exercises is a policy discovered by a class. So this parses
 * `_headers` and serves what it declares, which puts every browser-driven gate
 * under the real policy on every run.
 *
 * Deliberately a SUBSET of Cloudflare's syntax: exact paths and a single
 * trailing `/*` wildcard, which is all this file uses. An unparseable line is a
 * THROW rather than a skip — a header quietly not applied here is the same
 * fail-open the file exists to close.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

/**
 * Parse `_headers` into rules, in file order. Cloudflare applies every matching
 * rule, later ones winning on a repeated name, and so does this.
 */
function parseHeaders(file) {
  if (!existsSync(file)) return [];
  const rules = [];
  let current = null;
  let lineNumber = 0;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    lineNumber += 1;
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
      continue;
    }
    const at = line.indexOf(':');
    if (current === null || at < 0) {
      throw new Error(`_headers:${lineNumber} is neither a path nor a "Name: value" — ${line.trim()}`);
    }
    current.headers.push([line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim()]);
  }
  return rules;
}

/** Exact match, or a single trailing `/*`. Nothing else is supported on purpose. */
function matches(pattern, pathname) {
  if (pattern.endsWith('/*')) return pathname.startsWith(pattern.slice(0, -1));
  return pattern === pathname;
}

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
  const headerRules = parseHeaders(join(base, '_headers'));

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
    const sending = {
      'content-type': TYPES.get(extname(target)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    };
    // Whatever `_headers` declares for this path, exactly as the edge would.
    for (const rule of headerRules) {
      if (!matches(rule.pattern, pathname)) continue;
      for (const [name, value] of rule.headers) sending[name] = value;
    }
    response.writeHead(200, sending);
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
