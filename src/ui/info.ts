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

/** Remembers only that the orientation has been read. Nothing about anybody. */
const SEEN_KEY = 'molebridge.orientation.seen';

/** The live ⓘ panel. */
export interface InfoPanel {
  /** Move the orientation block out of the welcome screen and in here. */
  adoptOrientation(): void;
  /** True where this device has been past the welcome screen before. */
  hasBeenSeen(): boolean;
}

/**
 * Wire the ⓘ panel up.
 *
 * PRECONDITION: the document contains the panel and its hooks.
 */
export function mountInfo(): InfoPanel {
  const panel = need<HTMLDialogElement>('#info-panel');
  const open = need<HTMLButtonElement>('#info-open');
  const close = need<HTMLButtonElement>('#info-close');
  const slot = need('#info-orientation-slot');
  const sections = need('#info-sections');

  need('#info-version').textContent = VERSION;
  need('#info-offline').textContent = navigator.onLine
    ? 'Loaded and working; it will keep working with no connection.'
    : 'Working with no connection right now.';

  fill(sections, buildSections());

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
    adoptOrientation(): void {
      const orientation = document.querySelector('#orientation');
      if (orientation !== null && orientation.parentElement !== slot) slot.append(orientation);
      remember();
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
          'The molar volume of a gas is the conventional classroom 22.4 litres per mole, at '
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
          'Tell your teacher what problem you were on and what you typed. If MoleBridge '
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

function section(title: string, body: readonly HTMLElement[]): HTMLElement {
  return el('section', { className: 'info-section' }, [el('h3', { text: title }), ...body]);
}

function list(items: readonly string[]): HTMLElement {
  return el('ul', {}, items.map((item) => el('li', { text: item })));
}
