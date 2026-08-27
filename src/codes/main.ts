/**
 * main.ts — the teacher's decoder.
 *
 * A teacher pastes a gradebook column and gets back where the class got stuck.
 * Everything of consequence happens in `src/code/gradebook.ts`, which is pure
 * and tested; this file draws it.
 *
 * TWO THINGS THIS SCREEN OWES THE READER, and both are easy to leave out.
 *
 * It must say what it does with a paste that contains NAMES, before they paste
 * — which the page does, above the box.
 *
 * And it must be honest about the codes it could not use. A decoder that quietly
 * shows twenty-six results for a class of thirty is worse than useless: the four
 * that went missing are exactly the students the teacher needs to know about.
 * So every line that carried no code, failed its check, or belongs to a
 * different assignment is reported, with its line number.
 */

import { clear, el, fill, need } from '../ui/dom.ts';
import { VERSION } from '../version.ts';
import { BUILD_SECRET } from '../code/secret.ts';
import { assignmentKeyIdFor, normaliseAssignmentKey } from '../engine/assignment.ts';
import { TIERS, TIER_NAMES } from '../engine/problem.ts';
import { warmupLink } from '../ui/warmup.ts';
import {
  decodeGradebook,
  errorsOn,
  summarise,
  type ClassSummary,
  type DecodedLine,
} from '../code/gradebook.ts';

/** The six stages, as a teacher would name them. */
const STAGE_NAMES: ReadonlyArray<readonly [keyof ClassSummary['stageErrors'], string]> = [
  ['S1', 'Balancing'],
  ['S2', 'Molar mass'],
  ['S3', 'Grams to moles'],
  ['S4', 'The mole ratio'],
  ['S5', 'Moles made'],
  ['S6', 'The final conversion'],
];

function boot(): void {
  need('#build-stamp').textContent = VERSION;

  const form = need<HTMLFormElement>('#decode-form');
  const keyField = need<HTMLInputElement>('#teacher-key');
  const pasteField = need<HTMLTextAreaElement>('#teacher-paste');
  const error = need('#decode-error');
  const results = need('#results');

  need<HTMLButtonElement>('#print').addEventListener('click', () => window.print());

  /*
    ---- the warm-up link ----

    Built HERE, on her page, because this is where she already is when she is
    planning a lesson — and because a link a teacher has to compose by hand is a
    link with a typo in it in front of a class.

    `warmupLink` is the same function the app's own parser round-trips against in
    `warmup.test.ts`, so what this writes on the board is what the app reads.
  */
  const code = need<HTMLInputElement>('#warmup-code');
  /*
    THE SETS COME FROM THE ENGINE. Typed into this page, they were a third list
    of names — and the one that disagreed with the other two about which set
    poses percent yield. A warm-up built from a wrong name puts the wrong
    problems on the board.

    Set 2 is the default because it is the ordinary mass-to-mass-and-units work
    most warm-ups want; the first set is deliberately narrower.
  */
  const set = need<HTMLSelectElement>('#warmup-set');
  const WARMUP_DEFAULT_TIER = 2;
  fill(
    set,
    TIERS.map((value) =>
      el('option', {
        text: `${value} — ${(TIER_NAMES[value] ?? `Set ${value}`).toLowerCase()}`,
        attrs: { value: String(value), selected: value === WARMUP_DEFAULT_TIER },
      }),
    ),
  );
  set.value = String(WARMUP_DEFAULT_TIER);
  const howMany = need<HTMLSelectElement>('#warmup-count');
  const link = need('#warmup-link');
  const linkStatus = need('#warmup-copy-status');

  const paintLink = (): void => {
    const typed = code.value.trim();
    link.textContent =
      typed === ''
        ? 'Type a word above and the link appears here.'
        : warmupLink(location.origin, typed, Number(set.value), Number(howMany.value));
  };
  for (const control of [code, set, howMany]) control.addEventListener('input', paintLink);
  paintLink();

  need<HTMLButtonElement>('#warmup-copy').addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(link.textContent ?? '');
        linkStatus.textContent = 'Copied.';
      } catch {
        linkStatus.textContent = 'Could not copy it — select the link above and copy it by hand.';
      }
    })();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.hidden = true;

    const key = normaliseAssignmentKey(keyField.value);
    if (key === '') {
      error.textContent = 'The assignment key decides which codes belong to this assignment. Without it nothing can be counted.';
      error.hidden = false;
      keyField.focus();
      return;
    }
    if (pasteField.value.trim() === '') {
      error.textContent = 'Paste the gradebook column into the box.';
      error.hidden = false;
      pasteField.focus();
      return;
    }

    const lines = decodeGradebook(pasteField.value, BUILD_SECRET);
    const summary = summarise(lines, assignmentKeyIdFor(key));

    renderSummary(need('#class-summary'), summary);
    renderProblems(need('#class-problems'), lines, summary);
    renderStudents(need('#students'), lines, assignmentKeyIdFor(key));

    results.hidden = false;
    need('#results-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/** The class, taken together. */
function renderSummary(host: HTMLElement, summary: ClassSummary): void {
  if (summary.counted === 0) {
    fill(host, [
      el('p', {
        className: 'note',
        text: 'No code in what you pasted belongs to this assignment. Check the key — it is the commonest reason.',
      }),
    ]);
    return;
  }

  const firstTryRate = Math.round((summary.firstTryCorrect / Math.max(1, summary.problemsAttempted)) * 100);
  const totalErrors = STAGE_NAMES.reduce((sum, [id]) => sum + summary.stageErrors[id], 0);
  const worst = Math.max(1, ...STAGE_NAMES.map(([id]) => summary.stageErrors[id]));

  fill(host, [
    el('ul', { className: 'summary' }, [
      el('li', { text: `${summary.counted} ${summary.counted === 1 ? 'student' : 'students'} handed in a code for this assignment.` }),
      el('li', { text: `${summary.problemsAttempted} problems finished between them.` }),
      el('li', { text: `${firstTryRate}% of those had every step right first time.` }),
      el('li', { text: `${summary.algebraTriggers} times the algebra help came up.` }),
      el('li', { text: `Half of them finished within ${summary.medianDurationMin} minutes.` }),
    ]),

    el('h3', { text: 'Where they got stuck' }),
    totalErrors === 0
      ? el('p', { className: 'note', text: 'No step went wrong anywhere. That is worth being suspicious of — check the key is the one they used.' })
      : el(
          'ul',
          { className: 'histogram' },
          STAGE_NAMES.map(([id, name]) => {
            const count = summary.stageErrors[id];
            const share = Math.round((count / totalErrors) * 100);
            const bar = el('span', { className: 'bar' });
            // A custom property rather than a width, so the bar and its
            // accessible text cannot say different things.
            bar.style.setProperty('--fill', `${Math.round((count / worst) * 100)}%`);
            return el('li', { className: 'histogram-row' }, [
              el('span', { className: 'histogram-name', text: name }),
              el('span', { className: 'histogram-track' }, [bar]),
              el('span', { className: 'histogram-count', text: `${count} (${share}%)` }),
            ]);
          }),
        ),

    el('h3', { text: 'Answers MoleBridge could not explain' }),
    el('p', {
      // §6.2: counted and reported, never suppressed. This is the number that
      // says whether the taxonomy needs work, and a teacher is who would notice.
      text:
        summary.unclassified === 0
          ? 'None. Every wrong answer was one MoleBridge could account for.'
          : `${summary.unclassified}. These are answers MoleBridge could not attribute to a particular mistake — a limit of the app rather than of the student, and worth reporting if the number is large.`,
    }),
  ]);
}

/** Everything that could not be counted, and why. Never quietly dropped. */
function renderProblems(host: HTMLElement, lines: readonly DecodedLine[], summary: ClassSummary): void {
  const trouble: HTMLElement[] = [];

  const say = (text: string): void => {
    trouble.push(el('li', { text }));
  };

  if (summary.linesWithoutCode > 0) {
    const numbers = lines.filter((line) => line.code === null).map((line) => line.number);
    say(`${summary.linesWithoutCode} ${summary.linesWithoutCode === 1 ? 'line has' : 'lines have'} no code on them (${numbers.join(', ')}).`);
  }
  if (summary.otherAssignment > 0) {
    say(`${summary.otherAssignment} valid ${summary.otherAssignment === 1 ? 'code was' : 'codes were'} minted for a DIFFERENT assignment. They check out; they are simply not this one.`);
  }
  if (summary.byVerdict.MAC_FAIL > 0) {
    const numbers = lines.filter((line) => line.result?.verdict === 'MAC_FAIL').map((line) => line.number);
    say(`${summary.byVerdict.MAC_FAIL} ${summary.byVerdict.MAC_FAIL === 1 ? 'code' : 'codes'} failed the check (${numbers.join(', ')}) — mistyped, or edited by hand.`);
  }
  if (summary.byVerdict.MALFORMED > 0) {
    say(`${summary.byVerdict.MALFORMED} ${summary.byVerdict.MALFORMED === 1 ? 'code was' : 'codes were'} the wrong shape or contradicted themselves.`);
  }
  if (summary.byVerdict.VERSION_UNKNOWN > 0) {
    say(`${summary.byVerdict.VERSION_UNKNOWN} came from a newer MoleBridge than this page. Reload and try again.`);
  }
  for (const duplicate of summary.duplicates) {
    say(`Roster number ${duplicate.rosterId} was handed in ${duplicate.times} times. Both are counted; which one to keep is yours to decide.`);
  }

  if (trouble.length === 0) {
    fill(host, [el('p', { className: 'note note-good', text: 'Every line carried a code for this assignment.' })]);
    return;
  }
  fill(host, [
    el('h3', { text: 'What could not be counted' }),
    el('ul', { className: 'trouble' }, trouble),
  ]);
}

/** One card per student. Cards rather than a grid: this is read on a tablet. */
function renderStudents(host: HTMLElement, lines: readonly DecodedLine[], assignmentKeyId: number): void {
  clear(host);
  const cards = lines
    .filter((line) => line.result?.verdict === 'VALID' && line.result.fields?.assignmentKeyId === assignmentKeyId)
    .map((line): HTMLDivElement | null => {
      const fields = line.result?.fields;
      if (fields === undefined || fields === null) return null;
      const errors = errorsOn(line);
      const stages = STAGE_NAMES.filter(([id]) => fields[`err${id}`] > 0)
        .map(([id, name]) => `${name.toLowerCase()} ${fields[`err${id}`]}`)
        .join(', ');

      return el('div', { className: 'card student' }, [
        el('h3', { text: `Roster ${fields.rosterId}` }),
        el('ul', { className: 'summary' }, [
          el('li', { text: `${fields.attempted} finished, ${fields.firstTryCorrect} right first time.` }),
          el('li', { text: errors === 0 ? 'No step went wrong.' : `${errors} steps wrong: ${stages}.` }),
          fields.algebraTriggers > 0 ? el('li', { text: `Algebra help ${fields.algebraTriggers} times.` }) : null,
          fields.unclassified > 0 ? el('li', { text: `${fields.unclassified} answers MoleBridge could not explain.` }) : null,
          el('li', { text: `${fields.durationMin} minutes, day ${fields.dayOffset} of the assignment.` }),
        ]),
      ]);
    })
    .filter((card): card is HTMLDivElement => card !== null);

  if (cards.length === 0) {
    fill(host, [el('p', { className: 'note', text: 'Nothing to show for this assignment.' })]);
    return;
  }
  fill(host, cards);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
