/**
 * done.ts — the completion code, and what it says.
 *
 * The code is retyped BY HAND into a Canvas text box, from a Chromebook screen,
 * by somebody in a hurry at the end of a lesson. So it is large, grouped as the
 * specification requires, selectable, and copyable in one press — and the
 * failure of the copy is reported rather than swallowed, because a silent
 * failure here means a student types nothing and thinks they have.
 *
 * WHAT IT SAYS ABOUT ITSELF matters as much as the code. A student handing in a
 * number ought to know what that number carries, and the honest answer — counts
 * only, no answers, no name — is short enough to print beside it.
 */

import { clear, el, fill, need } from './dom.ts';
import { encodeCompletionCode, totalStageErrors, type CompletionPayload } from '../code/codec.ts';
import { BUILD_SECRET } from '../code/secret.ts';
import { completionPayload, type Clock, type Session } from '../engine/steps.ts';

/** What the finished screen needs from whoever mounted it. */
export interface DoneHost {
  onRestart(): void;
}

/** The live finished screen. */
export interface DoneScreen {
  /** Show the code for a finished session. Returns the code, for the caller's records. */
  show(session: Session): string;
}

/**
 * Wire the finished screen up.
 *
 * PRECONDITION: the document contains the finished section's hooks, and `clock`
 * is the one the session ran on — the code carries a duration read from it.
 */
export function mountDone(clock: Clock, host: DoneHost): DoneScreen {
  const codeNode = need('#done-code');
  const summary = need('#done-summary');
  const copy = need<HTMLButtonElement>('#done-copy');
  const copyStatus = need('#done-copy-status');
  const restart = need<HTMLButtonElement>('#done-restart');
  const practiceNote = need('#done-practice');

  let shown = '';

  copy.addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(shown);
        copyStatus.textContent = 'Copied. Paste it into the Canvas assignment.';
      } catch {
        // Never claim a copy that did not happen: a student who believes the
        // code is on the clipboard pastes nothing and hands in nothing.
        copyStatus.textContent = 'Copying is blocked on this device. Select the code above and copy it by hand.';
      }
    })();
  });

  restart.addEventListener('click', () => host.onRestart());

  return {
    show(session: Session): string {
      // PRACTICE ENDS WITHOUT A CODE, and the screen says why rather than
      // leaving a blank where one used to be. `completionPayload` would throw
      // here, which is the wall doing its job — this branch exists so the wall
      // is never reached in normal use, not so the wall can be avoided.
      if (session.config.mode !== 'assignment') {
        shown = '';
        codeNode.textContent = '';
        codeNode.hidden = true;
        copy.hidden = true;
        copyStatus.textContent = '';
        practiceNote.hidden = false;
        practiceNote.textContent =
          `That was practice — ${session.attempted} ${session.attempted === 1 ? 'problem' : 'problems'}, ` +
          `set ${session.config.assignmentKey}. Nothing is handed in and nothing was recorded. ` +
          `Type that set name in again to get the same problems back.`;
        clear(summary);
        return '';
      }
      codeNode.hidden = false;
      copy.hidden = false;
      practiceNote.hidden = true;
      const payload = completionPayload(session, clock);
      shown = encodeCompletionCode(payload, BUILD_SECRET);
      codeNode.textContent = shown;
      copyStatus.textContent = '';
      fill(summary, summaryLines(payload).map((line) => el('li', { text: line })));
      return shown;
    },
  };
}

/** What the session amounted to, in the student's terms. */
function summaryLines(payload: CompletionPayload): string[] {
  const errors = totalStageErrors(payload);
  const lines = [
    `${payload.attempted} ${payload.attempted === 1 ? 'problem' : 'problems'} finished.`,
    `${payload.firstTryCorrect} of them with every step right first time.`,
  ];

  if (errors === 0) {
    lines.push('No steps went wrong.');
  } else {
    lines.push(`${errors} ${errors === 1 ? 'step' : 'steps'} went wrong along the way, spread as ${byStage(payload)}.`);
  }
  if (payload.algebraTriggers > 0) {
    lines.push(
      `${payload.algebraTriggers} ${payload.algebraTriggers === 1 ? 'time' : 'times'} the algebra help came up.`,
    );
  }
  if (payload.unclassified > 0) {
    // Said out loud rather than hidden: an answer MoleBridge could not account
    // for is a gap in MoleBridge, and the student should not read it as a gap
    // in themselves.
    lines.push(
      `${payload.unclassified} ${payload.unclassified === 1 ? 'answer' : 'answers'} MoleBridge could not explain. That is a limit of this app, not of your working.`,
    );
  }
  lines.push(`About ${payload.durationMin} ${payload.durationMin === 1 ? 'minute' : 'minutes'}.`);
  return lines;
}

/** Which steps went wrong, named the way the app names them on screen. */
function byStage(payload: CompletionPayload): string {
  const named: Array<readonly [string, number]> = [
    ['balancing', payload.errS1],
    ['molar mass', payload.errS2],
    ['moles', payload.errS3],
    ['the mole ratio', payload.errS4],
    ['moles made', payload.errS5],
    ['the final conversion', payload.errS6],
  ];
  const hit = named.filter(([, count]) => count > 0).map(([name, count]) => `${count} at ${name}`);
  if (hit.length === 0) return 'nothing in particular';
  if (hit.length === 1) return hit[0] as string;
  return `${hit.slice(0, -1).join(', ')} and ${hit[hit.length - 1] as string}`;
}
