/**
 * report.ts — a student says something is wrong, in two taps.
 *
 * ## No free-text box, and that is the design rather than an omission
 *
 * "Describe what happened" is the obvious field, and it is the one thing that
 * would turn "this contains nothing about you" from a fact about what the app
 * collects into a promise about what a student typed. Somebody would put their
 * name in it. Somebody always does — and the assurance printed underneath would
 * then be false for exactly the person it was written to reassure.
 *
 * So the symptom is CHOSEN from a list and everything else is generated from
 * what the app already knows about itself. The report is then checkable, and
 * `report.test.ts` checks it: no name, no roster number, no answer, no working.
 *
 * ## Reachable from every screen
 *
 * The control sits in the chrome beside the ⓘ rather than inside it. A report
 * form buried two taps deep is a report nobody files: a fifteen-year-old who
 * hits a fault closes the tab and tells nobody, and the fault survives to meet
 * the next thirty of them.
 */

import { el, fill, need } from './dom.ts';
import { VERSION } from '../version.ts';
import type { SessionFacts } from './diagnostic.ts';
import { SYMPTOMS } from '../report/symptoms.ts';
import { renderReport, type ReportInput } from '../report/render.ts';


export interface ReportPanel {
  /** Re-read the session so the report reflects where the student actually is. */
  refresh(): void;
}

/**
 * Wire the report panel up.
 *
 * PRECONDITION: the document contains the panel and its hooks.
 */
export function mountReport(
  getFacts: () => SessionFacts | null,
  /** When it is, injected — nothing in this repository reads a bare clock. */
  nowIso: () => string,
): ReportPanel {
  const panel = need<HTMLDialogElement>('#report-panel');
  const open = need<HTMLButtonElement>('#report-open');
  const close = need<HTMLButtonElement>('#report-close');
  const what = need('#report-what');
  const body = need('#report-body');
  const copyStatus = need('#report-copy-status');

  let chosen: string | null = null;

  fill(
    what,
    SYMPTOMS.map((symptom) => {
      const label = el('label', { className: 'choice' });
      const input = el('input', {
        attrs: { type: 'radio', name: 'molebridge-symptom', value: symptom.tag },
      });
      label.append(input, document.createTextNode(` ${symptom.said}`));
      return label;
    }),
  );

  /**
   * GATHERING, which is all this does. What the report SAYS is decided by
   * `renderReport`, which has no browser in it and is what the test checks —
   * the promise printed under the report is carried entirely by that function.
   */
  const paint = (): void => {
    void (async () => {
      const facts = getFacts();
      const root = document.documentElement;

      let serviceWorker = 'not supported by this browser';
      let waiting: boolean | null = null;
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration === undefined) serviceWorker = 'not registered';
        else {
          serviceWorker =
            navigator.serviceWorker.controller !== null
              ? 'installed and controlling this page'
              : 'installed but not controlling this page';
          // §7h: a worker WAITING is the whole reason somebody can be on a
          // stale build while the new one sits there, so it is said outright.
          waiting = registration.waiting !== null;
        }
      }

      let caches_ = 'cannot be read on this device';
      try {
        const names = await caches.keys();
        caches_ = names.length === 0 ? 'none' : names.join(', ');
      } catch {
        /* Left as the sentence above. */
      }

      let siteStorage = 'blocked — nothing can be remembered on this device';
      try {
        localStorage.setItem('molebridge.probe', '1');
        localStorage.removeItem('molebridge.probe');
        siteStorage = 'available';
      } catch {
        /* Left as the sentence above. */
      }

      const input: ReportInput = {
        version: VERSION,
        takenAt: nowIso(),
        symptom: chosen,
        device: {
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints,
          platform: (navigator as { platform?: string }).platform ?? 'not reported',
          languages: navigator.languages.join(', '),
          screen: `${screen.width}x${screen.height} at ${devicePixelRatio}x`,
          viewport: `${innerWidth}x${innerHeight}`,
          colourScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          online: navigator.onLine,
          theme: root.getAttribute('data-theme') ?? 'unknown',
          palette: root.getAttribute('data-palette') ?? 'unknown',
        },
        shell: { serviceWorker, newVersionWaiting: waiting, caches: caches_, siteStorage },
        // The roster number is not carried across, and there is nowhere on
        // `ReportInput` to put it even if somebody tried.
        where:
          facts === null
            ? null
            : {
                assignmentKey: facts.assignmentKey,
                tier: facts.tier,
                mode: 'working a problem',
                problemNumber: facts.problemIndex + 1,
                stepNumber: facts.stageIndex + 1,
                finished: facts.attempted,
                firstTry: facts.firstTryCorrect,
                unexplained: facts.unclassified,
              },
      };
      body.textContent = renderReport(input);
    })();
  };

  what.addEventListener('change', () => {
    const picked = what.querySelector<HTMLInputElement>('input:checked');
    chosen = picked === null ? null : picked.value;
    paint();
  });

  open.addEventListener('click', () => {
    // Repainted on every open rather than once at boot: the useful facts are
    // which problem and step the student is on, and a report built at load time
    // would describe a session that had not started.
    paint();
    panel.showModal();
  });
  close.addEventListener('click', () => {
    panel.close();
  });

  need<HTMLButtonElement>('#report-copy').addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(body.textContent ?? '');
        copyStatus.textContent = 'Copied. Paste it into a message to your teacher.';
      } catch {
        // Writing to the clipboard needs no permission, but a browser can still
        // refuse — and a button that silently does nothing reads as the app
        // being broken rather than the clipboard being unavailable.
        copyStatus.textContent =
          'Could not copy it. Select the report above and copy it by hand instead.';
      }
    })();
  });

  paint();
  return { refresh: paint };
}
