/**
 * reference.ts — the look-it-up surface, and the other end of every diagnosis.
 *
 * ## A PANEL, NOT A SCREEN, and that is the whole design
 *
 * This opens from a wrong answer, mid-step, with a half-finished problem
 * underneath. A screen would have to unmount the problem, remember where the
 * student was, and put them back — three chances to lose their place, in the
 * one moment they are already stuck. A dialog lays over the top and closes
 * again, and the problem is still exactly where it was.
 *
 * ## It opens AT the thing, not at the top of a list
 *
 * `open('E-RATIO-INVERTED')` shows that page. A "read more" that lands somebody
 * on a contents page of twenty entries has asked them to diagnose themselves
 * before they can read the diagnosis — and the app already knows which one they
 * need, so making them find it is a choice.
 *
 * `open()` with nothing shows the list, for the student who came here to look
 * something up rather than because they got something wrong.
 */

import { el, fill, need } from './dom.ts';
import { REFERENCE, entryFor, lessonsForClass, drillForClass, type ReferenceEntry } from '../learn/reference.ts';
import { LESSONS } from '../learn/lessons.ts';
import type { ErrorClass } from '../engine/taxonomy.ts';

export interface ReferencePanel {
  /** Show the panel, at one entry or at the list. */
  open(id?: ErrorClass): void;
}

export interface ReferenceHost {
  /** Take the student to a lesson by index, closing whatever is over the top. */
  openLesson(index: number): void;
  /** Start a drill on the step this mistake belongs to. */
  openDrill(stageId: string): void;
}

export function mountReference(host: ReferenceHost): ReferencePanel {
  const panel = need<HTMLDialogElement>('#reference-panel');
  const list = need('#reference-list');
  const detail = need('#reference-detail');
  const back = need<HTMLButtonElement>('#reference-back');
  const title = need('#reference-title');

  const showList = (): void => {
    title.textContent = 'What can go wrong';
    detail.hidden = true;
    list.hidden = false;
    back.hidden = true;
  };

  const showEntry = (entry: ReferenceEntry): void => {
    title.textContent = entry.called;
    const blocks: HTMLElement[] = [
      el('h3', { text: 'What happened' }),
      el('p', { text: entry.what }),
      el('h3', { text: 'How to spot it yourself' }),
      el('p', { text: entry.tell }),
      el('h3', { text: 'What to do instead' }),
      el('p', { text: entry.fix }),
    ];

    // EVERY CLAIMING LESSON, not the first one. Two lessons can legitimately
    // teach the same mistake — a conversion upside down is taught by the units
    // lesson and by percent yield — and which one this student needs depends on
    // the step they were on, which this cannot know.
    /*
      THE OFFER GOES HERE, on the page about the mistake they just made. That is
      the one moment a student is most likely to want twenty more of exactly
      that step; three screens away behind a menu they would have to know about
      is the same as not offering it.

      Worded as an offer and not as an instruction. "You should practise this"
      is the app having an opinion about somebody it has met twice.
    */
    const drillable = drillForClass(entry.id);
    if (drillable !== null) {
      blocks.push(
        el('button', {
          className: 'button-small',
          text: 'Practise just this step',
          attrs: { type: 'button', 'data-drill-step': drillable },
        }),
      );
    }

    const lessons = lessonsForClass(entry.id);
    if (lessons.length > 0) {
      blocks.push(el('h3', { text: lessons.length === 1 ? 'The lesson on this' : 'The lessons on this' }));
      blocks.push(
        el(
          'ul',
          { className: 'reference-lessons' },
          lessons.map((at) =>
            el('li', {}, [
              el('button', {
                className: 'button-small',
                text: LESSONS[at]?.title ?? '',
                attrs: { type: 'button', 'data-goto-lesson': at },
              }),
            ]),
          ),
        ),
      );
    } else {
      // SAID OUTRIGHT rather than left as an absence. A page with no lesson
      // link reads as a broken link; a page that says there is no lesson
      // because there is nothing to teach reads as an answer.
      blocks.push(
        el('p', {
          className: 'hint',
          text: 'There is no lesson for this one — it is a slip rather than an idea, so the fix is above and there is nothing more to learn.',
        }),
      );
    }

    fill(detail, blocks);
    detail.hidden = false;
    list.hidden = true;
    back.hidden = false;
  };

  fill(
    list,
    REFERENCE.map((entry) =>
      el('li', {}, [
        el('button', {
          className: 'reference-row',
          text: entry.called,
          attrs: { type: 'button', 'data-reference': entry.id },
        }),
      ]),
    ),
  );

  list.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-reference]');
    if (button === null) return;
    const entry = entryFor(button.dataset['reference'] as ErrorClass);
    if (entry !== undefined) showEntry(entry);
  });

  detail.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const toDrill = target.closest<HTMLElement>('[data-drill-step]');
    if (toDrill !== null) {
      panel.close();
      host.openDrill(toDrill.dataset['drillStep'] ?? '');
      return;
    }
    const button = target.closest<HTMLElement>('[data-goto-lesson]');
    if (button === null) return;
    const at = Number(button.dataset['gotoLesson']);
    panel.close();
    host.openLesson(at);
  });

  back.addEventListener('click', showList);
  need<HTMLButtonElement>('#reference-close').addEventListener('click', () => {
    panel.close();
  });

  showList();

  return {
    open(id?: ErrorClass): void {
      const entry = id === undefined ? undefined : entryFor(id);
      if (entry === undefined) showList();
      else showEntry(entry);
      if (!panel.open) panel.showModal();
    },
  };
}
