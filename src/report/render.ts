/**
 * render.ts — turning facts into the report, with no browser anywhere near it.
 *
 * ## Why this is separate from `diagnostic.ts`
 *
 * Two jobs were in one function: GATHERING facts from the browser, and DECIDING
 * what the report says. Only the second one carries the promise printed under
 * it — that a student can paste this into a message and it contains nothing
 * about them — and only the second one is worth testing.
 *
 * Together, testing that promise meant stubbing `navigator`, `caches`,
 * `matchMedia` and `localStorage`, which is a lot of scaffolding standing
 * between a test and the sentence it is checking. Worse, a stub is a guess
 * about a browser: it passes when the guess is right rather than when the code
 * is. Split, the decision is a pure function over plain data and the test needs
 * nothing at all.
 *
 * ## THE ROSTER NUMBER IS NOT A FIELD HERE
 *
 * Not omitted from the output — absent from the type. A report that carried it
 * would have to be a different shape, which is a stronger guarantee than
 * remembering not to print something that is sitting right there.
 */

/** What the browser said about itself. Gathered elsewhere, decided here. */
export interface DeviceFacts {
  readonly userAgent: string;
  /** The line that tells an iPad from a Mac when the user agent will not. */
  readonly maxTouchPoints: number;
  readonly platform: string;
  readonly languages: string;
  readonly screen: string;
  readonly viewport: string;
  readonly colourScheme: string;
  readonly reducedMotion: boolean;
  readonly online: boolean;
  readonly theme: string;
  readonly palette: string;
}

/** What the offline shell is doing. */
export interface ShellFacts {
  readonly serviceWorker: string;
  readonly newVersionWaiting: boolean | null;
  readonly caches: string;
  readonly siteStorage: string;
}

/**
 * Where the student is, if anywhere.
 *
 * NOTE WHAT IS NOT ON THIS TYPE: the roster number, anything typed as an
 * answer, and any working. The key, the set, the problem and the step are what
 * make a fault reproducible; none of them says which person hit it.
 */
export interface WhereFacts {
  readonly assignmentKey: string;
  readonly tier: number;
  readonly mode: string;
  readonly problemNumber: number;
  readonly stepNumber: number;
  readonly finished: number;
  readonly firstTry: number;
  readonly unexplained: number;
}

export interface ReportInput {
  readonly version: string;
  readonly takenAt: string;
  /** The chosen symptom's tag, or null before one is picked. */
  readonly symptom: string | null;
  readonly device: DeviceFacts;
  readonly shell: ShellFacts;
  readonly where: WhereFacts | null;
}

/** The exact text a student copies. */
export function renderReport(input: ReportInput): string {
  const lines: string[] = [];
  const say = (label: string, value: string | number | boolean): void => {
    lines.push(`${label}: ${String(value)}`);
  };

  lines.push('MoleBridge problem report');
  lines.push('');
  say('what went wrong', input.symptom ?? '(not chosen)');
  say('version', input.version);
  say('taken at', input.takenAt);
  lines.push('');

  lines.push('device');
  say('  user agent', input.device.userAgent);
  say('  maxTouchPoints', input.device.maxTouchPoints);
  say('  platform', input.device.platform);
  say('  languages', input.device.languages);
  say('  screen', input.device.screen);
  say('  viewport', input.device.viewport);
  say('  colour scheme', input.device.colourScheme);
  say('  reduced motion', input.device.reducedMotion);
  say('  online', input.device.online);
  say('  theme', `${input.device.palette} / ${input.device.theme}`);
  lines.push('');

  lines.push('offline shell');
  say('  service worker', input.shell.serviceWorker);
  if (input.shell.newVersionWaiting !== null) {
    say('  a new version is waiting', input.shell.newVersionWaiting);
  }
  say('  caches', input.shell.caches);
  say('  site storage', input.shell.siteStorage);
  lines.push('');

  lines.push('where');
  if (input.where === null) {
    say('  state', 'not in a problem');
  } else {
    say('  doing', input.where.mode);
    say('  problem set', input.where.assignmentKey);
    say('  set', input.where.tier);
    say('  on problem', input.where.problemNumber);
    say('  on step', input.where.stepNumber);
    say('  finished so far', input.where.finished);
    say('  right first time', input.where.firstTry);
    say('  answers MoleBridge could not explain', input.where.unexplained);
  }
  lines.push('');

  // SAID AS WHAT IS ACTUALLY IN IT. An earlier version of this said "no answers
  // and no name", which was true and was narrower than a reader would take it:
  // it carried the roster number, which is not a name and IS the identifier
  // this app is built around.
  lines.push('What this report contains: which version is running, what this device is,');
  lines.push('whether the app is up to date, and — if you are in a problem — which problem');
  lines.push('set and which step you are on.');
  lines.push('');
  lines.push('What it does NOT contain: your name, your roster number, anything you typed');
  lines.push('as an answer, and any working. There is nowhere in MoleBridge to type a name,');
  lines.push('and this report has no box for you to write in — so there is nothing in it');
  lines.push('about you.');

  return lines.join('\n');
}
