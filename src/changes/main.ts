/**
 * changes/main.ts — every release, on a page of its own.
 *
 * §7d says the reader is shown what changed, from ONE source. That source is
 * CHANGELOG.md, which `tools/changelog.mjs` turns into `src/ui/releases.ts`,
 * which the ⓘ panel, the after-an-update dialog and this page all render. Three
 * surfaces, no second copy of the words.
 *
 * The other two show the newest few and point here, because a surface a reader
 * has to scroll past thirty releases to leave punishes them for opening it.
 * This page is where length is the point rather than the cost.
 */

import { RELEASES } from '../ui/releases.ts';
import { VERSION } from '../version.ts';
import { el, fill, need } from '../ui/dom.ts';

need('#build-stamp').textContent = VERSION;

fill(
  need('#changes-list'),
  RELEASES.map((release) =>
    el('article', { className: 'release' }, [
      el('h2', { text: `${release.version} — ${release.kind.toLowerCase()}` }),
      ...release.paragraphs.map((paragraph) => el('p', { text: paragraph })),
    ]),
  ),
);
