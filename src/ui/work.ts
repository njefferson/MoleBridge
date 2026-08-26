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
import type { Carried } from './carry.ts';
import { solve, type Problem, type Solution } from '../engine/problem.ts';
import { stagesFor, type ErrorClass, type Stage, type StudentEntry } from '../engine/taxonomy.ts';
import {
  correctEntryFor,
  revealValueFor,
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
  /** Abandon the set and go back to the three doors. */
  onLeave(): void;
  /**
   * Called whenever the session or the boxes change, so it can be saved.
   *
   * ON EVERY CHANGE, not on a timer and not on `beforeunload`. A tab closed by
   * the operating system, a device that sleeps and never wakes the page, a
   * Chromebook lid shut at the bell — none of those fire an unload handler
   * reliably, and the one moment a save matters is the one nobody scheduled.
   */
  onChanged(session: Session, entry: readonly string[], carried: readonly Carried[]): void;
}

interface Elements {
  readonly progress: HTMLElement;
  readonly equation: HTMLElement;
  readonly prompt: HTMLElement;
  readonly figures: HTMLElement;
  readonly rail: HTMLElement;
  readonly soFar: HTMLDetailsElement;
  readonly soFarList: HTMLElement;
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
  /**
   * Show a session — a new one, or one picked up again after the tab closed.
   *
   * `entry` is what was in the boxes when it closed, put back at the stage it
   * was typed at. Empty for a fresh session.
   */
  begin(session: Session, entry?: readonly string[], carried?: readonly Carried[]): void;
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
    soFar: need<HTMLDetailsElement>('#work-so-far'),
    soFarList: need('#work-so-far-list'),
    reveal: need<HTMLButtonElement>('#work-reveal'),
    revealed: need('#work-revealed'),
  };

  // Delegated for the same reason as the explain button: the boxes are rebuilt
  // at every stage, and one listener on the container outlives all of them.
  nodes.inputs.addEventListener('input', () => {
    changed();
  });

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
  /*
    WHAT THEY TYPED AT THE STEPS THEY HAVE FINISHED, this problem.

    Stoichiometry is a chain — the molar mass feeds the moles, the moles feed
    the ratio — and the app asked for each one and then took it off the screen.
    A revealed intermediate even tells the student to carry the unrounded value
    into the next step, which cannot be done against a number that is gone.

    THEIRS, NOT THE GRADER'S. An entry accepted inside tolerance is not the
    exact value, and showing the exact one would silently correct them. It would
    also repair rounding-early — a named class in this taxonomy — behind their
    back, so the app would be hiding the mistake it exists to teach them about.

    Emptied at every new problem, and never part of `Session`: the completion
    code is built from Session's counters and has never carried anything a
    student typed.
  */
  let carried: Carried[] = [];

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

    renderRail(nodes.rail, stages, session.stageIndex, carried);
    renderSoFar(nodes.soFar, nodes.soFarList, stages, carried);
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

    It shows one stage. `revealEntryFor` is the grader's own value, which is
    the point: what a student sees revealed is exactly what they would have been
    marked against, rather than a second rendering that could disagree with it.
  */
  nodes.reveal.addEventListener('click', () => {
    if (session === null || session.finished) return;
    if (session.config.mode !== 'practice') return;
    const problem = currentProblem(session);
    const stage = currentStage(session);
    const solution = solve(problem);
    const shown = revealValueFor(problem, solution, stage);
    if (shown === null) {
      const entry = correctEntryFor(problem, solution, stage);
      nodes.revealed.textContent =
        entry.kind === 'coefficients'
          ? `The coefficients are ${entry.values.join(', ')}. Check them against the atoms on each side.`
          : `The limiting reactant is the one numbered ${(entry as { speciesIndex: number }).speciesIndex + 1}. Work out why.`;
      nodes.revealed.hidden = false;
      return;
    }
    /*
      BOTH NUMBERS, and the second one is why this is not just a rounding fix.

      Showing an intermediate at exactly its significant figures is correct and
      is a trap: type that into the next step and you have rounded early, which
      is `E-ROUND-EARLY` — so the app would diagnose a student for doing what it
      had just told them. Saying "keep these digits, round at the end" is the
      rule a course teaches anyway, and it is the one thing a reveal is well
      placed to say.
    */
    const withUnit = (text: string): string => (shown.unit === null ? text : `${text} ${shown.unit}`);
    nodes.revealed.textContent =
      shown.sigFigs === null
        ? `This step is ${withUnit(shown.shown)}. It comes from the balanced coefficients, so it is exact — significant figures do not apply to it.`
        : shown.carry === null
          ? `This step is ${withUnit(shown.shown)}, to ${shown.sigFigs} significant figures. Work out where it comes from before you move on.`
          : `This step is ${withUnit(shown.shown)}, to ${shown.sigFigs} significant figures. Carry ${withUnit(shown.carry)} into the next step and round once, at the end.`;
    nodes.revealed.hidden = false;
  });

  /** The raw text in the boxes, unsubmitted — what a student would call their work. */
  const rawEntry = (): string[] =>
    [...nodes.inputs.querySelectorAll<HTMLInputElement>('input')].map((box) => box.value);

  const changed = (): void => {
    if (session !== null) host.onChanged(session, rawEntry(), carried);
  };

  /**
   * What to show in the rail for the step just finished.
   *
   * A CHOICE stage has no box — the student pressed a button — so the label on
   * what they chose is what they did, and it is read off the pressed control
   * rather than recomputed from the problem.
   */
  const committedText = (stage: Stage): string => {
    if (stage.kind === 'CHOICE') {
      const picked = nodes.inputs.querySelector<HTMLButtonElement>('button[aria-checked="true"]');
      return picked?.textContent?.trim() ?? '';
    }
    const boxes = rawEntry().map((text) => text.trim()).filter((text) => text !== '');
    return boxes.join(stage.kind === 'COEFFICIENTS' ? ', ' : ' ');
  };

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
    changed();

    if (result.sessionComplete) {
      clear(nodes.feedback);
      host.onFinished(session);
      return;
    }
    if (result.advanced) {
      // RECORDED BEFORE THE RENDER, which rebuilds the boxes this reads from.
      const said = committedText(stage);
      // A finished problem starts the chain again; carrying the last one's
      // numbers into the next would be showing a student values that belong to
      // a question they are no longer answering.
      carried = result.problemComplete ? [] : [...carried, { stage: stage.id, text: said }];
      changed();
      showAdvance(nodes.feedback, result, problem);
      render();
      return;
    }
    showWrong(nodes.feedback, result, solve(problem));
    /*
      FOCUS GOES TO THE DIAGNOSIS, NOT BACK INTO THE BOX.

      This used to call select() and focus() on the field, which is the reflex —
      "they got it wrong, let them retype" — and on a tablet it put the keyboard
      straight back up over the sentence explaining what they did wrong. The
      whole product is that sentence, and a student saw "Not that one." with the
      rest below the fold.

      Moving focus to the message is also the standard place for it after a
      rejection: a keyboard user lands on the reason rather than on the input
      they just came from, and a screen reader reads it whether or not the live
      region fired. Retyping costs one tap on the field, which is the tap they
      were about to make anyway.
    */
    nodes.feedback.focus({ preventScroll: true });
    nodes.feedback.scrollIntoView({ block: 'nearest' });
  });

  /*
    TWO STEPS IN AN ASSIGNMENT, ONE IN PRACTICE. Leaving an assignment throws
    away the completion code, which is the whole reason the student is there, so
    it is worth one deliberate second tap. Practice has nothing to lose and a
    confirmation there is friction for its own sake.

    Inline rather than a dialog: this app already opens four of them, and a
    confirmation is the one kind of question that should not arrive as another
    thing to dismiss.
  */
  /*
    ---- READ THIS OUT ----

    Speech synthesis is output only. It raises no permission prompt, touches no
    network and reads no device state — which is why it can exist in an app
    whose whole posture is that it asks the browser for nothing.
    `tools/permissions-check.mjs` names it as an allowance, and forbids
    recognition in the same breath: the two are one letter apart in the same
    corner of the platform, and recognition turns on a microphone.

    NOT A SCREEN READER. A sighted student with a reading difficulty does not
    run one, and read-aloud is among the commonest accommodations on a 504.

    It reads the QUESTION and the equation. Never the answer, never the verdict:
    the rule that the correct answer is not shown before the attempt does not
    stop applying when the delivery is audio.
  */
  const speak = need<HTMLButtonElement>('#work-speak');
  const canSpeak =
    typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance === 'function';
  speak.hidden = !canSpeak;
  speak.addEventListener('click', () => {
    if (!canSpeak || session === null) return;
    // The same button stops it. A student who started it by accident, or who
    // has heard enough, should not have to hunt for a second control.
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
      speak.textContent = 'Read this out';
      return;
    }
    const said = [
      nodes.equation.textContent ?? '',
      nodes.prompt.textContent ?? '',
      nodes.stagePrompt.textContent ?? '',
      nodes.figures.textContent ?? '',
    ]
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .join('. ');
    const utterance = new SpeechSynthesisUtterance(said);
    // Slower than the default, which is pitched for prose rather than for a
    // sentence full of formulas and numbers.
    utterance.rate = 0.9;
    utterance.addEventListener('end', () => {
      speak.textContent = 'Read this out';
    });
    speak.textContent = 'Stop reading';
    speechSynthesis.speak(utterance);
  });

  const leave = need<HTMLButtonElement>('#work-leave');
  let armed = false;
  const disarm = (): void => {
    armed = false;
    leave.textContent = 'Leave this set';
    leave.classList.remove('work-leave-armed');
  };
  leave.addEventListener('click', () => {
    if (session === null) return;
    if (session.config.mode === 'practice' || armed) {
      disarm();
      host.onLeave();
      return;
    }
    armed = true;
    leave.textContent = 'Leave — you will not get a code';
    leave.classList.add('work-leave-armed');
  });

  return {
    begin(started: Session, entry: readonly string[] = [], said: readonly Carried[] = []): void {
      disarm();
      session = started;
      carried = [...said];
      clear(nodes.feedback);
      render();
      // PUT BACK AFTER THE RENDER, because render() builds the boxes. Restoring
      // before it would write into inputs that are about to be replaced.
      if (entry.length > 0) {
        const boxes = nodes.inputs.querySelectorAll<HTMLInputElement>('input');
        boxes.forEach((box, at) => {
          const was = entry[at];
          if (was !== undefined) box.value = was;
        });
      }
      // Saved as soon as it exists, so a tab closed before the first answer
      // comes back to the right problem rather than to nothing.
      changed();
    },
  };
}

/** The step list down the side, with what is done, what is here, what is next. */
function renderRail(
  rail: HTMLElement,
  stages: readonly Stage[],
  at: number,
  carried: readonly Carried[],
): void {
  const said = new Map(carried.map((one) => [one.stage, one.text]));
  fill(
    rail,
    stages.map((stage, index) => {
      const state = index < at ? 'done' : index === at ? 'here' : 'ahead';
      const label = index < at ? 'done' : index === at ? 'you are here' : 'still to come';
      // ONLY FOR STEPS ALREADY PASSED. The map is only ever written on the way
      // out of a stage, so there is nothing here to leak forwards — but it is
      // read by index as well, because "never before the attempt" is a rule
      // worth being structurally unable to break rather than merely careful
      // about.
      const value = index < at ? said.get(stage.id) ?? '' : '';
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
          value === '' ? null : el('span', { className: 'rail-value', text: value }),
        ],
      );
    }),
  );
}

/**
 * The same values as the rail, folded away, for the student who has turned the
 * rail off.
 *
 * ONE-STEP-AT-A-TIME PUTS LESS ON THE SCREEN; IT MUST NOT PUT LESS WITHIN
 * REACH. That setting hides the rail — right, for the person who asked for it —
 * and was hiding with it the numbers the next step needs. An accommodation that
 * removes what the task requires has stopped being one.
 *
 * WHICH OF THE TWO IS SHOWING IS DECIDED IN CSS, off the same `data-focus`
 * attribute the rail's own rule reads, so there is one place that knows and no
 * way for both to be hidden at once. This function only decides whether there
 * is anything to show at all: an empty disclosure is a promise of information
 * that is not there.
 */
function renderSoFar(
  panel: HTMLDetailsElement,
  list: HTMLElement,
  stages: readonly Stage[],
  carried: readonly Carried[],
): void {
  panel.hidden = carried.length === 0;
  const named = new Map<string, string>(stages.map((stage) => [stage.id, RAIL_NAMES[stage.id] ?? stage.id]));
  fill(
    list,
    carried.map((one) =>
      el('li', {}, [
        el('span', { className: 'so-far-name', text: `${named.get(one.stage) ?? one.stage}: ` }),
        el('span', { className: 'so-far-value', text: one.text }),
      ]),
    ),
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

/**
 * Draw the entry controls this stage needs.
 *
 * EXPORTED so the drill screen uses this one rather than growing its own. A
 * second renderer would be a second place for the rules about what a student
 * may see before answering to drift — and the drill shows the same stages to
 * the same students.
 */
export function renderInputs(host: HTMLElement, problem: Problem, stage: Stage): void {
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

/**
 * What is in the controls, as an entry the grader takes — or null where the
 * student has not answered yet.
 *
 * EXPORTED alongside `renderInputs` for the same reason: the pair has to agree
 * about what a stage's controls are, and two copies would not.
 */
export function readEntryFrom(host: HTMLElement, stage: Stage): StudentEntry | null {
  if (stage.kind === 'COEFFICIENTS') {
    const fields = [...host.querySelectorAll<HTMLInputElement>('input')];
    if (fields.length === 0 || fields.some((field) => field.value.trim() === '')) return null;
    return { kind: 'coefficients', values: fields.map((field) => Number(field.value.trim())) };
  }
  if (stage.kind === 'CHOICE') {
    const picked = host.querySelector<HTMLElement>('[data-species][aria-checked="true"]');
    return picked === null ? null : { kind: 'choice', speciesIndex: Number(picked.dataset['species']) };
  }
  const text = host.querySelector<HTMLInputElement>('input')?.value.trim() ?? '';
  return text === '' ? null : { kind: 'text', text };
}

/** A diagnosis, written as a sentence: a capital at the front, a stop at the end. */
function sentence(text: string): string {
  if (text.length === 0) return text;
  const capitalised = `${(text[0] ?? '').toUpperCase()}${text.slice(1)}`;
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}
