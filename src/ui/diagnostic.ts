/**
 * diagnostic.ts — the text report to ask for instead of a screenshot.
 *
 * Doctrine §7f. A screenshot shows what the screen looked like and hides
 * everything that would explain it: which build is running, whether the service
 * worker handed over a stale shell, whether the device is what its user agent
 * claims. Text can be pasted into a message and read by somebody who was not
 * there.
 *
 * IT CARRIES WHAT THE BROWSER STRING HIDES. iPadOS Safari reports itself as
 * macOS, so the user agent alone cannot tell an iPad from a Mac — and the two
 * behave differently enough that the distinction decides where to look.
 * `maxTouchPoints` is what actually answers it, so it is in the report.
 *
 * WHAT IT NEVER CARRIES: anything the student typed as an ANSWER. The
 * assignment key, the set and the problem number are here because without them
 * a fault cannot be reproduced, and none of them is about a person. No answer,
 * no working, and there has never been a name to leave out.
 */

import { VERSION } from '../version.ts';
import type { Session } from '../engine/steps.ts';

/** What the report needs to know about the session, if there is one. */
export interface SessionFacts {
  readonly assignmentKey: string;
  readonly tier: number;
  readonly rosterId: number;
  readonly problemIndex: number;
  readonly stageIndex: number;
  readonly attempted: number;
  readonly firstTryCorrect: number;
  readonly unclassified: number;
  readonly collisions: number;
}

/** Pull the reproducible facts out of a session. Never an answer. */
export function factsFrom(session: Session | null): SessionFacts | null {
  if (session === null) return null;
  return {
    assignmentKey: session.config.assignmentKey,
    tier: session.config.tier,
    rosterId: session.config.rosterId,
    problemIndex: session.problemIndex,
    stageIndex: session.stageIndex,
    attempted: session.attempted,
    firstTryCorrect: session.firstTryCorrect,
    unclassified: session.unclassified,
    collisions: session.collisions,
  };
}

/**
 * Build the report.
 *
 * PRECONDITION: running in a browser. `nowIso` is passed in rather than read,
 * so the report is reproducible in a test.
 */
export async function buildDiagnostic(nowIso: string, facts: SessionFacts | null): Promise<string> {
  const lines: string[] = [];
  const say = (label: string, value: string | number | boolean): void => {
    lines.push(`${label}: ${String(value)}`);
  };

  lines.push('MoleBridge diagnostic');
  lines.push('');
  say('version', VERSION);
  say('taken at', nowIso);
  lines.push('');

  lines.push('device');
  say('  user agent', navigator.userAgent);
  // The line that tells an iPad from a Mac when the user agent will not.
  say('  maxTouchPoints', navigator.maxTouchPoints);
  say('  platform', (navigator as { platform?: string }).platform ?? 'not reported');
  say('  languages', navigator.languages.join(', '));
  say('  screen', `${screen.width}x${screen.height} at ${devicePixelRatio}x`);
  say('  viewport', `${innerWidth}x${innerHeight}`);
  say('  colour scheme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  say('  reduced motion', matchMedia('(prefers-reduced-motion: reduce)').matches);
  say('  online', navigator.onLine);
  lines.push('');

  lines.push('offline shell');
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration === undefined) {
      say('  service worker', 'not registered');
    } else {
      say('  installed', registration.active !== null);
      say('  controlling this page', navigator.serviceWorker.controller !== null);
      // §7h: a worker WAITING is the whole reason a reader can be on a stale
      // build while the new one sits there, so the report says so outright.
      say('  a new version is waiting', registration.waiting !== null);
      say('  a new version is installing', registration.installing !== null);
    }
  } else {
    say('  service worker', 'not supported by this browser');
  }
  try {
    const names = await caches.keys();
    say('  caches', names.length === 0 ? 'none' : names.join(', '));
  } catch {
    say('  caches', 'cannot be read on this device');
  }
  try {
    localStorage.setItem('molebridge.probe', '1');
    localStorage.removeItem('molebridge.probe');
    say('  site storage', 'available');
  } catch {
    say('  site storage', 'blocked — the welcome screen will show every time');
  }
  lines.push('');

  lines.push('session');
  if (facts === null) {
    say('  state', 'no session running');
  } else {
    say('  assignment key', facts.assignmentKey);
    say('  set', facts.tier);
    say('  roster number', facts.rosterId);
    say('  on problem', facts.problemIndex + 1);
    say('  on step', facts.stageIndex + 1);
    say('  finished', facts.attempted);
    say('  first try', facts.firstTryCorrect);
    say('  answers MoleBridge could not explain', facts.unclassified);
    say('  entries that matched two explanations', facts.collisions);
  }
  lines.push('');
  lines.push('This report contains no answers and no name.');

  return lines.join('\n');
}
