/**
 * work.ts — the screen where a problem gets worked.
 *
 * THE ONE RULE THIS FILE EXISTS TO KEEP: nothing the grader knows reaches the
 * page before the student has committed to the stage. `solve()` is called here
 * because grading needs it, and its output is rendered only in response to a
 * submission. There is no code path that draws a correct value into the
 * document ahead of an attempt.
 *
 * The units are TYPED, not chosen from a list. A dropdown would turn "which
 * unit is this step in" — which is the chemistry — into a guess between four
 * options, and would make E-UNIT-MISSING unreachable. The hint says a unit is
 * needed and does not say which.
 */

import { clear, el, fill, focusFirst, need } from './dom.ts';
import { solve, type Problem, type Solution } from '../engine/problem.ts';
import { stagesFor, type ErrorClass, type Stage, type StudentEntry } from '../engine/taxonomy.ts';
import {
  correctEntryFor,
  currentProblem,
  currentStage,
  submit,
  type Clock,
  type Session,
  type SubmitResult,
} from '../engine/steps.ts';

/** What the work screen needs from whoever mounted it. */
export interface WorkHost {
  /** Called with the finished session when the last stage of the last problem lands. */
  onFinished(session: Session): void;
  /**
   * Open the reference at the class just attributed.
   *
   * THE OTHER END OF THE DIAGNOSIS. Naming somebody's mistake and stopping
   * there tells a student who does not already know the vocabulary the name of
   * their problem and nothing else — which is the failure this app was built to
   * fix, reappearing one level up.
   */
  onExplain(errorClass: ErrorClass): void;
}

interface Elements {
  readonly progress: HTMLElement;
  readonly equation: HTMLElement;
  readonly prompt: HTMLElement;
  readonly figures: HTMLElement;
  readonly rail: HTMLElement;
  readonly form: HTMLFormElement;
  readonly stagePrompt: HTMLElement;
  readonly inputs: HTMLElement;
  readonly feedback: HTMLElement;
  /** Practice only. Hidden outright in an assignment rather than disabled. */
  readonly reveal: HTMLButtonElement;
  readonly revealed: HTMLElement;
}

/** The live work screen. */
export interface WorkScreen {
  /** Put a session on screen and take the first entry. */
  begin(session: Session): void;
}

/**
 * Wire the work screen up.
 *
 * PRECONDITION: the document contains the work section's hooks, and `clock` is
 * the same one the session was started with.
 */
export function mountWork(clock: Clock, host: WorkHost): WorkScreen {
  const nodes: Elements = {
    progress: need('#work-progress'),
    equation: need('#work-equation'),
    prompt: need('#work-prompt'),
    figures: need('#work-figures'),
    rail: need('#work-rail'),
    form: need<HTMLFormElement>('#work-form'),
    stagePrompt: need('#work-stage-prompt'),
    inputs: need('#work-inputs'),
    feedback: need('#work-feedback'),
    reveal: need<HTMLButtonElement>('#work-reveal'),
    revealed: need('#work-revealed'),
  };

  // Delegated, because the button is rebuilt with every verdict. One listener
  // that outlives the markup beats one attached per wrong answer and leaked.
  nodes.feedback.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-explain]');
    if (button === null) return;
    host.onExplain(button.dataset['explain'] as ErrorClass);
  });

  let session: Session | null = null;
  /** The species index a CHOICE stage currently has selected, or null. */
  let choice: number | null = null;

  const render = (): void => {
    if (session === null || session.finished) return;
    const problem = currentProblem(session);
    const stage = currentStage(session);
    const stages = stagesFor(problem);

    nodes.progress.textContent =
      `Problem ${session.problemIndex + 1} of ${session.config.problemCount}`;
    // The equation is STORED with an ASCII arrow because that is what a parser
    // reads; it is SHOWN with a real one, because that is what a chemist reads.
    nodes.equation.textContent = problem.equation.replace(/\s*->\s*/, ' → ');
    nodes.prompt.textContent = problem.prompt;
    nodes.figures.textContent =
      `Give the final answer to ${problem.answerSigFigs} significant figures.`;

    renderRail(nodes.rail, stages, session.stageIndex);
    nodes.stagePrompt.textContent = stage.prompt;
    choice = null;
    renderInputs(nodes.inputs, problem, stage);

    // THE REVEAL, and it resets at every stage. Asking to see one step's answer
    // is not asking to see the rest of the problem, and leaving the previous
    // one on screen would give away a stage the student had not asked about.
    nodes.revealed.hidden = true;
    nodes.revealed.textContent = '';
    nodes.reveal.hidden = session.config.mode !== 'practice';
    focusFirst(nodes.inputs.querySelector<HTMLElement>('input, button'));
  };

  /*
    PRACTICE ONLY, and the check is against the SESSION rather than against
    whether the button happens to be visible. A hidden control is a CSS fact; a
    graded session refusing to answer is a program fact, and the second one
    survives somebody styling the page differently.

    It shows one stage. `correctEntryFor` is the grader's own function, which is
    the point: what a student sees revealed is exactly what they would have been
    marked against, rather than a second rendering that could disagree with it.
  */
  nodes.reveal.addEventListener('click', () => {
    if (session === null || session.finished) return;
    if (session.config.mode !== 'practice') return;
    const problem = currentProblem(session);
    const stage = currentStage(session);
    const entry = correctEntryFor(problem, solve(problem), stage);
    nodes.revealed.textContent =
      entry.kind === 'text'
        ? `This step is ${entry.text}. Work out where it comes from before you move on.`
        : entry.kind === 'coefficients'
          ? `The coefficients are ${entry.values.join(', ')}. Check them against the atoms on each side.`
          : `The limiting reactant is the one numbered ${entry.speciesIndex + 1}. Work out why.`;
    nodes.revealed.hidden = false;
  });

  const readEntry = (problem: Problem, stage: Stage): StudentEntry | null => {
    if (stage.kind === 'COEFFICIENTS') {
      const fields = [...nodes.inputs.querySelectorAll<HTMLInputElement>('input')];
      if (fields.some((field) => field.value.trim() === '')) return null;
      return { kind: 'coefficients', values: fields.map((field) => Number(field.value.trim())) };
    }
    if (stage.kind === 'CHOICE') {
      return choice === null ? null : { kind: 'choice', speciesIndex: choice };
    }
    const field = nodes.inputs.querySelector<HTMLInputElement>('input');
    const text = field?.value.trim() ?? '';
    return text === '' ? null : { kind: 'text', text };
  };

  // A CHOICE stage is a radio group of buttons. Delegated, so the handler
  // survives every re-render rather than being rebound with the controls.
  nodes.inputs.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-species]');
    if (button === null || button === undefined) return;
    choice = Number(button.dataset['species']);
    for (const other of nodes.inputs.querySelectorAll<HTMLButtonElement>('button[data-species]')) {
      other.setAttribute('aria-checked', other === button ? 'true' : 'false');
      other.classList.toggle('choice-on', other === button);
    }
  });

  nodes.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (session === null || session.finished) return;

    const problem = currentProblem(session);
    const stage = currentStage(session);
    const entry = readEntry(problem, stage);
    if (entry === null) {
      showNudge(nodes.feedback, stage);
      return;
    }

    const result = submit(session, entry, clock);
    session = result.session;

    if (result.sessionComplete) {
      clear(nodes.feedback);
      host.onFinished(session);
      return;
    }
    if (result.advanced) {
      showAdvance(nodes.feedback, result, problem);
      render();
      return;
    }
    showWrong(nodes.feedback, result, solve(problem));
    const field = nodes.inputs.querySelector<HTMLInputElement>('input');
    if (field !== null) {
      field.select();
      focusFirst(field);
    }
  });

  return {
    begin(started: Session): void {
      session = started;
      clear(nodes.feedback);
      render();
    },
  };
}

/** The step list down the side, with what is done, what is here, what is next. */
function renderRail(rail: HTMLElement, stages: readonly Stage[], at: number): void {
  fill(
    rail,
    stages.map((stage, index) => {
      const state = index < at ? 'done' : index === at ? 'here' : 'ahead';
      const label = index < at ? 'done' : index === at ? 'you are here' : 'still to come';
      return el(
        'li',
        {
          className: `rail-step rail-${state}`,
          attrs: { 'aria-current': index === at ? 'step' : null },
        },
        [
          el('span', { className: 'rail-tick', text: index < at ? '✓' : '', attrs: { 'aria-hidden': 'true' } }),
          el('span', { className: 'rail-name', text: RAIL_NAMES[stage.id] ?? stage.id }),
          el('span', { className: 'visually-hidden', text: `, ${label}` }),
        ],
      );
    }),
  );
}

/** Short names for the rail — the stage prompts are far too long for it. */
const RAIL_NAMES: Readonly<Record<string, string>> = {
  S1: 'Balance',
  S2: 'Molar mass',
  S3: 'Moles',
  S3b: 'Moles of the other one',
  S4: 'Mole ratio',
  S4b: 'What the other one makes',
  S4c: 'Which runs out',
  S5: 'Moles made',
  S6: 'Convert',
  S7: 'Percent yield',
};

/** Draw the entry controls this stage needs. */
function renderInputs(host: HTMLElement, problem: Problem, stage: Stage): void {
  if (stage.kind === 'COEFFICIENTS') {
    fill(host, [
      el('p', { className: 'hint', text: 'One coefficient for every substance, including the ones that are 1.' }),
      el(
        'div',
        { className: 'coefficients' },
        problem.species.map((formula, index) => {
          const id = `coefficient-${index}`;
          return el('div', { className: 'coefficient' }, [
            el('label', { text: formula, attrs: { for: id } }),
            el('input', {
              attrs: {
                id,
                type: 'text',
                inputmode: 'numeric',
                autocomplete: 'off',
                'aria-label': `Coefficient in front of ${formula}`,
              },
            }),
          ]);
        }),
      ),
    ]);
    return;
  }

  if (stage.kind === 'CHOICE') {
    const reactants = problem.species.slice(0, problem.reactantCount);
    fill(host, [
      el(
        'div',
        { className: 'choices', attrs: { role: 'radiogroup', 'aria-label': stage.prompt } },
        reactants.map((formula, index) =>
          el('button', {
            className: 'choice',
            text: formula,
            attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-species': index },
          }),
        ),
      ),
    ]);
    return;
  }

  fill(host, [
    el('label', { className: 'visually-hidden', text: stage.prompt, attrs: { for: 'stage-answer' } }),
    el('input', {
      className: 'answer',
      attrs: {
        id: 'stage-answer',
        type: 'text',
        inputmode: 'text',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-describedby': 'stage-answer-hint',
      },
    }),
    el('p', {
      className: 'hint',
      text:
        stage.unit === 'none'
          ? 'Just the number for this one — it has no unit.'
          : 'Include the unit with your number.',
      attrs: { id: 'stage-answer-hint' },
    }),
  ]);
}

/** Nothing was entered. Say what is missing without marking anything wrong. */
function showNudge(feedback: HTMLElement, stage: Stage): void {
  fill(feedback, [
    el('p', {
      className: 'note',
      text:
        stage.kind === 'COEFFICIENTS'
          ? 'Every substance needs a coefficient, including the ones that are 1.'
          : stage.kind === 'CHOICE'
            ? 'Pick one of the reactants.'
            : 'There is nothing in the box yet.',
    }),
  ]);
}

/** A stage validated. Confirm it and get out of the way. */
function showAdvance(feedback: HTMLElement, result: SubmitResult, problem: Problem): void {
  fill(feedback, [
    el('p', {
      className: 'note note-good',
      text: result.problemComplete
        ? `That is the problem. ${problem.species[problem.wantedIndex] ?? ''} done.`
        : 'Right — next step.',
    }),
  ]);
}

/** A stage did not validate. This is the whole product. */
function showWrong(feedback: HTMLElement, result: SubmitResult, _solution: Solution): void {
  const { classification, remediation } = result;
  const children: HTMLElement[] = [
    el('p', { className: 'note note-wrong', text: 'Not that one.' }),
  ];

  if (classification.why !== '') {
    children.push(el('p', { className: 'why', text: sentence(classification.why) }));
  } else if (classification.collision) {
    // An entry that matched two error classes is an engine defect, not a
    // student's problem. Say something true and unhelpful rather than pick one.
    children.push(el('p', { className: 'why', text: 'That is not right, and MoleBridge cannot tell you why. Try the step again.' }));
  }

  // THE ROUTE OUT OF THE SENTENCE. Offered for every attributed class,
  // E-UNCLASSIFIED included — that page says what to check and points at the ⚑,
  // which is more use than the silence the unexplained case used to end on.
  if (classification.errorClass !== null) {
    children.push(
      el('button', {
        className: 'button-small explain',
        text: 'What does this mean?',
        attrs: { type: 'button', 'data-explain': classification.errorClass },
      }),
    );
  }

  for (const help of remediation) {
    children.push(
      el('div', { className: 'remediation' }, [
        el('h3', { text: help.title }),
        el('ol', {}, help.lines.map((line) => el('li', { text: line }))),
        el('p', { className: 'check', text: help.question }),
      ]),
    );
  }

  fill(feedback, children);
}

/** A diagnosis, written as a sentence: a capital at the front, a stop at the end. */
function sentence(text: string): string {
  if (text.length === 0) return text;
  const capitalised = `${(text[0] ?? '').toUpperCase()}${text.slice(1)}`;
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}
