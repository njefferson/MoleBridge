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
import { isSavedSession, isWorthResuming, RESUME_KEY, type SavedSession } from '../engine/resume.ts';
import { mountSetup } from './setup.ts';
import { mountPractice } from './practice.ts';
import { warmupFrom } from './warmup.ts';
import { mountLearn } from './learn.ts';
import { mountReference } from './reference.ts';
import { mountDrill } from './drill.ts';
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
import { resumeSession, startSession, type Clock, type Session, type SessionConfig } from '../engine/steps.ts';

/**
 * The first door on the home screen, and the one focus lands on.
 *
 * NAMED ONCE rather than written at each of the two places that focus it. The
 * order changed — learning first, practice second — and a hard-coded
 * `#door-practice` in two handlers is two chances to leave focus in the middle
 * of the menu after the order moves again.
 */
const FIRST_DOOR = '#door-learn';

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
  const drillPick = need('#screen-drill-pick');
  const drillRun = need('#screen-drill');
  const practice = need('#screen-practice');
  const learn = need('#screen-learn');
  const lesson = need('#screen-lesson');
  const setup = need('#screen-setup');
  const work = need('#screen-work');
  const done = need('#screen-done');
  const screens = [home, learn, lesson, practice, setup, work, done, drillPick, drillRun];

  let session: Session | null = null;

  /*
    ---- THE WAY BACK TO A PROBLEM IN PROGRESS ----

    Every screen change goes through here, so the strip cannot be forgotten by
    whoever adds the next route off the work screen. That is the whole reason it
    is one wrapper rather than a button on the two screens that happened to
    strand somebody: following "the lesson on this" from a wrong answer left a
    live session, still holding everything typed into it, with no control
    anywhere that led back.
  */
  const resumeStrip = need('#resume-strip');
  const resumeMessage = need('#resume-message');

  /*
    ---- A SESSION SURVIVES THE TAB CLOSING ----

    Written on every change rather than on `beforeunload`: a tab killed by the
    operating system, a device that sleeps and never wakes the page, a lid shut
    at the bell — none of those fire an unload handler reliably, and the moment
    a save matters is the one nobody scheduled.

    Every touch of storage is guarded. A managed Chromebook can refuse it
    outright, and an app that throws on a device that will not remember things
    is worse than one that simply forgets.
  */
  const saveSession = (live: Session, entry: readonly string[]): void => {
    try {
      const saved: SavedSession = { saved: 1, session: live, atMs: systemClock.now(), entry: [...entry] };
      localStorage.setItem(RESUME_KEY, JSON.stringify(saved));
    } catch {
      /* A device that will not remember is a device that forgets. */
    }
  };

  const forgetSession = (): void => {
    try {
      localStorage.removeItem(RESUME_KEY);
    } catch {
      /* As above. */
    }
  };

  /** What was in the boxes when the tab closed, put back at the current stage. */
  let pendingEntry: readonly string[] = [];

  const readSaved = (): SavedSession | null => {
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      // STRICT. A shape this build does not recognise would put a student in
      // front of a problem it cannot grade, which is worse than starting again.
      if (!isSavedSession(parsed) || !isWorthResuming(parsed)) {
        forgetSession();
        return null;
      }
      return parsed;
    } catch {
      forgetSession();
      return null;
    }
  };

  const go = (screen: HTMLElement): void => {
    showOnly(screens, screen);
    const running = session !== null && !session.finished;
    resumeStrip.hidden = !running || screen === work;
    if (!resumeStrip.hidden && session !== null) {
      // NAMED, so it is obvious which thing is waiting. "You have a problem
      // open" beside a lesson about the same topic is ambiguous about whether
      // the app means this lesson's practice or the set you walked away from.
      resumeMessage.textContent =
        session.config.mode === 'assignment'
          ? `Your assignment ${session.config.assignmentKey} is still open, with your answers in it.`
          : `Your practice set ${session.config.assignmentKey} is still open, with your answers in it.`;
    }
  };

  need<HTMLButtonElement>('#resume-go').addEventListener('click', () => {
    go(work);
  });

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
      go(setup);
      need<HTMLInputElement>('#setup-roster').focus();
    },
  });

  // Declared before the work screen, which needs to be able to open it, and
  // after nothing — it holds no reference to a session. `learnScreens` is
  // assigned below; the lesson link is only ever followed by a click, which
  // cannot happen before boot finishes.
  let learnScreens: ReturnType<typeof mountLearn> | null = null;
  let drillScreens: ReturnType<typeof mountDrill> | null = null;
  const reference = mountReference({
    openLesson(index: number): void {
      learnScreens?.openByIndex(index);
    },
    /*
      THE ROUTE THAT MATTERS. A student reading the page about the mistake they
      just made is the one moment they are most likely to want twenty more of
      exactly that step — so the offer is there, rather than three screens away
      behind a menu they would have to know about.
    */
    openDrill(stageId: string): void {
      drillScreens?.start(stageId);
    },
  });

  drillScreens = mountDrill(
    {
      onBack(): void {
        go(home);
      },
      onExplain(errorClass): void {
        reference.open(errorClass);
      },
    },
    (screen) => {
      go(screen);
    },
  );

  const workScreen = mountWork(systemClock, {
    onExplain(errorClass): void {
      reference.open(errorClass);
    },
    onChanged(live: Session, entry: readonly string[]): void {
      saveSession(live, entry);
    },
    onLeave(): void {
      forgetSession();
      // The session is dropped rather than parked. Nothing here can resume a
      // half-finished set, and pretending otherwise by keeping it would make
      // the next `begin` ambiguous about which session it is starting.
      session = null;
      go(home);
      need<HTMLButtonElement>(FIRST_DOOR).focus();
    },
    onFinished(finished: Session): void {
      // A finished session is done with. Leaving it saved would drop the next
      // visit back onto a screen the student had already left behind.
      forgetSession();
      session = finished;
      doneScreen.show(finished);
      go(done);
      need('#done-code').focus();
    },
  });

  // BOTH DOORS START A SESSION THE SAME WAY. The difference between practice
  // and an assignment is carried in the config and enforced in the engine, not
  // in two divergent code paths that could drift apart — a second `startSession`
  // call site is a second place for the mode to be got wrong.
  const begin = (config: SessionConfig): void => {
    session = startSession(config, systemClock);
    go(work);
    workScreen.begin(session);
  };

  mountSetup({ onStart: begin });
  mountPractice({
    onStart: begin,
    onBack(): void {
      go(home);
    },
  });

  learnScreens = mountLearn(
    {
      onBack(): void {
        go(home);
      },
      onReference(): void {
        reference.open();
      },
      onDrill(): void {
        go(drillPick);
      },
    },
    (screen) => {
      go(screen);
    },
  );

  need<HTMLButtonElement>('#door-learn').addEventListener('click', () => {
    go(learn);
  });
  need<HTMLButtonElement>('#door-practice').addEventListener('click', () => {
    go(practice);
    need<HTMLInputElement>('#practice-seed').focus();
  });
  need<HTMLButtonElement>('#door-assignment').addEventListener('click', () => {
    go(setup);
    need<HTMLInputElement>('#setup-roster').focus();
  });

  // THE MOVE HAPPENS ON `close`, NOT ON THE BUTTON. A dialog can also be
  // dismissed with Escape or by the backdrop, and §7e's requirement is that the
  // orientation survives whatever the reader presses to begin — so every route
  // out of this panel goes through one place.
  welcomePanel.addEventListener('close', () => {
    info.adoptOrientation();
    need<HTMLButtonElement>(FIRST_DOOR).focus();
  });
  need<HTMLButtonElement>('#welcome-begin').addEventListener('click', () => {
    welcomePanel.close();
  });

  // The app opens on SETUP either way, with the orientation laid over it on a
  // first run. Behind a modal there is still an app to see, which answers "what
  // is this" better than a page of prose in front of it does.
  /*
    ---- OFFERED, NEVER FORCED ----

    A restored session lands the student on the HOME screen with the strip
    showing, not back inside the problem. Two reasons. A student who closed the
    tab may have meant to leave, and reopening straight into a half-finished set
    takes that choice away. And the strip is the control that already exists for
    exactly this — "you have a problem open, back to it" — so the way back from
    a reload is the same one as the way back from a lesson, learned once.
  */
  /*
    ---- A WARM-UP LINK BEATS EVERYTHING ELSE ----

    Checked before the saved session, deliberately. A teacher has just put a
    link on the board and twenty-eight students have opened it; if a half
    finished practice set from Friday were offered instead, every one of them
    would be looking at the wrong thing while she waits. Opening a warm-up link
    is an unambiguous instruction and it wins.

    The saved session is not thrown away — it is left in storage, so it is still
    offered the next time the app is opened without a link.
  */
  /*
    ALSO ON `hashchange`, and that is not a nicety.

    Navigating to a URL that differs only by its fragment is a SAME-DOCUMENT
    navigation: the page does not reload and `boot` does not run again. So a
    student who already has MoleBridge open — which after the first visit is
    most of them, because it is installed to a home screen — and then taps the
    link their teacher put in Classroom would get nothing at all. Everything
    would look fine to her, and it would work perfectly for whoever had a fresh
    tab, which is the worst kind of bug to be told about across a classroom.

    Found by the walk driving the link from a page that was already open.
  */
  const startWarmup = (config: SessionConfig): void => {
    info.adoptOrientation(false);
    begin(config);
    // The link is spent. Left in the address bar, a reload would restart the
    // warm-up from the beginning rather than resuming it, which is the one
    // thing a student who dropped their Chromebook does not need.
    history.replaceState(null, '', location.pathname + location.search);
  };

  window.addEventListener('hashchange', () => {
    const asked = warmupFrom(location.hash);
    if (asked !== null) startWarmup(asked);
  });

  const warmup = warmupFrom(location.hash);
  if (warmup !== null) {
    // §7e: the orientation MOVES into the ⓘ so it survives and stays reachable,
    // and is NOT marked as seen — nobody read it. The welcome still appears the
    // first time this student opens the app without a link.
    startWarmup(warmup);
    return;
  }

  const saved = readSaved();
  if (saved !== null) {
    session = resumeSession(saved.session, systemClock, saved.atMs);
    pendingEntry = saved.entry;
    workScreen.begin(session, pendingEntry);
  }

  go(home);
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
