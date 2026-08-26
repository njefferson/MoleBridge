/**
 * info.ts — the ⓘ surface, and everything Doctrine §7e says is behind it.
 *
 * ONE information surface, in the app's own chrome — not a tab, not a footer
 * link. Behind it: what the app is and is not, how to install it with every
 * platform NAMED, what changed, where the data comes from and under what terms,
 * how to report a problem, the accessibility statement and the licence.
 *
 * The orientation block is MOVED in here from the welcome screen rather than
 * copied. See app.ts.
 */

import { el, fill, need } from './dom.ts';
import { VERSION } from '../version.ts';
import { RELEASES } from './releases.ts';
import { forAPanel, HISTORY_PATH } from './whatsnew.ts';
import { buildDiagnostic, factsFrom } from './diagnostic.ts';
import type { Updates } from './updates.ts';
import type { Session } from '../engine/steps.ts';

/** Remembers only that the orientation has been read. Nothing about anybody. */
const SEEN_KEY = 'molebridge.orientation.seen';

/** The live ⓘ panel. */
export interface InfoPanel {
  /** Move the orientation block out of the welcome screen and in here. */
  adoptOrientation(markSeen?: boolean): void;
  /** True where this device has been past the welcome screen before. */
  hasBeenSeen(): boolean;
}

/**
 * Wire the ⓘ panel up.
 *
 * PRECONDITION: the document contains the panel and its hooks.
 */
export function mountInfo(getSession: () => Session | null, updates: Updates): InfoPanel {
  const panel = need<HTMLDialogElement>('#info-panel');
  const open = need<HTMLButtonElement>('#info-open');
  const close = need<HTMLButtonElement>('#info-close');
  const slot = need('#info-orientation-slot');
  const sections = need('#info-sections');

  need('#info-version').textContent = VERSION;
  need('#info-offline').textContent = navigator.onLine
    ? 'Loaded and working; it will keep working with no connection.'
    : 'Working with no connection right now.';

  fill(sections, [
    ...(updates.isWaiting()
      ? [
          el('p', {
            className: 'note',
            text: 'A newer version of MoleBridge is ready and waiting. Reload the page to switch to it.',
          }),
        ]
      : []),
    whatChanged(),
    diagnosticSection(getSession),
    ...buildSections(),
  ]);

  open.addEventListener('click', () => {
    panel.showModal();
    close.focus();
  });
  close.addEventListener('click', () => panel.close());
  // Clicking the backdrop closes it, which is what everybody tries first.
  panel.addEventListener('click', (event) => {
    if (event.target === panel) panel.close();
  });

  return {
    /*
      MOVED, NEVER COPIED (Doctrine §7e). `markSeen` is false on the one path
      where the reader did not begin by pressing anything: a warm-up link opens
      straight into a problem, because a teacher has just put it on the board and
      a modal in front of twenty-eight students is friction at exactly the wrong
      moment. The orientation still MOVES into the panel, so it survives and is
      reachable — but the app must not record that somebody read a thing it never
      showed them, so the welcome still appears the first time they open the app
      on their own.
    */
    adoptOrientation(markSeen = true): void {
      const orientation = document.querySelector('#orientation');
      if (orientation !== null && orientation.parentElement !== slot) slot.append(orientation);
      if (markSeen) remember();
    },
    hasBeenSeen(): boolean {
      try {
        return localStorage.getItem(SEEN_KEY) === 'yes';
      } catch {
        // A managed Chromebook can have site data switched off entirely. That
        // means the welcome shows every time, which is a small annoyance and
        // not a failure; throwing here would be a blank screen.
        return false;
      }
    },
  };
}

function remember(): void {
  try {
    localStorage.setItem(SEEN_KEY, 'yes');
  } catch {
    // See hasBeenSeen. Nothing depends on this succeeding.
  }
}

/** Everything §7e requires, built as nodes rather than markup. */
function buildSections(): HTMLElement[] {
  return [
    section('Installing it on your device', [
      el('p', {
        text:
          'MoleBridge runs in the browser and can be installed so it opens like an app, '
          + 'with no address bar. It works the same either way.',
      }),
      list([
        'Chromebook or desktop Chrome: the install icon in the address bar, or the three-dot menu, then Cast, save and share, then Install page as app.',
        'iPad or iPhone, in Safari: the Share button, then Add to Home Screen.',
        'Android, in Chrome: the three-dot menu, then Add to Home screen.',
        'ViewSonic ViewBoard, in Chromium: the three-dot menu, then Install MoleBridge.',
      ]),
    ]),

    section('Where the chemistry comes from', [
      el('p', {
        text:
          'Atomic weights are the IUPAC standard values published by the Commission on '
          + 'Isotopic Abundances and Atomic Weights in 2021. They are used as published, '
          + 'never rounded, and where IUPAC gives fewer digits — hydrogen is 1.008, four '
          + 'figures — that is because the isotopic composition varies between natural '
          + 'sources and a fifth digit would be claiming to know the sample.',
      }),
      el('p', {
        text:
          'The molar volume of a gas is the conventional 22.4 litres per mole, at '
          + '0 °C and 1 atmosphere. Avogadro’s number is exact by definition and does not '
          + 'limit the significant figures of an answer.',
      }),
      el('p', {
        text:
          'Published physical constants are facts rather than anybody’s property. The rest '
          + 'of MoleBridge is licensed noncommercially: people may use it, nobody may sell it.',
      }),
    ]),

    section('If something is wrong', [
      el('p', {
        text:
          'Tell whoever set the work what problem you were on and what you typed. If MoleBridge '
          + 'said it could not explain your answer, that is worth reporting — it means the '
          + 'app has a gap, not that you did something strange.',
      }),
      el('p', { text: 'The diagnostic below is text. Copy it and send it as text; it is more use than a photograph of the screen.' }),
    ]),

    section('Accessibility', [
      el('p', {
        text:
          'MoleBridge is built to be worked entirely from a keyboard, and every control is '
          + 'sized to be pressed with a finger on a board at the front of a room. If '
          + 'something here cannot be reached the way you need to reach it, that is a defect '
          + 'and it should be reported.',
      }),
    ]),
  ];
}

/**
 * §7d: what changed, from one source. `releases.ts` is generated from
 * CHANGELOG.md and `npm run check` fails if the two have drifted, so the app
 * cannot show the notes for a release other than the one it is.
 */
function whatChanged(): HTMLElement {
  // THE NEWEST FEW, THEN A DOOR OUT. This rendered all of them, which by the
  // thirtieth release meant every section below it — where the chemistry comes
  // from, how to report a problem, the accessibility statement — sat under a
  // wall of patch notes nobody opened the panel to read. `/changes/` is part of
  // the app and cached with it, so the whole history is one tap away and
  // offline like the rest of it.
  const { notes, more } = forAPanel(RELEASES);
  return section('What changed', [
    ...notes.map((release) =>
      el('div', { className: 'release' }, [
        el('h4', { text: `${release.version} — ${release.kind.toLowerCase()}` }),
        ...release.paragraphs.map((paragraph) => el('p', { text: paragraph })),
      ]),
    ),
    el('p', {
      className: 'hint',
      text:
        more === 0
          ? 'Every release is on its own page.'
          : `${more} older ${more === 1 ? 'release' : 'releases'}, and these ones again, on one page.`,
    }),
    // Styled as a control rather than an inline anchor: 18px of text is under
    // the 44px a finger needs, which the accessibility gate said in exactly
    // those terms the first time this shipped as a link inside a sentence.
    el('a', {
      className: 'button button-small',
      text: 'Everything that has changed',
      attrs: { href: HISTORY_PATH },
    }),
  ]);
}

/**
 * §7f: the text report to send instead of a screenshot. Built on demand, not at
 * boot, because half of what it says — which worker is controlling the page,
 * what is in the caches — is only true at the moment it is asked for.
 */
function diagnosticSection(getSession: () => Session | null): HTMLElement {
  const output = el('pre', { className: 'diagnostic', attrs: { tabindex: '0', hidden: true } });
  const status = el('p', { className: 'hint', attrs: { role: 'status' } });

  const build = el('button', {
    className: 'button button-small',
    text: 'Show the diagnostic',
    attrs: { type: 'button' },
  });
  const copy = el('button', {
    className: 'button button-small button-quiet',
    text: 'Copy it',
    attrs: { type: 'button', hidden: true },
  });

  build.addEventListener('click', () => {
    void (async () => {
      output.textContent = await buildDiagnostic(new Date().toISOString(), factsFrom(getSession()));
      output.hidden = false;
      copy.hidden = false;
      status.textContent = 'Send this as text. It says more than a photograph of the screen.';
    })();
  });

  copy.addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(output.textContent ?? '');
        status.textContent = 'Copied.';
      } catch {
        status.textContent = 'Copying is blocked here. Select the text above and copy it by hand.';
      }
    })();
  });

  return section('Diagnostic', [
    el('p', {
      text:
        'If something is wrong, this is what to send. It is text rather than a picture, '
        + 'it carries no answers and no name, and it says which build you are actually '
        + 'running — which a screenshot cannot.',
    }),
    el('div', { className: 'choices' }, [build, copy]),
    status,
    output,
  ]);
}

function section(title: string, body: readonly HTMLElement[]): HTMLElement {
  return el('section', { className: 'info-section' }, [el('h3', { text: title }), ...body]);
}

function list(items: readonly string[]): HTMLElement {
  return el('ul', {}, items.map((item) => el('li', { text: item })));
}
