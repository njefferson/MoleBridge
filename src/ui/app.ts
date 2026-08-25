/**
 * app.ts — boot, and which screen is on.
 *
 * THE INJECTED CLOCK LIVES HERE. Everything under `src/engine` and `src/code`
 * is forbidden a clock so that its behaviour can be tested; this is the one
 * place that knows what time it is, and it hands that in.
 *
 * THE ORIENTATION IS MOVED, NEVER COPIED (Doctrine §7e). The block a first-time
 * reader sees is the same DOM node that afterwards lives behind the ⓘ. Copying
 * it would mean two versions of the same explanation, and the one behind the ⓘ
 * is the one that stops being updated.
 */

import { need, showOnly } from './dom.ts';
import { mountSetup } from './setup.ts';
import { mountPractice } from './practice.ts';
import { mountLearn } from './learn.ts';
import { mountReference } from './reference.ts';
import { mountCalculator } from './calculator.ts';
import { mountTable } from './table.ts';
import { mountReport } from './report.ts';
import { factsFrom } from './diagnostic.ts';
import { mountWork } from './work.ts';
import { mountDone } from './done.ts';
import { mountInfo } from './info.ts';
import { mountTheme } from './theme.ts';
import { mountUpdates } from './updates.ts';
import { VERSION } from '../version.ts';
import { startSession, type Clock, type Session, type SessionConfig } from '../engine/steps.ts';

/** The real clock. The only one in the repository. */
const systemClock: Clock = { now: () => Date.now() };

/**
 * Start the app.
 *
 * PRECONDITION: the document is parsed and contains every hook the screens
 * need. THROWS at boot if one is missing, which is a build mistake and is
 * better shouted about than worked around.
 */
function boot(): void {
  // §7b: written at BOOT, not when a panel opens. The first attempt at this
  // rule elsewhere set the stamp inside an About handler, so it was blank until
  // somebody opened About — useless in exactly the unplanned screenshot the
  // rule exists for.
  need('#build-stamp').textContent = VERSION;

  const welcomePanel = need<HTMLDialogElement>('#welcome-panel');
  const home = need('#screen-home');
  const practice = need('#screen-practice');
  const learn = need('#screen-learn');
  const lesson = need('#screen-lesson');
  const setup = need('#screen-setup');
  const work = need('#screen-work');
  const done = need('#screen-done');
  const screens = [home, learn, lesson, practice, setup, work, done];

  let session: Session | null = null;

  const periodicTable = mountTable();
  need<HTMLButtonElement>('#table-open').addEventListener('click', () => {
    periodicTable.open();
  });

  const calculator = mountCalculator();
  need<HTMLButtonElement>('#calc-open').addEventListener('click', () => {
    calculator.open();
  });

  const updates = mountUpdates();
  const info = mountInfo(() => session, updates);
  mountTheme();

  // The report reads the LIVE session each time it opens, so it describes where
  // the student actually is rather than where they were at boot.
  mountReport(
    () => factsFrom(session),
    () => new Date(systemClock.now()).toISOString(),
  );

  const doneScreen = mountDone(systemClock, {
    onRestart(): void {
      session = null;
      showOnly(screens, setup);
      need<HTMLInputElement>('#setup-roster').focus();
    },
  });

  // Declared before the work screen, which needs to be able to open it, and
  // after nothing — it holds no reference to a session. `learnScreens` is
  // assigned below; the lesson link is only ever followed by a click, which
  // cannot happen before boot finishes.
  let learnScreens: ReturnType<typeof mountLearn> | null = null;
  const reference = mountReference({
    openLesson(index: number): void {
      learnScreens?.openByIndex(index);
    },
  });

  const workScreen = mountWork(systemClock, {
    onExplain(errorClass): void {
      reference.open(errorClass);
    },
    onFinished(finished: Session): void {
      session = finished;
      doneScreen.show(finished);
      showOnly(screens, done);
      need('#done-code').focus();
    },
  });

  // BOTH DOORS START A SESSION THE SAME WAY. The difference between practice
  // and an assignment is carried in the config and enforced in the engine, not
  // in two divergent code paths that could drift apart — a second `startSession`
  // call site is a second place for the mode to be got wrong.
  const begin = (config: SessionConfig): void => {
    session = startSession(config, systemClock);
    showOnly(screens, work);
    workScreen.begin(session);
  };

  mountSetup({ onStart: begin });
  mountPractice({
    onStart: begin,
    onBack(): void {
      showOnly(screens, home);
    },
  });

  learnScreens = mountLearn(
    {
      onBack(): void {
        showOnly(screens, home);
      },
      onReference(): void {
        reference.open();
      },
    },
    (screen) => {
      showOnly(screens, screen);
    },
  );

  need<HTMLButtonElement>('#door-learn').addEventListener('click', () => {
    showOnly(screens, learn);
  });
  need<HTMLButtonElement>('#door-practice').addEventListener('click', () => {
    showOnly(screens, practice);
    need<HTMLInputElement>('#practice-seed').focus();
  });
  need<HTMLButtonElement>('#door-assignment').addEventListener('click', () => {
    showOnly(screens, setup);
    need<HTMLInputElement>('#setup-roster').focus();
  });

  // THE MOVE HAPPENS ON `close`, NOT ON THE BUTTON. A dialog can also be
  // dismissed with Escape or by the backdrop, and §7e's requirement is that the
  // orientation survives whatever the reader presses to begin — so every route
  // out of this panel goes through one place.
  welcomePanel.addEventListener('close', () => {
    info.adoptOrientation();
    need<HTMLButtonElement>('#door-practice').focus();
  });
  need<HTMLButtonElement>('#welcome-begin').addEventListener('click', () => {
    welcomePanel.close();
  });

  // The app opens on SETUP either way, with the orientation laid over it on a
  // first run. Behind a modal there is still an app to see, which answers "what
  // is this" better than a page of prose in front of it does.
  showOnly(screens, home);
  if (info.hasBeenSeen()) {
    info.adoptOrientation();
  } else {
    welcomePanel.showModal();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
