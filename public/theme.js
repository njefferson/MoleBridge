/*
  theme.js — the two theme attributes, set before the first paint.

  ## Why this is a separate classic script rather than an inline one-liner

  PALETTES.md §6 asks for an inline script in <head> so there is no flash of the
  wrong theme. MoleBridge has NO inline script anywhere, deliberately: that is
  the entire reason a Content-Security-Policy is still reachable here without
  `unsafe-inline`, and `public/_headers` says so in as many words. A blocking
  external script in <head> gives the same no-flash result and keeps that door
  open. It is precached, so it costs nothing after the first load.

  It must NOT be a module. A module script is deferred by definition, which
  means it runs after first paint — which is the flash this file exists to
  prevent. So it is plain JavaScript rather than TypeScript compiled to ESM.

  ## Why `auto` is resolved HERE rather than in CSS

  The obvious CSS shape is a `prefers-color-scheme` media block plus an
  attribute block, which means the light values are written twice and must never
  drift. PALETTES.md is explicit that must-change-together declarations are what
  has bitten this family repeatedly.

  So the preference and the resolved mode are two different things:

    data-theme-pref   what the reader chose:   auto | light | dark
    data-theme        what that resolves to:   light | dark

  CSS only ever sees the resolved one, so each mode is declared exactly once.
  `auto` follows the operating system live, because the media query is watched
  rather than read once.

  There is still one duplicate: a `:root:not([data-theme])` block in the
  stylesheet, which is the no-JavaScript fallback and cannot be avoided. It is
  held identical to the real one by `tools/tokens-check.mjs`, which fails on any
  difference — a gate rather than a comment asking nicely.
*/
(function () {
  'use strict';

  var THEME_KEY = 'molebridge.theme';
  var PALETTE_KEY = 'molebridge.palette';
  /*
    READING PREFERENCES SIT HERE FOR THE SAME REASON THE THEME DOES: applied
    after first paint they are a visible reflow, and text jumping size on load
    is worse for the reader who needed the setting than for anyone else. They
    are three attributes on <html>, and CSS does the rest.

    NONE OF THIS EVER LEAVES THE DEVICE. A student's reading settings are the
    closest thing this app has to information about a person, and they must not
    reach the completion code, the report, or a teacher — an accommodation is
    not something a student should have to disclose by using it. `readout.test`
    holds the code to its declared fields, so a field added for this would fail
    the build.
  */
  var TEXT_KEY = 'molebridge.text';
  var SPACING_KEY = 'molebridge.spacing';
  var FOCUS_KEY = 'molebridge.focus';

  /** The reader's choices, and what happens when the answer is not one of them. */
  var MODES = ['auto', 'light', 'dark'];
  var PALETTES = ['moss', 'harbour', 'clay'];
  var DEFAULT_MODE = 'auto';
  var DEFAULT_PALETTE = 'moss';
  /* Named sizes rather than a number, so every step is one that was looked at
     on a real screen rather than whatever a slider lands on. */
  var TEXT_SIZES = ['normal', 'large', 'largest'];
  var SPACINGS = ['normal', 'roomy'];
  var FOCUS_MODES = ['off', 'on'];

  var root = document.documentElement;
  var dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  /* localStorage throws outright in some privacy modes rather than returning
     null, so every touch of it is guarded. A reader who cannot store a
     preference still gets a working app on the defaults. */
  function stored(key, allowed, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return allowed.indexOf(value) >= 0 ? value : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function remember(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {
      /* Nothing to do and nothing worth saying: the app still works, the
         choice just does not survive a reload. */
    }
  }

  function resolve(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    return dark !== null && dark.matches ? 'dark' : 'light';
  }

  /* The status bar takes its colour from the page, read from the stylesheet
     rather than repeated here. A hard-coded theme-color is wrong in whichever
     mode it was not written for, and nobody looks at a status bar on purpose. */
  function paintStatusBar() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta === null) return;
    var page = getComputedStyle(root).getPropertyValue('--page').trim();
    if (page !== '') meta.setAttribute('content', page);
  }

  function applyReading(text, spacing, focus) {
    root.setAttribute('data-text', text);
    root.setAttribute('data-spacing', spacing);
    root.setAttribute('data-focus', focus);
  }

  function apply(mode, palette) {
    root.setAttribute('data-theme-pref', mode);
    root.setAttribute('data-theme', resolve(mode));
    root.setAttribute('data-palette', palette);
    /* `color-scheme` drives the form controls, the scrollbar and the caret. An
       app that repaints its own surfaces and forgets this one gets a white
       scrollbar down the side of a dark page. */
    root.style.colorScheme = resolve(mode);
    paintStatusBar();
  }

  var mode = stored(THEME_KEY, MODES, DEFAULT_MODE);
  var palette = stored(PALETTE_KEY, PALETTES, DEFAULT_PALETTE);
  var text = stored(TEXT_KEY, TEXT_SIZES, 'normal');
  var spacing = stored(SPACING_KEY, SPACINGS, 'normal');
  var focus = stored(FOCUS_KEY, FOCUS_MODES, 'off');
  apply(mode, palette);
  applyReading(text, spacing, focus);

  if (dark !== null && typeof dark.addEventListener === 'function') {
    dark.addEventListener('change', function () {
      if (mode === 'auto') apply(mode, palette);
    });
  }

  /** The one thing the app's modules call. Everything else here is private. */
  window.MoleBridgeTheme = {
    modes: MODES,
    palettes: PALETTES,
    current: function () {
      return { mode: mode, palette: palette };
    },
    set: function (nextMode, nextPalette) {
      if (MODES.indexOf(nextMode) >= 0) {
        mode = nextMode;
        remember(THEME_KEY, mode);
      }
      if (PALETTES.indexOf(nextPalette) >= 0) {
        palette = nextPalette;
        remember(PALETTE_KEY, palette);
      }
      apply(mode, palette);
      return { mode: mode, palette: palette };
    },
    textSizes: TEXT_SIZES,
    spacings: SPACINGS,
    reading: function () {
      return { text: text, spacing: spacing, focus: focus };
    },
    setReading: function (nextText, nextSpacing, nextFocus) {
      if (TEXT_SIZES.indexOf(nextText) >= 0) {
        text = nextText;
        remember(TEXT_KEY, text);
      }
      if (SPACINGS.indexOf(nextSpacing) >= 0) {
        spacing = nextSpacing;
        remember(SPACING_KEY, spacing);
      }
      if (FOCUS_MODES.indexOf(nextFocus) >= 0) {
        focus = nextFocus;
        remember(FOCUS_KEY, focus);
      }
      applyReading(text, spacing, focus);
      return { text: text, spacing: spacing, focus: focus };
    },
  };
})();
