/**
 * drill.ts — the screen for practising one step.
 *
 * ## What is deliberately absent
 *
 * No score. No streak. No target. No congratulation. A student who needs twenty
 * of these is the student most harmed by an app that makes stopping feel like
 * giving up, and the ones who most need to try something twenty times are
 * usually the ones who have been told longest that they are bad at it.
 *
 * So: each answer gets the same attribution it would get anywhere else, and
 * nothing more. The run ends when they say. `drill.test.ts` holds this over the
 * source of both files, because it is the kind of rule a later session undoes in
 * one well-meaning commit.
 *
 * ## Reuses the work screen's own controls
 *
 * `renderInputs` and `readEntryFrom` come from `work.ts`. A second renderer
 * would be a second place for the rule about what a student may see before
 * answering to drift, and this shows the same stages to the same people.
 */

import { clear, el, fill, focusFirst, need } from './dom.ts';
import { renderInputs, readEntryFrom } from './work.ts';
import {
  DRILLABLE,
  drillItem,
  judge,
  shouldSaySomething,
  summarise,
  type DrillAnswer,
  type DrillItem,
  type Drillable,
} from '../learn/drill.ts';
import { entryFor } from '../learn/reference.ts';
import { recordError } from '../learn/store.ts';
import { revealValueFor } from '../engine/steps.ts';
import type { ErrorClass } from '../engine/taxonomy.ts';

export interface DrillHost {
  onBack(): void;
  /** Open the reference at a class, for the "what does this mean" route. */
  onExplain(errorClass: ErrorClass): void;
}

export interface DrillScreens {
  readonly chooser: HTMLElement;
  readonly running: HTMLElement;
  /** Start a drill on a named step, from anywhere that knows the student needs it. */
  start(stageId: string): void;
  refresh(): void;
}

export function mountDrill(host: DrillHost, show: (screen: HTMLElement) => void): DrillScreens {
  const chooser = need('#screen-drill-pick');
  const running = need('#screen-drill');
  const list = need('#drill-list');

  const title = need('#drill-title');
  const what = need('#drill-what');
  const question = need('#drill-question');
  const inputs = need('#drill-inputs');
  const feedback = need('#drill-feedback');
  const noticed = need('#drill-noticed');
  const summary = need('#drill-summary');

  let drillable: Drillable | null = null;
  let item: DrillItem | null = null;
  let index = 0;
  let seed = 'DRILL';
  let answers: DrillAnswer[] = [];
  let answered = false;

  fill(
    list,
    DRILLABLE.map((step) =>
      el('li', {}, [
        el('button', { className: 'lesson-row drill-row', attrs: { type: 'button', 'data-drill': step.stageId } }, [
          el('span', { className: 'lesson-name', text: step.name }),
          el('span', { className: 'lesson-promise', text: step.what }),
        ]),
      ]),
    ),
  );

  const paint = (): void => {
    if (drillable === null) return;
    item = drillItem(drillable, seed, index);
    answered = false;
    clear(feedback);
    if (item === null) {
      // Never an empty screen. If a step stops being generated that is a
      // generator change, and a student should be told rather than left staring.
      question.textContent = 'MoleBridge could not make one of these. Please report it with the ⚑ button.';
      clear(inputs);
      return;
    }
    question.textContent = item.stage.prompt;
    renderInputs(inputs, item.problem, item.stage);
    focusFirst(inputs.querySelector<HTMLElement>('input, button'));
  };

  // CHOICE stages are buttons rather than a field, so the screen has to hold
  // which one is picked. Delegated, because they are rebuilt every question.
  inputs.addEventListener('click', (event) => {
    const picked = (event.target as HTMLElement).closest<HTMLElement>('[data-species]');
    if (picked === null) return;
    for (const button of inputs.querySelectorAll<HTMLElement>('[data-species]')) {
      button.setAttribute('aria-checked', String(button === picked));
      button.classList.toggle('choice-on', button === picked);
    }
  });

  const check = (): void => {
    if (item === null || drillable === null || answered) return;
    const entry = readEntryFrom(inputs, item.stage);
    if (entry === null) {
      fill(feedback, [el('p', { className: 'note', text: 'Have a go first — there is nothing to check yet.' })]);
      return;
    }
    answered = true;
    const verdict = judge(item, entry);
    const errorClass = verdict.errorClass;
    answers = [...answers, { right: verdict.correct, errorClass }];

    if (verdict.correct) {
      // Said once, plainly. Not "well done" — the app has no standing to be
      // pleased with anybody, and a student can tell.
      fill(feedback, [el('p', { className: 'note note-good', text: 'That is right.' })]);
    } else {
      const shown = revealValueFor(item.problem, item.solution, item.stage);
      const children: HTMLElement[] = [el('p', { className: 'note note-wrong', text: 'Not that one.' })];
      if (verdict.why !== '') children.push(el('p', { className: 'why', text: sentence(verdict.why) }));
      if (shown !== null) {
        children.push(
          el('p', {
            className: 'reveal',
            text:
              shown.sigFigs === null
                ? `It is ${withUnit(shown.shown, shown.unit)}.`
                : `It is ${withUnit(shown.shown, shown.unit)}, to ${shown.sigFigs} significant figures.`,
          }),
        );
      }
      if (errorClass !== null && entryFor(errorClass) !== undefined) {
        children.push(
          el('button', {
            className: 'button-small explain',
            text: 'What does this mean?',
            attrs: { type: 'button', 'data-explain': errorClass },
          }),
        );
      }
      fill(feedback, children);
      if (errorClass !== null) recordError(errorClass);
    }

    /*
      THE ONE THING SAID ACROSS ANSWERS, and only once per run per mistake. A
      third occurrence is a pattern rather than a slip, and naming it is the
      difference between marking and coaching. Repeating it would be nagging.
    */
    if (errorClass !== null && shouldSaySomething(answers, errorClass)) {
      const page = entryFor(errorClass);
      noticed.hidden = false;
      noticed.textContent =
        page === undefined
          ? 'That has come up a few times now.'
          : `That is the third time: ${page.called.toLowerCase()}. ${page.tell}`;
    }
  };

  need<HTMLButtonElement>('#drill-check').addEventListener('click', check);
  need<HTMLButtonElement>('#drill-next').addEventListener('click', () => {
    index += 1;
    paint();
  });

  feedback.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-explain]');
    if (button === null) return;
    host.onExplain(button.dataset['explain'] as ErrorClass);
  });

  const finish = (): void => {
    const said = summarise(answers);
    const lines: string[] = [];
    if (said.answered === 0) lines.push('You did not answer any. That is fine — nothing was recorded.');
    else {
      /*
        THE ALL-WRONG CASE IS WRITTEN SEPARATELY, because the general sentence
        renders it as "4 questions, and 0 of them were right" — which is
        accurate, lands hard, and is the exact reading the person doing twenty
        of these does not need. "None of them came out right yet" is the same
        fact without the zero in it, and `yet` is true rather than kind.
      */
      if (said.right === 0) {
        lines.push(
          `You did ${said.answered}. None of them came out right yet.`,
        );
      } else {
        lines.push(
          `${said.answered} ${said.answered === 1 ? 'question' : 'questions'}, and ${
            said.right === said.answered
              ? 'every one of them was right'
              : `${said.right} of them ${said.right === 1 ? 'was' : 'were'} right`
          }.`,
        );
      }
      if (said.repeated !== null) {
        const page = entryFor(said.repeated as ErrorClass);
        const name = page === undefined ? 'the same mistake' : page.called.toLowerCase();
        lines.push(
          said.stoppedHappening
            ? `${name} came up ${said.repeatedTimes} times early on, and not once at the end.`
            : `${said.repeatedTimes} of them were ${name}. That is the one to look at.`,
        );
      }
    }
    // NO GRADE, NO NEXT TARGET, NOTHING TO COME BACK FOR. The run is over
    // because they said so, and the app has no opinion about that.
    fill(summary, lines.map((line) => el('p', { text: line })));
    summary.hidden = false;
  };

  need<HTMLButtonElement>('#drill-stop').addEventListener('click', () => {
    finish();
  });
  need<HTMLButtonElement>('#drill-done').addEventListener('click', () => {
    host.onBack();
  });
  need<HTMLButtonElement>('#drill-pick-back').addEventListener('click', () => {
    host.onBack();
  });

  const begin = (stageId: string): void => {
    const found = DRILLABLE.find((step) => step.stageId === stageId);
    if (found === undefined) return;
    drillable = found;
    index = 0;
    answers = [];
    seed = `DRILL-${stageId}`;
    title.textContent = found.name;
    what.textContent = found.what;
    noticed.hidden = true;
    noticed.textContent = '';
    summary.hidden = true;
    clear(summary);
    paint();
    show(running);
  };

  list.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-drill]');
    if (button === null) return;
    begin(button.dataset['drill'] ?? '');
  });

  return {
    chooser,
    running,
    start: begin,
    refresh(): void {
      /* The chooser is static — every step is always available to drill. */
    },
  };
}

const withUnit = (text: string, unit: string | null): string => (unit === null ? text : `${text} ${unit}`);

/** A diagnosis, written as a sentence. */
function sentence(text: string): string {
  if (text.length === 0) return text;
  const capitalised = `${(text[0] ?? '').toUpperCase()}${text.slice(1)}`;
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}
