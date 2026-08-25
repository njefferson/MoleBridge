/**
 * theme.ts — the appearance picker, wired to the pre-paint script.
 *
 * The choosing and the storing already happen in `public/theme.js`, which runs
 * before the first paint and is the only thing that may: a module cannot,
 * because a module is deferred and would arrive after the page had already been
 * painted in the wrong theme. This file does not duplicate any of that. It
 * reflects the current choice into the radios and hands changes back.
 *
 * That is deliberate rather than convenient. Two implementations of "what theme
 * am I in" is exactly the must-change-together pair PALETTES.md warns about,
 * and `tools/tokens-check.mjs` can only hold the files it knows about.
 */

import { need } from './dom.ts';

/** What `public/theme.js` puts on `window`. Declared, never re-implemented. */
interface ThemeBridge {
  readonly modes: readonly string[];
  readonly palettes: readonly string[];
  current(): { mode: string; palette: string };
  set(mode: string, palette: string): { mode: string; palette: string };
  readonly textSizes: readonly string[];
  readonly spacings: readonly string[];
  reading(): { text: string; spacing: string; focus: string };
  setReading(text: string, spacing: string, focus: string): { text: string; spacing: string; focus: string };
}

declare global {
  interface Window {
    MoleBridgeTheme?: ThemeBridge;
  }
}

/**
 * Wire the two radio groups up.
 *
 * PRECONDITION: the document contains both fieldsets.
 *
 * Returns silently if the pre-paint script did not run. That is a real state —
 * a stale service-worker cache can serve markup newer than its scripts — and
 * the app is still entirely usable in the default theme, so it is not worth an
 * error the reader can do nothing about.
 */
export function mountTheme(): void {
  const bridge = window.MoleBridgeTheme;
  if (bridge === undefined) return;

  const modes = need('#theme-mode');
  const palettes = need('#theme-palette');

  const check = (root: HTMLElement, value: string): void => {
    for (const input of root.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
      input.checked = input.value === value;
    }
  };

  const now = bridge.current();
  check(modes, now.mode);
  check(palettes, now.palette);

  const onChange = (): void => {
    const mode = modes.querySelector<HTMLInputElement>('input:checked');
    const palette = palettes.querySelector<HTMLInputElement>('input:checked');
    const next = bridge.set(
      mode === null ? bridge.current().mode : mode.value,
      palette === null ? bridge.current().palette : palette.value,
    );
    /* Re-read rather than trusting the click: the bridge refuses a value it
       does not know, and the radios must show what is actually in force. */
    check(modes, next.mode);
    check(palettes, next.palette);
  };

  modes.addEventListener('change', onChange);
  palettes.addEventListener('change', onChange);

  /*
    ---- READING ----

    Wired through the same bridge as the theme, and applied by the same
    pre-paint script, because the reason is the same: a setting applied after
    the first paint is a visible reflow, and text jumping size on load is worst
    for the reader who needed the setting.

    NOTHING HERE IS REPORTED. These three values never reach the completion
    code, the problem report or the teacher's page. An accommodation a student
    discloses by using it is not an accommodation.
  */
  const textSizes = need('#reading-text');
  const spacings = need('#reading-spacing');
  const focuses = need('#reading-focus');

  const showReading = (values: { text: string; spacing: string; focus: string }): void => {
    check(textSizes, values.text);
    check(spacings, values.spacing);
    check(focuses, values.focus);
  };
  showReading(bridge.reading());

  const onReading = (): void => {
    const now = bridge.reading();
    const picked = (root: HTMLElement, fallback: string): string =>
      root.querySelector<HTMLInputElement>('input:checked')?.value ?? fallback;
    // Re-read for the same reason as the theme: the bridge refuses a value it
    // does not know, and the radios must show what is actually in force.
    showReading(
      bridge.setReading(
        picked(textSizes, now.text),
        picked(spacings, now.spacing),
        picked(focuses, now.focus),
      ),
    );
  };

  textSizes.addEventListener('change', onReading);
  spacings.addEventListener('change', onReading);
  focuses.addEventListener('change', onReading);
}
