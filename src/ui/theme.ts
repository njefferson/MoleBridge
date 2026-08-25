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
}
