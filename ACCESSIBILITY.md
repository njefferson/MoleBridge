# ACCESSIBILITY.md — MoleBridge

Append-only. Entries are added, never rewritten: what a measurement was on the
day it was taken is the useful record, and editing it away loses the thing that
made it worth writing down.

The gate is [`tools/a11y.mjs`](tools/a11y.mjs). It exits non-zero, it measures
the pixels the browser actually resolved rather than the declarations, and it
runs every state in both themes. Run it with `npm run a11y`.

## What is measured, and against what

- **Text contrast — 4.6:1.** AA is 4.5; a value specced at the line drifts under
  it the first time a neighbouring token moves.
- **Large text — 3.4:1**, where large means 24px, or 18.66px at weight 700.
- **Load-bearing edges — 3.4:1.** WCAG 1.4.11 asks 3.0, but a 1px edge renders
  about 0.15 below its arithmetic because of antialiasing.
- **Touch targets — 44px.** WCAG's AA floor is 24px and its AAA is 44px. This is
  used by touch, on a board at the front of a room, so 44 is the floor.
- **Accessible names.** Every control has one. An icon button labelled only by
  its glyph is a button called "ⓘ".
- **Keyboard reachability.** Focus moves through every control by tabbing
  forward.

## The states it covers

A new screen joins this list in the same commit that creates it, or it ships
unmeasured while the gate stays green. A state that cannot be reached is a
FAILURE in the gate, never a skip.

Welcome; setup; setup showing an error; work while entering coefficients; work
showing a wrong answer with the algebra help; work while choosing which reactant
runs out; the stale-version strip; the information panel; the information panel
showing the diagnostic; finished, showing the code.

---

## 2026-08-25 — 0.1.0, the first measured build

**PASS: 1268 measurements, 10 states, both themes.**

The palette is the Instrument family taken verbatim from the hub's
`palettes/families.json`, and it clears every hard floor in `PALETTES.md`:
worst text 5.01:1 at night and 4.87:1 by day, worst rail 4.68 and 4.05, primary
text AAA in both, tertiary above 5:1 in both.

**Four things the gate found on its first real run**, none of which any test or
type check would have objected to:

- **The stale-version strip was on screen permanently.** A `display: flex` on
  the class beats the `hidden` attribute's user-agent style. The one element
  whose entire purpose is appearing only when a new version is genuinely waiting
  was showing on every load. `hidden` now wins over everything.
- **Small buttons were 40px.** `.button-small` was sized by how loud it should
  look rather than by how hard it is to hit. Raised to 44.
- **Button text borrowed the page token.** `.button` used `--page` as its
  foreground, which in day mode is a warm tan on a dark blue fill — a pairing
  nobody chose, that fell out of reusing a token for a job it was not for.
  There is an `--on-accent` token now.
- **The gate itself was wrong about edges.** It floored every border, including
  decorative dividers, which put every card outline in the app below the line.
  `PALETTES.md` gives an app two edge roles and floors only one. The gate now
  reads the root's own custom properties to tell a rail from a hairline, rather
  than guessing from alpha, so retuning a token cannot quietly reclassify half
  the app.

**The iPad pass: DONE, 2026-08-25.** The owner confirmed the deployed page works
on a real iPad. That is the verification no gate in this repository can perform
— headless Chromium cannot tell whether a target that measures 44px is
comfortable to hit with a finger at arm's length, and it has no opinion at all
about a software keyboard covering the answer box.

**Still owed: the ViewBoard.** The board at the front of the room is a different
proposition from a tablet held at reading distance — further away, a bigger
finger target in practice, and a Chromium build nobody here can test against.
The Chromebook pass is owed too, though it is the case headless Chromium
resembles most closely.

**One thing deliberately kept as it is.** The skip link is revealed by focus and
is a KEYBOARD route. It is not the only way to anything: every screen's first
control is reachable by tabbing forward, so nothing depends on a control a
finger cannot find.
