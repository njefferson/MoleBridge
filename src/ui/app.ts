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

  const welcome = need('#screen-welcome');
  const setup = need('#screen-setup');
  const work = need('#screen-work');
  const done = need('#screen-done');
  const screens = [welcome, setup, work, done];

  let session: Session | null = null;

  const updates = mountUpdates();
  const info = mountInfo(() => session, updates);
  mountTheme();

  const doneScreen = mountDone(systemClock, {
    onRestart(): void {
      session = null;
      showOnly(screens, setup);
      need<HTMLInputElement>('#setup-roster').focus();
    },
  });

  const workScreen = mountWork(systemClock, {
    onFinished(finished: Session): void {
      session = finished;
      doneScreen.show(finished);
      showOnly(screens, done);
      need('#done-code').focus();
    },
  });

  mountSetup({
    onStart(config: SessionConfig): void {
      session = startSession(config, systemClock);
      showOnly(screens, work);
      workScreen.begin(session);
    },
  });

  need<HTMLButtonElement>('#welcome-begin').addEventListener('click', () => {
    // The move, once, on the way past. From here the orientation lives behind
    // the ⓘ and there is only ever one of it.
    info.adoptOrientation();
    showOnly(screens, setup);
    need<HTMLInputElement>('#setup-roster').focus();
  });

  // A returning reader has already had the orientation, so the app opens on
  // setup and the explanation waits behind the ⓘ where they left it.
  if (info.hasBeenSeen()) {
    info.adoptOrientation();
    showOnly(screens, setup);
  } else {
    showOnly(screens, welcome);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
