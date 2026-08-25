/**
 * learn.ts — the lesson list, one lesson, and the progress code.
 *
 * NOTHING IS LOCKED, and the list says so rather than implying it: every lesson
 * is a live control from a first run, with a tick beside the ones already
 * finished. A greyed-out lesson would be a promise that finishing the one
 * before it is required, which is not true here and is not how this teaches.
 */

import { clear, el, fill, need } from './dom.ts';
import { BUILD_SECRET } from '../code/secret.ts';
import { LESSONS, drillIsRight, type Drill, type Lesson } from '../learn/lessons.ts';
import { decodeProgress, encodeProgress, addsNothing } from '../learn/progress.ts';
import { adoptProgress, loadProgress, markLessonDone, storageWorks } from '../learn/store.ts';

export interface LearnHost {
  onBack(): void;
}

export interface LearnScreens {
  /** Re-read progress and repaint the list. */
  refresh(): void;
  /** Which element to show for the lesson list. */
  readonly list: HTMLElement;
  readonly lesson: HTMLElement;
}

/**
 * Wire both learn screens up.
 *
 * PRECONDITION: the document contains the lesson list and the lesson screen.
 */
export function mountLearn(host: LearnHost, show: (screen: HTMLElement) => void): LearnScreens {
  const list = need('#screen-learn');
  const lessonScreen = need('#screen-lesson');
  const items = need('#learn-list');

  const codeNode = need('#learn-code');
  const copyStatus = need('#learn-copy-status');
  const restore = need<HTMLInputElement>('#learn-restore');
  const restoreStatus = need('#learn-restore-status');

  const paintCode = (): void => {
    codeNode.textContent = encodeProgress(loadProgress(), BUILD_SECRET);
  };

  const paintList = (): void => {
    const progress = loadProgress();
    fill(
      items,
      LESSONS.map((lesson, index) => {
        const done = progress.lessonsDone.includes(index);
        const button = el('button', {
          className: done ? 'lesson-row lesson-done' : 'lesson-row',
          attrs: { type: 'button', 'data-lesson': index },
        });
        // The tick is announced as words, not left as a glyph a screen reader
        // reads out as punctuation or skips entirely.
        button.append(
          el('span', { className: 'lesson-name', text: lesson.title }),
          el('span', { className: 'lesson-promise', text: lesson.promise }),
          el('span', {
            className: 'lesson-state',
            text: done ? 'Finished' : 'Not finished yet',
          }),
        );
        return el('li', {}, [button]);
      }),
    );
    paintCode();
  };

  items.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-lesson]');
    if (button === null) return;
    const index = Number(button.dataset['lesson']);
    const lesson = LESSONS[index];
    if (lesson === undefined) return;
    openLesson(lesson, index);
    show(lessonScreen);
  });

  /* ---- one lesson ---- */

  const title = need('#lesson-title');
  const promise = need('#lesson-promise');
  const body = need('#lesson-body');
  const drills = need('#lesson-drills');
  const doneButton = need<HTMLButtonElement>('#lesson-done');
  let openIndex = 0;

  const openLesson = (lesson: Lesson, index: number): void => {
    openIndex = index;
    title.textContent = lesson.title;
    promise.textContent = lesson.promise;

    const blocks: HTMLElement[] = [];
    for (const block of lesson.blocks) {
      if (block.heading !== undefined) blocks.push(el('h2', { text: block.heading }));
      for (const paragraph of block.paragraphs) blocks.push(el('p', { text: paragraph }));
      if (block.worked !== undefined) {
        // Worked lines are preformatted because their alignment is part of the
        // explanation — the units line up under each other on purpose.
        blocks.push(el('pre', { className: 'worked', text: block.worked.join('\n') }));
      }
    }
    fill(body, blocks);

    fill(drills, lesson.drills.map((drill, at) => drillRow(drill, `${lesson.id}-${at}`)));
    doneButton.textContent = loadProgress().lessonsDone.includes(index)
      ? 'Finished — go back'
      : 'I have got this';
  };

  doneButton.addEventListener('click', () => {
    markLessonDone(openIndex);
    paintList();
    show(list);
  });
  need<HTMLButtonElement>('#lesson-back').addEventListener('click', () => {
    show(list);
  });
  need<HTMLButtonElement>('#learn-back').addEventListener('click', () => {
    host.onBack();
  });

  /* ---- the progress code ---- */

  need('#learn-storage').textContent = storageWorks()
    ? 'Your place is kept on this device automatically. You only need a code to move it somewhere else.'
    : 'This device will not let the app remember anything, so your place is NOT being kept. Write the code below down if you want to come back to it.';

  need<HTMLButtonElement>('#learn-copy').addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(codeNode.textContent ?? '');
        copyStatus.textContent = 'Copied.';
      } catch {
        copyStatus.textContent = 'Could not copy it — write it down instead.';
      }
    })();
  });

  need<HTMLButtonElement>('#learn-restore-go').addEventListener('click', () => {
    const verdict = decodeProgress(restore.value, BUILD_SECRET);
    if (verdict.kind === 'MALFORMED') {
      restoreStatus.textContent = `That does not look like a progress code — ${verdict.why}.`;
      return;
    }
    if (verdict.kind === 'CHECK_FAILED') {
      restoreStatus.textContent =
        'That code did not check out. It is usually one wrong character — have another look at it.';
      return;
    }
    if (verdict.kind === 'VERSION_UNKNOWN') {
      restoreStatus.textContent =
        'That code came from a different version of MoleBridge and cannot be read by this one.';
      return;
    }
    // NOTHING IS EVER LOST HERE. The merge is a union, so a code older than this
    // device adds nothing rather than taking something away — and saying so is
    // better than a silent no-op the student reads as a failure.
    const before = loadProgress();
    const nothingNew = addsNothing(before, verdict.progress);
    const after = adoptProgress(verdict.progress);
    restoreStatus.textContent = nothingNew
      ? 'That code is older than what is already here, so nothing changed. Nothing was lost either.'
      : `Added. ${after.lessonsDone.length} of ${LESSONS.length} lessons finished.`;
    restore.value = '';
    paintList();
  });

  paintList();

  return { refresh: paintList, list, lesson: lessonScreen };
}

/** One drill: a question, a box, and a verdict that arrives only after a try. */
function drillRow(drill: Drill, id: string): HTMLElement {
  const item = el('li', { className: 'drill' });
  const field = el('input', {
    attrs: { type: 'text', id: `drill-${id}`, inputmode: 'text', autocomplete: 'off', spellcheck: 'false' },
  }) as HTMLInputElement;
  const verdict = el('p', { className: 'drill-verdict', attrs: { role: 'status' } });
  verdict.hidden = true;

  const check = el('button', { className: 'button-small', text: 'Check', attrs: { type: 'button' } });
  check.addEventListener('click', () => {
    if (field.value.trim() === '') {
      verdict.textContent = 'Have a go first — there is nothing to check yet.';
      verdict.hidden = false;
      field.focus();
      return;
    }
    // THE ANSWER IS ONLY EVER SHOWN AFTER AN ATTEMPT, in a lesson as much as in
    // an assignment. Somewhere to type it and a reason underneath is teaching;
    // the reason on its own is just the answer.
    const right = drillIsRight(drill, field.value);
    verdict.textContent = right
      ? `Yes. ${drill.because}`
      : `Not that one. The answer is ${drill.answer}${drill.unit === undefined ? '' : ` ${drill.unit}`} — ${drill.because}`;
    verdict.className = right ? 'drill-verdict drill-right' : 'drill-verdict drill-wrong';
    verdict.hidden = false;
  });

  const label = el('label', { className: 'field', attrs: { for: `drill-${id}` } });
  label.append(el('span', { className: 'field-label', text: drill.ask }));

  item.append(label, field, check, verdict);
  return item;
}

/** Exported for the walk: clear a drill row's verdict without reaching into it. */
export function resetDrills(root: HTMLElement): void {
  for (const verdict of root.querySelectorAll<HTMLElement>('.drill-verdict')) {
    verdict.hidden = true;
    clear(verdict);
  }
}
