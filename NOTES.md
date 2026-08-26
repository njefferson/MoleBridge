# NOTES.md — MoleBridge, source of truth

Read this first, every session. `README.md` is for someone using the repository;
this is for someone changing it.

## Thesis

Existing free stoichiometry tools either solve the problem or explain the
procedure. None attribute a specific wrong number to a specific conceptual
failure and report that to the teacher. **Attribution is the product.** Every
design decision below follows from that, and the one thing this must never
become is a solver.

The audience is one classroom: a high school chemistry teacher, students on
managed Chromebooks, a ViewBoard at the front of the room, and Canvas. Static
site, no backend, no accounts, no cookies, offline after first load, and no
student PII ever — identity is a teacher-assigned roster number from 1 to 4095.

## Where this stands

**Session 2 is complete: MoleBridge has a screen.** A student reads what it is,
types the roster number and assignment key off the board, picks a set, and works
problems one step at a time. Wrong steps are diagnosed rather than marked, and
the algebra help lands at the failing step. At the end there is a code to type
into Canvas.

It is installable, it works with no connection, a new version waits rather than
taking over, it shows what changed, and it can produce a text diagnostic. The
accessibility gate passes 1268 measurements across ten states in both themes.

**Nothing is deployed.** See the open obligations at the foot of this file.

**Session 1 is complete.** The domain engine, the completion-code codec and the
test suite are built and green: 107 tests, a clean strict type check with no
`any` in the tree, and no runtime dependencies at all. There is no user
interface, on purpose.

The two numbers session 1 existed to produce:

- **Taxonomy collisions: 0**, over 10,000 generated problems and 135,564
  predicted wrong values.
- **E-UNCLASSIFIED rate: 10.32%** over 34,422 deliberately wrong entries. About
  a quarter of the sweep's entries are a factor of ten out and are unclassified
  by definition, so that is close to the floor for this sweep rather than a
  gap in the taxonomy.

Both are printed by `npm test` and by `node tools/cli.ts scan`.

## Settled decisions, and the reasoning that is easy to lose

### Where the specification contradicted itself, and what was implemented

**The completion code is 120 bits, not 115.** §8.2 heads the payload "115 bits"
and then sums its own field list to 119, padded to 120 for exactly 24 Base32
characters. 119 is the correct sum for the fields listed and 120 is the only
total that gives 24 characters, so the implementation is one leading pad bit
plus 119 bits of fields and MAC. The "115" is an arithmetic slip in a headline,
contradicted three lines later by the specification itself.

**The MAC covers the leading 96 bits, which is exactly the first twelve bytes.**
§8.3 says "the 96-bit payload prefix", and the fields before the MAC are 95
bits. The pad bit plus those 95 bits is 96, byte-aligned, so both statements are
satisfied at once and nothing had to be invented.

**The A4 remediation fires above half an order of magnitude, not one.** §7 asks
for A4 on "E-ARITH with |log10 error| >= 1", but §6.2 has already reclassified
anything that far out as E-UNCLASSIFIED — taken literally the branch is dead
code. A4 is the magnitude-checking remediation, so it fires on an arithmetic
slip bigger than about a factor of three and stops where E-UNCLASSIFIED begins.
The threshold is `SCINOT_TRIGGER_LOG10` in `src/engine/tolerance.ts` with the
reasoning beside it.

### The decomposition fix §6.2 demanded

**E-LIM-WRONG and E-LIM-BYMASS were one observable, and the stages were split
rather than a tiebreak added.** With exactly two reactants there is one wrong
box to tick at the comparison stage, so both classes predicted the same entry.
§6.2 forbids a tiebreak heuristic and says to fix the decomposition, so:

- **S4c**, the choice of limiting reactant, reports a wrong choice as
  **E-LIM-BYMASS** — comparing the two stated masses is the overwhelming reason
  a student picks wrong there, and §7 routes that class to the proportion
  remediation, which is the one that helps.
- **S5**, the mole yield carried forward, reports **E-LIM-WRONG** when the
  student chose correctly at S4c and then entered the other reactant's yield.
  That is a distinct, common and separately observable event.

### Generation guarantees added because a collision sweep found something

Each of these exists because a scan over generated problems found two classes
predicting the same value. In every case the fix was to refuse to pose the
problem, never to add a heuristic to the classifier.

- **`MOLAR_MASSES_SEPARABLE`.** Where the given and the wanted substance weigh
  nearly the same per mole, substituting one molar mass for the other moves the
  answer less than rounding does. E-CONV-FACTOR and E-ROUND-EARLY became one
  observable at S6, and E-RATIO-MASS and E-RATIO-UNBALANCED became one at S4.
  Two collisions in the first 200 problems; both were this shape.
- **`LIMITING_MARGIN_MET`** gained a second condition. The chemistry condition
  is that two reactants within a hair of each other make the comparison a coin
  toss. The taxonomy condition is that the other reactant's yield has to be a
  different number at the precision the student writes, or E-LIM-WRONG cannot
  be told from having rounded early.
- **`YIELD_SEPARABLE`.** A yield near 100% makes the upside-down fraction land
  on the right answer: 100/y and y meet at y = 100.

After these, 10,000 problems produce zero collisions.

### Other judgement calls

**Molar mass reports two precision answers, and neither is guessed.** A molar
mass is a sum, so the arithmetic rule that governs it is addition's — the
coarsest decimal place among the contributing weights. §5.3 asks instead for the
fewest significant figures among the contributing elements. For water those give
18.015 and 18.02. `MolarMass` carries both, names the element that set each, and
leaves the marking decision to the E-SIG-FIGS class rather than picking one
silently.

**Significant figures are graded only at the last stage.** Rounding an
intermediate is E-ROUND-EARLY, an error in its own right, so a stage machine
that demanded a rounded intermediate would be marking students down for the
thing it elsewhere calls a mistake.

**Element weights are never padded to five figures.** §5.1 asks for at least
five significant figures and says never to round in the data file. Those two
pull against each other: IUPAC publishes hydrogen's conventional weight as
1.008, four figures, on purpose, because the isotopic composition varies between
natural sources and a fifth digit would claim the sample is known. The file
carries what is published, and `sigFigs` records how many figures that is.
Writing 1.00800 to tidy a column would be inventing a measurement.

**Two problem kinds in the specification's spirit were not built.**
Mass-to-moles and moles-to-mass would make stage S6 an identity conversion,
which is a stage that cannot fail and therefore cannot teach anything. The four
kinds built — mass to mass, mass to particles, mass to volume at STP, limiting
reagent, percent yield — all keep every one of the six gated stages real.

**Node strips the TypeScript, so the tree has no runtime dependencies and no
build step.** `tsc` is the only entry in `devDependencies`, present to type
check rather than to compile. That is the strongest supply-chain position
available and it matches the no-third-party-runtime-dependencies constraint
exactly rather than approximately.

**SHA-256 is implemented in the repository.** WebCrypto's digest is
asynchronous, which would make the codec asynchronous, which would make the step
machine asynchronous. `node:crypto` does not exist in a browser. A package is
ruled out by the same constraint. The tests cross-check the implementation
against `node:crypto` over random input, which is the one thing it cannot do for
itself.

### Two defects the tests found, worth remembering

**`formatSigFigs` measured the magnitude before rounding.** 9.96 at two figures
came out as `10.0`, which reads as three. It surfaced through a taxonomy fixture
that fed a predicted wrong value back in and got E-UNCLASSIFIED, because the
entry written at four figures had silently become five. The fix is to round
first and measure the rounded value.

**The particle-count problems were being silently rejected.** A physical-bounds
guarantee applied a classroom-balance range to every stage value, and
1.4e24 particles is the correct answer rather than an absurd one. Tier 2 looked
healthy and had quietly lost a whole problem kind. The test that catches it now
asserts that every problem kind actually appears in a sweep.

## What session 2 found, and what it changed in the engine

Building the screen found four defects in the engine that no test had objected
to, because every one of them produced correct output.

**The algebra help handed over the answer.** A worked line ended
`mol N2 = 878 / 28.01 = 31.34`, which is the value the student is stuck on. The
magnitude help was worse: it printed a one-figure estimate, and no intermediate
stage grades figures, so typing that estimate back in was accepted. There is a
gate now — no help may show a number that would be marked correct at the stage
it appears on — and it checks 17,000 numbers across 23,000 worked lines against
the classifier itself.

**The classifier accepted an answer of 2 for a value of 1.627**, because at one
significant figure they agree and only the last stage grades figures. An answer
23% out was correct at every other stage. Entry is now judged at no less than
the precision the problem states.

**The quantities were not of this world.** The physical-range guarantee used the
limits of arithmetic rather than of a school laboratory, so the generator posed
a kilogram of propane. Masses now sit between a tenth of a gram and a few
hundred — and tightening that range starved the generator, because the same band
was being applied to mole counts, which legitimately run a thousand times
smaller. That is LESSONS 140 recurring in the repository that wrote it.

**The mole-ratio stage had the wrong remediation shape entirely.** It was
explained as "multiply this by that", which describes the step after it. It now
names the two coefficients by substance.

## Decisions the screen settled

**One thing on the board.** The completion code needs a 12-bit assignment id and
the generator needs an assignment key. The id is derived from the key, so a
teacher writes one thing and a class of thirty types one thing. Twelve bits
collide; that is fine and is not a security property.

**Units are typed, never chosen from a list.** A dropdown would turn "which unit
is this step in" — which is the chemistry — into a guess between four options,
and would make E-UNIT-MISSING unreachable. The hint says a unit is needed and
does not say which.

**Significant figures are graded only at the last stage**, as the engine always
intended: rounding an intermediate is E-ROUND-EARLY, so demanding a rounded
intermediate would mark students down for the thing the app elsewhere calls a
mistake.

**The palette is the Instrument family, taken verbatim.** `palettes/molebridge.json`
holds it in role terms and the hub's gate measures it. Reskinning is a matter of
swapping that file, which is what `PALETTES.md` exists for.

**Session 3 — the teacher decoder — is built**, at `/teacher/`. Three decisions
in it are worth keeping:

**Everything that is not a code is discarded, and the reason is not tidiness.**
A pasted gradebook column contains student NAMES. This application has no field
for one and must never acquire one, so `extractCodes` finds the code token on
each line and throws the rest away — and the page says so above the box, before
anything is pasted. A test asserts that a realistic paste's names appear nowhere
in the parse, and the browser walk asserts they appear nowhere on the rendered
page.

**A code from another assignment still verifies.** The MAC is keyed with the
assignment id carried inside the code, so last week's code is a perfectly valid
code — it is simply not this one. That has to be compared explicitly or a class
silently looks better or worse than it was. It is counted separately and named.

**Nothing that could not be counted is dropped quietly.** A decoder that shows
twenty-six results for a class of thirty is worse than useless, because the four
that went missing are the students the teacher needs to know about. Lines with no
code, codes that failed their check, codes for another assignment and duplicate
roster numbers are all reported with their line numbers.

**The print view is the one place this app uses a grid**, and deliberately: a
printed class list is read on a fixed-width page at a desk, so none of the
reasons the screen avoids one apply. The print stylesheet is measured by the
accessibility gate as its own state, because a shipped surface nobody looks at
is how an unreadable one survives.

## Waiting on the owner — a candidate is deployed

**Version 0.2.0 is live on a preview URL**, from commit `ae86390` on `staging`:

    https://45f826d7.molebridge.pages.dev

That is the immutable per-deploy URL for this exact build, read out of the
deploy log rather than assembled from a branch name. Cloudflare also serves a
moving alias per branch; that one was NOT printed in the log, so it is not
written here as fact.

**This URL is not chased, and that is deliberate.** Every push deploys, so every
push mints a new deployment id — including a commit that changes only this file,
because `public/` is what goes out and a docs commit leaves it byte-identical.
Writing the newest id down here would therefore create a newer one, forever. The
id above is immutable, still answers, and serves the same site as every later
docs-only deploy; the authoritative current id, when one is genuinely needed, is
in the newest deploy job's log.

**The old alias has stopped moving.** `https://claude-molebridge-engine-cod.molebridge.pages.dev`
served every build up to 0.2.0 at `8920f67`, and will keep serving that one:
gates no longer run on the harness branch, so nothing deploys from it. Anyone
holding that address is holding a build that will never advance, which is worth
knowing before it is handed to a class.

**Production is empty, and that is correct.** `main` is the Pages production
branch and the code is not on `main`, so `molebridge.pages.dev` answers with
nothing until somebody merges.

**What the run actually did**, from the log rather than from its exit code: the
token was verified, the Pages project confirmed, the build uploaded, and the
live page then fetched from the runner — every required header present, `sw.js`
served `no-cache`, and the returned HTML actually loading `/app/ui/app.js`
rather than a holding page. The deploy job took the build the gates passed as an
artifact, so the bytes that went out are the bytes the journey walk drove and
the accessibility gate measured.

**The iPad pass is done** — the owner confirmed the deployed page works on a
real iPad, 2026-08-25. That is the check no gate here can perform.

**The headers are checked by the runner now.** This sandbox's proxy denies
`*.molebridge.pages.dev` at the CONNECT stage — its own relay log records
`connect_rejected, gateway answered 403` for that host while `github.com`
answers normally — so the fetch that Doctrine §16.8 requires cannot happen from
a session. It happens on the runner instead, immediately after the deploy: the
page is fetched, and the run fails if `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Cross-Origin-Opener-Policy` or `Permissions-Policy` is
missing, or if `sw.js` is not served `no-cache`, or if what came back is not
MoleBridge. A gate rather than a manual step handed over.

**The production URL answers.** `https://molebridge.pages.dev` was opened by the
owner on 2026-08-25 and works. That is the check no gate here can perform: this
sandbox's proxy refuses `*.pages.dev`, and until this the deploy job's own
assertions had only ever run against the immutable per-deploy host — a different
address that had existed for nine seconds. The apex follows a push, so
Cloudflare's production branch is correctly configured.

**Still owed to a real device: the ViewBoard, and a Chromebook.** The board at
the front of the room is further away and runs a Chromium nobody here can test
against.

## The lessons, and the circular test that would have shipped

The seven lessons compute their numbers from the engine rather than typing them:
a worked example with a hand-typed molar mass can disagree with what the app
grades, silently and forever, in the one place a student is being told how it
works.

**The first version of that was only half true, and one question found it.**
Eleven drill answers were bare literals — atom counts, balancing
coefficients, mole ratios, limiting reactants, percent yields. And the test that
looked like it covered them, *every drill's own stated answer passes its own
checker*, is CIRCULAR for a literal: had the oxygen count been typed as 13, the
checker would have accepted 13 and the test would have gone green.

What each of them became:

- **Atom counts, ratios and percent yields** are computed from `parseFormula`
  and from the arithmetic being taught.
- **Balancing coefficients stay declared, because of a rule.** `solveBalance`
  must not be reachable from any student-facing path and `lessons.ts` ships to
  the browser, so importing the solver to generate an answer would put a working
  balancer in the bundle. They are verified in `lessons.test.ts` instead, which
  never reaches a student. The constraint pushed this from deriving to checking,
  and checking is the stronger of the two anyway.
- **Limiting reactants** are checked in the test against moles ÷ coefficient —
  the rule the lesson teaches — so the answers and the rule cannot disagree
  without something failing.

Two plants confirmed the new checks fail: a wrong coefficient and a wrong
limiting reactant were both caught by name.

**A third plant passed, and that is the part worth keeping.** Swapping the atom
count's symbol from O to S made the answer self-consistently 3 while the
question still read "How many oxygen atoms" — every test green, content wrong.
Computing an ANSWER does not protect the PROSE around it. The fix is
structural rather than another check: the element's name is looked up from the
same symbol the count is taken with and the sentence is generated, so the
question moves with the arithmetic. Swapping the symbol now reads "How many
sulfur atoms in Al₂(SO₄)₃? → 3", which is wrong-but-honest rather than
right-looking-and-false.

## Three doors, and the code wall is one of them

The owner's shape: practice is the main destination, learning easy to get to, a
class assignment beside them. Two of the three are built; **Learn joins the menu
in the commit that builds it**, because a door that opens onto an apology is
worse than a door that is not there.

**The doors ARE the code wall, made visible.** Practice shows answers on
request, so if practice could also emit a completion code then "practice" would
be the route to credit for work the app did in front of you. A student can see
that the assignment door is the one with a code at the end of it, rather than
being told so in prose nobody reads.

**And the wall is in the engine, not the screen.** `completionPayload` THROWS on
a practice session rather than returning something a caller is trusted to
discard. A screen that must remember not to render a button is not a wall; a
function that refuses is. Asserted by a test that also checks the same session
in assignment mode still works, so the refusal is about the mode rather than
about something else being broken.

**The seed is rolled AND shown.** The engine is deterministic from a key, and a
Random button that kept its roll to itself would throw that away — a student who
got one wrong could never return to it, show a friend, or bring it to a teacher.
Random rolls a word-pair seed, puts it in the field, and the field takes one
typed back. The words are short and unambiguous when spoken because they get
read across a classroom; a base-32 hash would not survive that trip. `Math.random`
belongs here and nowhere else in this repository: nothing is graded from it and
the one thing it must not be is reproducible.

**The reveal is per stage, and gated on the session rather than the CSS.** It
shows one step, resets at every stage — asking about one step is not asking
about the rest — and `work.ts` checks `session.config.mode` rather than whether
the button happens to be visible. A hidden control is a stylesheet fact; a
graded session refusing to answer is a program fact, and only the second one
survives someone styling the page differently. What it shows comes from
`correctEntryFor`, the grader's own function, so a revealed answer is exactly
what the student would have been marked against.

### A flake found by running the gate ten times instead of once

The walk went green, then red, then green. Six runs isolated it: `dialog.close()`
fires its `close` event as a QUEUED TASK rather than synchronously, so the
orientation's move into the ⓘ panel happens a tick after the click returns — and
the assertion that read the DOM immediately afterwards was racing the browser
and losing about one run in three.

The app was right and the check was wrong; it waits now. **It had already passed
twice before it first failed**, which is the whole point: a gate run once is not
known to be stable, and a flaky gate passing on the first attempt is
indistinguishable from a working one. Ten consecutive clean runs after the fix.

## The first run is a modal, because its button was below the fold

The orientation was a full-height screen, and on a real device the **Get
started** button that dismissed it sat below the bottom of the viewport. The one
control that mattered was the one thing a reader could not see, and nobody
scrolls a wall of text they did not ask for looking for a button they do not
know is there. It shipped that way from the first release and was found by the
owner on a device, not by any gate.

It is a `<dialog>` now: the body scrolls INSIDE the panel and the action bar is
pinned to the bottom of it, so the button is on screen at every height. The app
is behind it rather than replaced by it, which answers "what is this thing"
better than a page of prose in front of it does.

**Every route out goes through `close`, not through the button.** A dialog can
also be dismissed with Escape or the backdrop, and §7e requires the orientation
to survive whatever the reader presses to begin — so the move into the ⓘ panel
is wired to the dialog's `close` event and there is no path past it that loses
the block.

**`100dvh`, not `100vh`.** On a phone browser `vh` is the height WITHOUT the
address bar, so a panel sized against it is taller than the visible area and
puts the action bar back off screen — the same defect wearing a different hat.

### The gate could not have caught this, and now can

The journey walk ran at 1280x900, which is roomy enough that the old full-height
screen fitted. A check there would have passed throughout the defect's entire
life. It now asserts that the button's box lies inside the viewport at four
sizes: a phone upright, a phone on its side, a small Chromebook window, and a
full window.

Planted by taking away the scrolling body so the action bar scrolls with the
content — the original failure exactly. Three of the four sizes went red, the
button landing at 1609 on a 664-high phone, **and the full window passed**,
which is the whole reason this survived as long as it did.

A first attempt at planting removed the panel's `max-height` and everything
stayed green: a `<dialog>` carries its own user-agent height cap, so that rule
was not the load-bearing one. Worth recording — a plant that fails to break
anything is evidence about the plant, not about the gate.

## The icon, three drawings later — and a gate that lied about it

**The first icon read as a frowning face**, and shipped that way for three
releases. Recorded in full further down; the rule it taught is that small shapes
above a curve inside a rounded square IS a face schema, so the fix is to remove
the row of shapes rather than rearrange it.

**The second did not read as an animal.** It was drawn from a supplied mole SVG
placed onto the arch, and it was an animal-shaped lump: no leg separation, a
snout that was a bump rather than a point, the shovel forepaw buried inside the
body outline, and — the part nothing in a source file would show — the white
animal merging into the white arch the moment they touched, so it read as one
blob on another.

**What fixed it was silhouette, not detail**, which is worth writing down
because the instinct is to add features. The nose projects past everything else;
the back humps; the tail is short and clear of the body; one foreleg descends to
the bridge and ends in the broad digging paw a mole is actually known for. The
tile-coloured outline round the whole animal is load-bearing rather than
decorative: without it there is no edge between the mole and the thing it is
standing on.

**The third grew a fifth leg.** The foreleg was a separate shape with its own
outline laid over the body, and with two hind feet already drawn the animal had
three legs and a tail — a limb sprouting from the shoulder. The body is now ONE
CLOSED PATH with the legs cut into its underside: back, head, snout, under the
chin, down the foreleg, across the spade foot, up, along the belly, down the
hind leg, and home. **A leg that is part of the outline cannot detach from it**,
and a side profile shows two legs rather than three.

Four rounds, each rendered at 260, 128, 96 and 48 and looked at. The foreleg was
boxy in round two and read as a satchel. Every one of these was invisible in the
source and obvious the moment it was rendered, which is the whole argument for
rendering rather than reading.

**ONE DRAWING, EVERYWHERE — the two-file argument was lost on purpose.** A
second, simpler `favicon.svg` briefly existed on the reasoning that a mole at
sixteen pixels is a bump and one file cannot be both a home-screen tile and a
favicon. That reasoning is correct and the conclusion was still wrong: the job
of a favicon is to be RECOGNISED in a row of twenty tabs, not to be legible on
its own, and a tab showing a different mark defeats that more thoroughly than a
soft one. The owner made the call; the file is gone and both `rel="icon"` links
point at `icon.svg`.

**The claws were deleted before they were drawn, and that is the whole lesson.**
0.4.2 cut a claw notch out of the foot; it read as a slot, and the response was
to remove it and describe that in the commit message as cutting detail that only
ever cost something — a tidy sentence over a thing given up on, leaving a mole
without the one feature a mole is known for. It was caught by somebody looking
at the drawing; no gate caught it, and no gate could have.

**What fixed it was where the claws live, not how they are shaped.** A knockout
is a mark ON a shape and dissolves as the shape shrinks; a point on the
SILHOUETTE survives. The claws are three points fanning forward off the front
foot, part of the same closed path as the legs, and they still read at 96
pixels. Three treatments were drawn and compared — a forward fan, a downward
rake, and an outsized hand. The rake read as saw teeth. The outsized hand pushed
the claws past the snout, which gives the animal two things competing to be its
front, so the fan is deliberately short of the nose.

**The hind leg sits about a third back rather than at the tail, and that is not
anatomy.** It was placed where the belly curve was flattest. Moving it rearward
lengthens the overhang behind it, and a long body with limbs at both extremes
over a low arched back reads as a TURTLE — which is why it stays where it is.

**0.4.0's lump reached staging and a preview URL and never reached production.**
That is the branch model doing exactly what it is for, on its first real test.

### The version gate was reporting a fact about a different release

Writing `## 0.4.1 — FIX` should have failed: the three permitted kinds are
VERSION, CAPABILITY and ITERATION, and FIX is not one of them. The gate printed
**ok — it is a CAPABILITY release** and passed.

The check was `/^## \S+ — (VERSION|CAPABILITY|ITERATION)\b/m`, and with the `m`
flag that finds the first valid kind ANYWHERE in the file. It had read the kind
off `## 0.4.0 — CAPABILITY`, further down, and reported it as though it were the
release being made. It is anchored to the top entry now, prints the heading it
actually read when it fails, and was planted with a bogus kind to confirm.

It was caught only because the printed line disagreed with what had just been
typed. **A gate whose output nobody reads is merely useless; one that is read
and believed is worse when it lies.**

## Themes: two axes, six palettes, and a gate holding three files together

The owner asked for green as the default and for selectable light, dark and auto
in different colours. PALETTES.md §6 already prescribes the shape — palette and
mode as INDEPENDENT axes — so this follows it rather than inventing one.

**Colour means the accent, and that is not a dodge.** The four families in
PALETTES.md vary chrome WARMTH rather than hue; all four are neutral pages. A
person asking for a green app is asking about the accent, so the neutrals stay
the Instrument family in every theme and only `accents.primary` moves. Three
themes ship: **moss** (green, the default), **harbour** (the blue this app was),
and **clay** (warm). Six palettes in all, and `npm run palette` measures every
one against every hard floor in both modes.

**The values are measured, not chosen.** Two other greens were rejected at 4.12
and 4.15 against the light page, and an ember at 4.43. The three that ship sit
at 4.83, 4.87 and 5.13 at their worst pairing.

**`auto` is resolved in JavaScript so the light values are written once.** The
obvious CSS shape is a `prefers-color-scheme` block plus an attribute block,
which is the must-change-together pair PALETTES.md says has bitten this family
repeatedly. Instead `public/theme.js` resolves the preference before first paint
and the stylesheet only ever sees `data-theme="light"` or `"dark"`. The
preference itself lives in `data-theme-pref`, so the picker can show `auto` as
`auto` while the CSS sees a concrete answer.

**It is an external blocking script rather than an inline one.** §6 asks for an
inline one-liner. This app has NO inline script, which is the entire reason a
Content-Security-Policy is still reachable without `unsafe-inline`. A blocking
external file in `<head>`, after the stylesheet so it can read `--page` back out
for the status-bar colour, gives the same no-flash result and keeps that door
open. It cannot be a module: a module is deferred by definition and would run
after the paint it exists to prevent.

**One duplicate survives and is gated.** A reader with JavaScript off never gets
`data-theme` at all, so the light tokens appear a second time under
`prefers-color-scheme` for that case only. `tools/tokens-check.mjs` holds the two
blocks character-identical, holds every value in the stylesheet to what the hub's
gate measured, and refuses a picker offering a theme nobody measured. All three
rules were planted red before the gate was believed.

### What the theme work found in the accessibility gate

Adding the picker put the first `<label>` wrapping its own control into this
app, and the gate did not know what one was. It reported 144 failures, and both
kinds were the gate rather than the picker.

**No accessible name.** A label element wrapping its input is a naming mechanism
the HTML accessibility mapping defines and every browser implements. The gate
checked `aria-label`, `aria-labelledby`, `label[for]`, own text and `title` — not
that. Thirteen states of green had meant "this app contains no wrapping labels",
which is not the same as the rule being satisfied.

**Twenty by twenty pixels.** The gate measured the radio, which is 20px. What
activates a control is what a finger has to hit, and clicking anywhere in a
label activates the control it wraps — so the label's box is the target, which
is how a 20px radio gets a 44px reach without drawing an absurd 44px circle. The
gate now measures the label when one contains the control, NAMES the substitution
in its output rather than applying it quietly, and was planted with an
undersized label and a bare unlabelled input to prove it did not go blind.

5046 measurements across 13 states, three colour themes and both modes.

**And a trap in the walk, worth writing down.** The first version asserted clay's
night accent after choosing Clay. It failed, because the mode was still `auto`
and the machine running it prefers light — so the check depended on the runner's
operating-system setting rather than on the app. That is a flake with a
plausible-looking cause, which is the worst kind. The assertion is mode-aware now.

## The social preview, and what drawing it found

`npm run og` renders `tools/og-card.html` at 1280x640 and writes `og.png`. The
card is HTML rather than an SVG with letter paths, because Doctrine §3 wants the
artwork wordless and the lettering set in real type over it — a path cannot be
re-set at another size and goes wrong the first time a word changes. The PNG is
not committed, for the same reason the icons are not.

**The renderer measures rather than looks.** Every run of text is checked
against the colour actually behind it and the render fails below 4.6:1. One
place is a BOUND rather than a reading, and it is written into the tool: the
page is a gradient, and `getComputedStyle().backgroundColor` reports transparent
for a gradient — a compositing walk would climb straight past it, end at white,
and pass everything. So reaching `<body>` substitutes the lightest the gradient
can reach with the accent tint over it. Every piece of text here is light on
dark, so the lightest backdrop is the worst case.

It also asserts the chip row fits on ONE line. `flex-wrap: wrap` would have hidden
an overflow by succeeding quietly; the row is `nowrap` so overflow is visible,
and the renderer turns visible into failing. It caught a real one immediately.

**And then the card found something about the icon.** Drawn at 264px next to
type, `public/icon.svg` reads as a FROWNING FACE: three particles become two eyes
and a brow, the centre post becomes a nose, and the arch under them becomes a
downturned mouth. It is worst at 32 and 16 pixels, where it is unambiguous. On an
app whose entire purpose is telling a student they got something wrong, an
accidental sad face is the single worst symbol available.

Rearranging the particles does not fix it and made it worse in both attempts —
moving them into a diagonal produced a winking face, and putting them on a deck
above an arch produced a grin with teeth. **The rule is the composition, not the
arrangement: small shapes above a curve inside a rounded square IS a face
schema.** The fix has to remove the row of shapes, not reposition it. Three
bridge silhouettes without floating shapes were drawn and none reads as a face;
a suspension bridge among them reads as the letter M, which is its own accident.

Nothing has been changed. The icon is an installed identity — it is on a home
screen — so which one ships is the owner's call, and until it is made the social
preview should not be uploaded either, because the glyph goes on it.

## Reporting a problem, and what the assurance under it costs

**Two taps, and nowhere to type.** A ⚑ in the chrome on every screen opens a
panel; the student picks the closest of eight symptoms, written in a student's
words rather than an engineer's, and copies a report.

**THE MISSING FREE-TEXT BOX IS THE DESIGN.** "Describe what happened" is the
obvious field and it is the one thing that would turn *this contains nothing
about you* from a fact about what the app collects into a promise about what a
fifteen-year-old typed. Somebody puts a name in it. With no box, the report is
generated entirely from what the app already knows about itself, so the sentence
printed underneath is checkable — and `test/report.test.ts` checks it, the walk
checks it against a real session, and the panel is asserted to contain zero text
inputs so that whoever edits the markup next cannot quietly add one.

**The diagnostic was carrying the roster number while saying it did not.** The
old sentence was "no answers and no name". That was TRUE — a roster number is
not a name, and it was in there on exactly that reasoning — and it is narrower
than any reader would take it. The roster number is the identifier this whole
app is built around and the one a teacher's gradebook maps back to a person. It
is out of both surfaces now, and the assurance is written as what the report DOES
carry followed by what it does not, by name.

Worth noting how it survived: the walk asserted `report.includes('no answers and
no name')`, so the sentence was gated. **A gate on the wording is not a gate on
the claim.** What replaced it checks that the body contains no roster number at
all, which is a fact rather than a phrase.

**`ReportInput` has no field for it.** Not omitted from the output — absent from
the type, so a report that carried it would have to be a different shape. That
also meant splitting the deciding from the gathering: `src/report/render.ts` is a
pure function over plain data with no browser in it, and `src/ui/report.ts` does
nothing but collect facts and call it. The test needs no `navigator` stub, which
matters because a stub passes when the GUESS about the browser is right rather
than when the code is.

### The permissions gate, and its three plants

The other half of the ask was that none of this asks for anything. It does not,
and *does not* is a fact about a moment: a photo of your working, a notification
when a new version lands, a wake lock for a long problem are all sentences
somebody would say in good faith, and each would put a permission prompt in front
of a student on a school device.

`tools/permissions-check.mjs` reads the BUILT BUNDLE — not the source it came
from — for twenty-one APIs that can raise a prompt, and reads `public/_headers`
for twenty features that must stay denied. `Permissions-Policy` now names 28
denials.

**One allowance, named: `clipboard.writeText`.** Writing from a click prompts in
no current browser, and `clipboard-read` is denied outright — reading is the half
that could see something a student never meant to hand over. The gate also
requires every write to sit inside a `try`, because a copy button that silently
does nothing reads as the app being broken rather than as the clipboard being
unavailable.

Planted red three times before it was believed: a `getUserMedia` call added to a
UI module, `camera=()` removed from the header, and a clipboard write with its
fallback deleted. All three fired.

### What the accessibility gate found the moment the panel joined it

Adding the report panel as a measured state — same commit as the surface, per hub
LESSONS §28 — failed immediately: the symptom rows measured 42px against the
44px touch floor, in all six palette-and-mode combinations.

Two faults, and the second is the general one.

**`.theme-axis` was styled only as a descendant of `.theme-picker`.** The report's
fieldset carried the class and got none of the rules. Reusing a class name whose
every rule is scoped to one ancestor gets the name without the styling, silently.
Those rules are scoped to `.theme-axis` now, since the shape is general and the
picker was only the first thing to want it.

**`min-height` does nothing to an inline element, and a `<label>` is inline.**
`.choice` had declared `min-height: var(--touch)` since the first release, and it
had only ever held where a `.choice` happened to be a flex item of `.choices` —
because a flex item is blockified and a bare label is not. The floor was inert
everywhere else and nothing said so. `.choice` now sets `display: flex` first,
with the reason written above it.

Neither is visible in source review: both files read as though the floor is
declared. The gate measured resolved pixels, which is the whole reason it
measures rather than reads.

## The reference, and the two gaps it found by existing

Attribution is the thesis: MoleBridge does not mark an answer wrong, it says
which mistake produced that exact number. **That is worth nothing if the sentence
is the last word.** A student who reads "the ratio is upside down" and does not
already know what the ratio is has been told the name of their problem and
nothing else — which is the failure this app was built to fix, reappearing one
level up.

So every class the engine can attribute has a page: what happened, how to spot it
in your own working, what to do instead, and the lessons that teach it. A wrong
answer carries a **What does this mean?** button straight to the right page, and
the Learn screen has a door into the list for somebody who came to look something
up rather than because they got something wrong.

**A DIALOG, NOT A SCREEN.** It opens mid-step with a half-finished problem
underneath. A screen would have to unmount the problem, remember where the
student was and put them back — three chances to lose their place, in the one
moment they are already stuck. The walk asserts the problem is still there after
the panel closes, because that is the reason it is a panel.

**It opens AT the entry.** Landing somebody on a contents page of twenty asks
them to diagnose themselves before they can read the diagnosis, and the app
already knows which one they need.

**Both directions are gated.** `reference.test.ts` holds the entry list to
`ERROR_CLASSES` in both directions: a class with no page is a dead end, an
orphan page is one nobody can reach, and neither shows up by reading either file.

### The lesson link is derived, and the first version of it was a coin toss

`Lesson.answers` already declares which classes each lesson answers. Writing the
reverse edge by hand would be the same fact in two places, so `lessonsForClass`
reads it off `LESSONS`.

It returned the FIRST match to begin with. That is a lie the moment two lessons
legitimately claim the same class — a conversion applied upside down is taught by
the units lesson AND by percent yield, and which one a particular student needs
depends on the step they were on, which the reference cannot know. It returns all
of them now and the page offers every route. **Picking one by array order is a
coin toss wearing a suit.**

### The eighth lesson, found by a class with nowhere to point

Requiring every class to have a lesson made `E-CONV-FACTOR` fail immediately: no
lesson claimed it. Following that back, **MoleBridge has always set problems that
ask for litres of a gas at STP or a number of particles, and nothing taught those
conversions.** The lesson set went grams, moles, ratio, limiting, percent yield
and stopped.

"Litres, particles and other units" is the eighth lesson. Its numbers come from
`STP_MOLAR_VOLUME_L` and `AVOGADRO` — the same constants the grader uses — rather
than being typed, which is the rule the circular-test finding left behind.

**It cost a progress-code version bump.** The lesson field was seven bits with
twelve reserved; the eighth came out of reserved, which is what reserved was for.
But the lesson bits sit ahead of everything else, so widening the field shifts
every field after it, and a version 1 code read under the new layout would report
the wrong practice count rather than failing — the worse of the two outcomes.
`PROGRESS_VERSION` is 2 and a version 1 code is refused by name. Nothing was
deployed carrying one, so this cost nobody anything; six months from now it would
have.

### A prose defect in the percent-yield lesson, found while reading it

It said percent yield is "the first divided by the second — actual over
theoretical", where the first thing named was the theoretical yield. The two
halves of one sentence gave opposite instructions. Every test passed, because
nothing tests a lesson's prose against its own arithmetic. Fixed to name the
quantities rather than their positions.

### The walk was asserting a literal

`check(lessonCount === 7)` went red the moment an eighth lesson landed — a check
reporting a deliberate change as a defect, which teaches whoever hits it to edit
the number without reading why. It counts `LESSONS.length` now.

## The calculator, and the line it must not cross

The owner asked for one. The design question is not how to build it — it is what
it must refuse.

**A calculator that understands chemistry deletes the product.** `E-MM-ARITH`,
`E-MM-PARSE` and `E-MM-HYDRATE` exist because working out a molar mass is a thing
a student does and gets wrong in recognisable ways. `E-CONV-FACTOR` and
`E-CONV-INVERTED` exist because choosing and applying a factor is. A box that
takes `CuSO4·5H2O` and returns 249.68 does not help a student who cannot do that
— **it removes the step, and with it every diagnosis MoleBridge could have given
them about it.** Five of twenty classes, gone, in exchange for a convenience free
tools already offer.

So it evaluates numbers and the four operations. A letter anywhere in the input
is an error rather than an identifier, and `calculator.test.ts` feeds it **all
118 element symbols** and seven real formulas. Structural rather than a
blocklist: a blocklist is a list somebody forgets to extend.

**No `eval`, no `Function`.** Not primarily for safety — the input is the
student's own and the CSP forbids both — but because `eval` would ACCEPT exactly
what this has to refuse. `Math.sqrt`, a bare identifier, a property access: all
valid JavaScript, none of it belongs in a box meant to do sums. A hand-written
recursive descent refuses by construction. The grammar is four operators and a
bracket, so the parser reads like the grammar.

**It does not round to the problem's precision.** Rounding there would make the
significant-figures decision for the student, which is a graded step and its own
error class — `E-SIG-FIGS` and `E-ROUND-EARLY` both live on exactly that
boundary. Ten figures, and nothing said about how many belong.

**Empty on every open**, asserted by the walk. A calculator that remembers is one
step from a calculator that knows which problem you are on.

**The refusal is walked on a real screen**, not left to the unit test: the walk
types `CuSO4`, checks the message names what the box is for, and checks the
refusal itself leaks no number.

The accessibility state measured is the REFUSAL rather than a result — it is the
longer message, it is where a student who typed a formula lands, and it is text
on a surface rather than a number in an accent-soft box. Measuring the happy path
would have measured the easier of the two.

## The periodic table, and two things it found

Atomic weights, and a student who wants a molar mass adds them up — the same line
the calculator draws, for the same reason. Adding four atomic weights IS the step
`E-MM-ARITH` and `E-MM-PARSE` are about. `table.test.ts` asserts the module
exports nothing whose name mentions a formula, a compound or a molar mass.

**The layout is COMPUTED from the atomic number**, not typed out. A hand-written
grid of 118 positions is 118 chances to put an element in the wrong group, and
every one of them looks plausible in a diff. The rules are the ones a chemist
would state — the short periods skip the d-block, the f-block lifts out of
periods 6 and 7 — and the test checks the landmarks: hydrogen top left, helium
top right, boron at group 13 rather than 3, hafnium at group 4 rather than 19,
thirty f-block elements in two rows and nothing else in those rows.

**The DOM is in atomic-number order and the CSS grid does the placing.** Built in
visual order the markup would match the picture and the reading order would be
nonsense; built in atomic-number order a screen reader walks hydrogen to
oganesson, which is the right order to hear them in anyway.

### The CSP gate caught all 118 cells

Each cell was placed with a `style` attribute. `style-src 'self'` blocks inline
style attributes, so the walk's Content-Security-Policy check went red with three
violations and a console error — **on a surface that looked completely correct on
screen**, because the CSP is only enforced by the header the walk now serves.

Placing them through the CSSOM instead — `button.style.gridRow = …` — works,
because CSP restricts inline style ATTRIBUTES and does not restrict the CSSOM.
This is what the CSP work in 0.6.0 was for: it found a real violation the first
time a new surface needed positioning, four releases later.

### A walk check that fired on the copy saying the rule was kept

The molar-mass assertion matched `/molar mass is/` and went red on the panel's
own sentence — "A molar mass is these added up for everything in the formula" —
which is the app explaining that it will not do it. **A check on the words fires
on the explanation; a check on the values fires on the violation.** It matches
computed values now. Same shape as the report assurance in 0.9.0, twice in four
releases.

### Element names are lower case in the data, and a heading is not a sentence

`elements.ts` holds `carbon`, not `Carbon`, because the lessons say "how many
oxygen atoms" mid-sentence. A heading reading "carbon (C)" looks like a typo, so
the panel capitalises for display — in the visible heading AND in the cell's
accessible name, which have to agree or SC 2.5.3 is failed by the fix.

## D1: can a colour set be swapped wholesale? Yes, once two gates exist

The question was whether a set that already clears every floor in the hub's
palette gate can replace the current one without re-running this app's
accessibility gate against it — so adding a theme stops multiplying the browser
work by the number of themes.

**The answer is yes, and it was NOT true when the question was asked.** Two
things had to become true first, and finding that out found a defect that had
been on production for fifteen releases.

### One: the app paints only role tokens

This is the half that feels obviously true. It was not, and grep cannot settle
it — a literal reaches a screen from a browser default, an inherited value, or a
script writing `.style`, none of which is in the stylesheet.

So `tools/a11y.mjs` resolves every role token through the browser, builds a map
from colour to token, and reverse-maps every colour it measures. **A colour that
maps to nothing came from outside the palette, and fails the run.**

**On its first honest run it found every secondary button in the app.**
`.button-small` set a height, a padding and a font size — it was written as a
modifier for `.button`, which carries the colour. Every element used it ALONE,
so `.button` never applied and Chromium painted them with its own defaults:
`#6b6b6b` on white text in dark, `#efefef` on black in light. Cold grey against
a warm palette, unmoved by which theme was chosen, on Back, Copy it, Check and
Look up a mistake — fifteen sites across the markup and four modules.

Fifteen releases. Every gate green, including a contrast gate measuring resolved
pixels in three palettes and both modes. **Nothing was wrong with the contrast**
— UA button colours are legible, which is why browsers picked them. No gate had
ever asked whether the colour came from the theme.

Three details separate an instrument from a confident liar, and each cost a run:

- **Resolve tokens through the browser, not by parsing the declaration.** The
  first version read the custom property off the root, got hex where the parser
  wanted `rgb()`, and reported all 8,949 measurements as unmapped. A broken
  instrument at full confidence looks exactly like a catastrophic finding.
- **Composite alpha tokens over every fill, and keep the fill in the name.**
  Without compositing, every hairline reads as unmapped. Without the fill in the
  name, a tint over the page and the same tint over the top surface are the same
  key — and that turned three genuine near-misses on screens nobody has built
  into three reported defects.
- **Token order decides collisions.** The print palette collapses everything to
  black on white, so `--rail` and `--text-1` are both `#000` there; with edges
  registered first, every heading on the printed decoder reported itself as a
  rail. Foregrounds first.

### Two: the pairings the app makes are recorded from a run

The palette gate measures the full cross product of roles, which is what makes a
palette PORTABLE — cleared against every pairing it can go into any app. This app
paints **nineteen** of them.

Both facts are worth having and they are not the same severity, so a spec may now
carry `_renders`. A floor missed on a recorded pairing is a failure; one missed
off the list is a forecast — true about the palette, about a screen nobody built.

**`_renders` is never typed.** It comes out of a run, and the same run fails when
the recorded list and the observed one differ, in both directions. A stale list
is not a smaller gate, it is a gate pointed at the wrong screens (hub LESSONS
§53's shape).

**It is only authoritative from `--all-palettes`**, because two roles sharing a
value in one palette mask a pairing — which is exactly what print does. The
default run checks it as a subset; CI checks it for equality.

### What the widened palette gate found

Adding `onAccent` to the hub's gate was the other half. **`--on-accent` was
declared in the stylesheet, painted on every primary button, and measured by
nothing** — the spec had no field for it, so the only thing checking the loudest
pairing in the app was a per-palette browser run. Widening check 6 to the whole
text ladder rather than `text[0]` came from the same list.

Together they raised 13 hard failures across the six palettes. Filtered against
what the app actually paints: **zero defects and ten forecasts**, the useful ones
being that text-3 on an accent-tinted fill misses the floor in five of six
palettes — so if a hint is ever put on a highlighted row, that is where it will
fail.

### The payoff

The default accessibility run went from 16,586 measurements to 5,526 — one
palette instead of three — and gave up nothing, because the two thirds dropped
were re-measuring what `npm run palette` proves without a browser. Adding a
fourth theme is now a palette-gate run.

**Planted red three times before it was believed**: a literal colour on the build
stamp (44 unmapped), a pairing removed from `_renders` (the app paints it and the
gate is not flooring it), and a pairing added that nothing renders, caught only
by `--all-palettes`.

## The chrome read as an equation, and no gate could have seen it

The four controls along the top were single characters: `He` for the periodic
table, `=` for the calculator, `!` for reporting a problem, `ⓘ` for information.
**Read left to right they say "He = !".** In a chemistry app, next to a
calculator, that is an equation.

Every one of them was defensible alone. **The SET was the defect** — which is
the same shape as the icon's four faults and, like those, was found by a person
looking at the bar rather than by anything mechanical. There is nothing to gate
here: no check can know that four accessible names are fine and the four glyphs
above them compose into a sentence.

They are inline SVG now, stroked in `currentColor`, with the same
visually-hidden names. The (i) stays a circled i because Doctrine §7e names that
control by its shape and a reader who has used another of these apps knows it.

**The first table icon was wrong and the render said so.** It was the periodic
table's stepped silhouette as three stroked blocks — correct in outline, and at
22px a bar chart with a short middle bar. What reads as a periodic table before
anything on it is legible is the TEXTURE of a grid of little cells, with the
notch at the top left to stop it being a calendar. Second drawing, checked at
scale in both modes.

### Moving to SVG opened a hole in the role invariant, in the same commit

The invariant collects the colours of elements **with text in them**. A glyph is
text and was collected; an `<svg>` is neither, so the four icons left the
instrument's sight the moment they stopped being characters — **a place a
literal colour could live unseen, created by the change that fixed the bar.**

That is the ordinary way a gate's coverage narrows: not by anyone weakening it,
but by the app moving out from under it. Stroke and fill on every SVG node are
collected now, and a literal planted on the table icon's cells fired 720 times.

## Three defects in one screenshot, none of which any gate could see

All three came from a photograph of the app running on a real iPad. Every gate
in this repository was green at the time.

### The whole product was below the fold

A wrong answer rendered `Not that one.` and, underneath it, the sentence saying
WHICH mistake produced that exact number. On a tablet with the keyboard up, the
second part was off the bottom of the screen. **Attribution is the thesis; the
student was getting the "wrong" and not the "why".**

Two causes, and the second is the ugly one.

**The feedback lived after the whole form**, below the reveal box — so a student
who had opened the reveal pushed the diagnosis further down every time. It is
inside the form now, directly under the button that produced it, and above the
reveal: the reveal is what a student asked for, the verdict is what they need
whether they asked or not.

**And the code was actively putting the keyboard back over it.** On a wrong
answer it called `select()` and `focus()` on the field — the reflex, *they got it
wrong, let them retype* — which on iOS re-raises the keyboard and scrolls the
field into view, taking the diagnosis with it. **The fix was to stop.** Focus
moves to the message instead, which is the standard place for it after a
rejection, is better for a keyboard user, and is what lets the keyboard drop.
Retyping costs one tap, which is the tap they were about to make.

The walk now measures this rather than asserting it: it gets a step wrong at
390x380 and requires the reason to be inside the viewport.

### There was no way out of a set

Once started, the only exits were finishing twelve steps or reloading the page.
A student who picked the wrong tier, or wanted to go and read a lesson, was
stuck. **Nothing in this repository had ever asked the question "can you get out
of here", and no gate asks it now either** — the walk checks the control exists
and works, which is a check somebody had to think to write.

Two taps in an assignment, one in practice: leaving an assignment throws away the
completion code, which is worth one deliberate second tap, and practice has
nothing to lose. The armed state changes the WORDS — "Leave — you will not get a
code" — rather than the colour, because a red button says only that something is
dangerous.

### The reveal was printing the simulation's precision

`Show me this step's answer` said **180.156000000 g/mol**.

`correctEntryFor` formats at `SCRATCH_SIG_FIGS`, which is twelve, and its comment
says exactly why: it exists to DRIVE a session — the tests and the harness submit
its result — and a simulated student has to carry full precision or it trips
E-ROUND-EARLY by accident. **Twelve figures is load-bearing there and is not a
number to show a person.** The UI borrowed the grader's function because it is
the grader's function, which is the right instinct about the VALUE and the wrong
one about the FORMAT.

`revealEntryFor` is the display side: same value, same solution, formatted for
reading. And the formatting splits, on purpose:

- **Where figures are graded**, `formatUnambiguous` still pads to the problem's
  precision, because there the trailing zeros ARE the answer — writing 1.5 where
  1.50 was asked is E-SIG-FIGS, and a reveal that hid that would teach against
  the thing being marked.
- **Where they are not**, padding is machine output. A mole ratio of three over
  two came out as `1.50000`.

The test that caught the second case is worth keeping in mind: its first version
demanded at least four figures of every intermediate and failed on `1.5`, an
exact ratio whose extra digits would be the padding the test exists to forbid.
**A character count was the wrong measure.** What matters is that the value is
rounded to `REVEAL_SIG_FIGS`, and the test beside it checks that directly — it
types the revealed text back in and requires the grader to accept it.

## Every revealed intermediate had the wrong significant figures

The owner read them on a real device and said so, and it was true of all of
them. 0.13.0 had fixed the padding — `180.156000000` became `180.156` — which was
the visible half of a deeper fault and, on its own, still wrong.

**`solve` carried precision for the FINAL answer only.** `finalQuantity` is a
`Quantity`; every intermediate came out of `solve` as a bare number. So anything
showing a student an intermediate had nothing to round it to, and the reveal
picked a constant: six figures for everything. Asking for the moles in 8.135 g of
KClO₃ answered `0.0663836 mol` — six figures out of a four-figure mass.

`quantityAt(problem, solution, stageId)` is what closed it. The rules are the
ordinary ones and `sigfig.ts` already implemented them; nobody had ever asked it
about a middle step. Multiplication and division take the fewest significant
figures among the operands, an exact quantity constrains nothing, and where two
reactants are given the LIMITING one's measurement is what constrains the
answer — its route is the one the number actually came from.

### The correct number is a trap, which is why the reveal shows two

Showing an intermediate at exactly its significant figures is right, and a
student who types it into the next step has rounded early. `E-ROUND-EARLY`
predicts precisely the value you get by rounding intermediates to the answer's
figures — **so the app would have diagnosed a student for doing what it had just
told them.**

So the reveal says both: the value to its real figures, and the digits to carry.
Two guard digits, which is the rule a course teaches anyway. `steps.test.ts`
walks sixteen whole problems submitting the CARRIED value at every stage and
requires the grader to take each one, which is the property the guard digits
exist for rather than an assertion that they are there.

**A mole ratio says it is exact and claims no figures at all.** It comes from
counted coefficients; "1.5, to two significant figures" would teach the opposite
of what a ratio is.

### What this was NOT

The first suspicion was that `molarMass` used the wrong rule — the multiplication
rule where a sum wants the addition rule, which for KClO₃ is the difference
between 122.5 and 122.55. **It does not.** `molarmass.ts` computes BOTH, names
the element that set each, and its header says the disagreement is real and that
the project specification asked for the least-precise-element rule. The engine
knew; only the screen did not. Worth recording because the cost of the check was
five minutes and the cost of "fixing" a correct rule would have been a grading
change nobody asked for.

### The menu order

Learning first, then practice, then the class assignment — the owner's call,
reversing the earlier one. The two places that focus "the first door" now name a
constant rather than an id, because the order moved once and a hard-coded
`#door-practice` in two handlers is two chances to leave focus in the middle of
the menu next time. The walk asserts the order.

## What "sure about the chemistry" was made to mean, before V1

The owner asked for certainty about the maths, the significant figures and the
chemistry before promoting. `npm test` was already green, and green there was
not the same as sure.

**`npm test` asks the engine whether the engine agrees with itself.** `solve()`
produces the answer, the test submits it, `submit()` accepts it. All three could
share one mistake and the suite would stay green — which is exactly the shape of
the circular drill test this repository was already caught by once.

`tools/verify-chemistry.mjs` recomputes the chemistry from OUTSIDE:

- **Twenty molar masses against values typed by hand** from published tables.
  This is the only check in the repository that can see a wrong atomic weight,
  because everything else derives from `elements.ts`. Worst disagreement:
  Al₂(SO₄)₃, 0.019 g/mol.
- **960 generated equations balanced by counting atoms here**, from the formulas
  and the coefficients, and checked for lowest terms with a gcd written here.
- **960 answers worked out by hand** — grams to moles, mole ratio, the smaller
  of the two routes where a reactant limits, moles to grams or litres or
  particles, percent yield — and compared with what the app claims. All matched.
- **4560 revealed values** checked to WRITE the figures they CLAIM, and to be
  the true value rounded to them.

Planted red four times before it was believed: oxygen's atomic weight moved by
one, the answer comparison scaled by 1%, the reveal's figure count raised by
one, and the balancer's lowest-terms reduction doubled. Every one fired.

### The check committed the error the app exists to diagnose

Its first version compared each revealed value against the CARRIED value
re-rounded. That is double rounding: 0.0148497 carried at five figures is
0.01485, and rounding THAT to three gives 0.0149 where the true value gives
0.0148. **It reported eleven defects and every one was the check's own mistake**
— the same mistake `E-ROUND-EARLY` exists to catch, made by the thing auditing
the catcher. Round from the truth, once.

Worth keeping in mind next time a verification script disagrees with the code it
is auditing: the script is newer, and newer code is likelier to be wrong.

## Nothing invisible is handed in

The owner's ask: any time a student is holding a code to give a teacher, they can
see exactly what it conveys — to remove the stress of an invisible submission.

**The screen already carried a sentence about it**: "the code carries counts
only — how many problems you attempted, how many you got right first time, and
which steps went wrong. It does not carry your answers, and it does not carry
your name." That sentence was TRUE. It was also written by whoever built the
thing making the claim, and to a fifteen-year-old handing something opaque to a
teacher it is worth exactly what any other software's reassurance about itself is
worth.

**So the readout DECODES THE CODE THE STUDENT IS HOLDING.** Not what the session
put in — what a decoder gets back out, by the same operation the teacher's page
performs. It cannot drift from the truth, because it is not a description of the
truth. If the code and the session ever disagreed, this would show the code,
which is the one a teacher acts on.

The walk checks that specifically: it reads the code off the screen, decodes it
itself, and requires the app's readout to agree with its own reading.

### The gate that keeps it honest

A field added to the codec and not described here would be something handed over
unseen — the original problem, back silently. `readout.test.ts` walks `FIELDS`
and requires every one to be either a line in the readout or named in
`NOT_SHOWN` with a reason. Only `version` is declared not-shown, because it is
about the code's format rather than about the student.

**And the test caught a real gap on its first run.** The fixture had zeros in
several step counters, so the readout named only the steps that went wrong, and
`errS2` — the molar-mass step — had no words anywhere. A student could not tell
whether the code even had a slot for it, which is the same not-knowing the
readout exists to remove. Two fixes: the line now says a count is carried for all
six steps whatever the numbers are, and the fixture makes every counter nonzero,
because **a fixture with zeros in it cannot tell "shown as none" from "never
described"**.

### A second session-walker went stale the moment it was written

The accessibility state for this panel started as its own entry with its own
routine for driving a session to the finished screen. It timed out in both modes
on its first run. There was already a state that gets there — `finished, showing
the code` — and the panel sits under the code on the same screen, so the reach
was extended by one line instead. A second way to do a hard thing is a second
thing to go stale, and this one did not even survive being written.

## A session that was alive and unreachable at the same time

The owner asked that what a student has typed survives navigating away to use a
tool. Checked rather than assumed, and the answer split in two.

**The four panels were already safe.** The calculator, the periodic table, the ⓘ
and the ⚑ are dialogs laid over the work screen, which is never unmounted, so
everything typed survives. Now asserted on every build so it keeps being true —
it was true by a property of `<dialog>` that nobody had written down.

**One route was not.** Following "the lesson on this" from a wrong answer leaves
the work screen, and the lesson screen's only exits went to the lesson list and
then home. The session was still alive, still holding every value typed into it,
**and no control anywhere led back to it.** Not lost — stranded, which to a
student is the same thing.

**ONE STRIP, NOT TWO PATCHED BUTTONS.** Fixing the two exits that happened to be
wrong would leave the next route off the work screen free to be wrong again. Every
screen change in `app.ts` goes through one function that shows the strip whenever
a set is running and the work screen is not the one showing, so a route that
forgets to come back cannot exist. It names the set, because "you have a problem
open" beside a lesson on the same topic is ambiguous about which thing is
waiting.

The walk drives the exact path that stranded somebody — wrong step, reference,
lesson, back — rather than testing the strip in isolation.

### What this does NOT cover, and it is the bigger one

**A reload still loses everything.** Nothing about a session is persisted, so a
refresh, a restored tab, or a Chromebook that sleeps and comes back to a
reloaded page starts from nothing. For the students this app is now being aimed
at — where taking a break mid-task is an accommodation rather than a
distraction — that is the more valuable fix, and it is not this one.

## G1: a session survives the tab closing

Nothing was persisted. A refresh, a restored tab, a device that slept and woke on
a reloaded page threw away a half-finished set and everything typed into it. For
most people an annoyance; for the students this app is now aimed at, **where
stopping mid-task is an accommodation rather than a lapse, it made the app punish
the accommodation.**

**A `Session` was already plain data** — numbers, booleans, a config of
primitives — and the problems are not in it: they regenerate from the key
deterministically, so the same set comes back by construction rather than by
being saved. Alongside it goes the text sitting unsubmitted in the boxes, because
that is the part a student would call their work.

### The clock is the part that needed thinking about

Duration was `now - startedAtMs`. Persisted as-is, a student who stopped for
forty minutes would have forty minutes added to what their code reports — and
the label on that number is "how long you had it open", which a break is exactly
not. Worse, **it would report the accommodation**: a code showing two hours for
twenty minutes of work makes a student who took a break look like they took ages.

So time ACCUMULATES across stretches. `elapsedBeforeMs` holds what earlier
stretches came to, `startedAtMs` is when this one began, and `resumeSession`
folds one into the other on the way back. `elapsedFor` is the single reading,
because two readings of "how long" is how the code and the screen come to
disagree about the same number.

### Saved on every change, not on unload

A tab killed by the operating system, a device that sleeps and never wakes the
page, a lid shut at the bell — none of them fire `beforeunload` reliably, and the
one moment a save matters is the one nobody scheduled.

### Offered, never forced

A restored session lands on the HOME screen with the resume strip showing, not
inside the problem. A student who closed the tab may have meant to leave, and
reopening straight into a half-finished set takes that choice away. It also means
the way back from a reload is the SAME control as the way back from a lesson —
learned once, works everywhere. A set abandoned deliberately with "Leave this
set" is forgotten rather than offered.

### The validator is strict, and that is the safety

Storage can hold an older build's shape, a half-written value, or something
another tab left. **A session restored from a shape this build does not
recognise would put a student in front of a problem the app cannot grade** — they
would find out after answering it. So `isSavedSession` checks every field's type
and refuses on anything else, and `resume.test.ts` feeds it fourteen kinds of
rubbish.

### What the walk does that no unit test can

It reloads the page for real. Nothing short of that proves this works.

**And the walk's own first version failed for an unrelated reason worth
recording:** it filled the roster and key but never clicked the tier and count
buttons, so the form's defaults produced a different problem from the one the
script had generated, the first submit silently did not advance, and the failure
surfaced thirty seconds later as a missing answer box. A setup step left to a
default is a test measuring something other than what it names.

## G2: accommodations, and the line they must not cross

**AN ACCOMMODATION IS A DEVICE-LOCAL PREFERENCE.** Text size, letter and line
spacing, one-step-at-a-time and read-aloud live in `localStorage` and are applied
by `theme.js` before first paint. **None of them reaches the completion code, the
problem report, or the teacher's page.**

That is not tidiness. A student's accommodations are disability information, and
a code carrying them would make a student disclose an accommodation by using it,
through a channel they cannot opt out of and — until 1.1.0 — could not even see.
Two gates hold it: `readout.test.ts` fails on any codec field not described to
the student, and the walk reads the problem report with every setting turned on.

The app also never stores WHICH accommodations a student has, and no teacher-side
control sets them. That belongs in her IEP paperwork and her gradebook, not in a
web app with no accounts.

### Why these four and not others

- **Size is a root font size, not a zoom.** Everything here is in `rem`, so one
  value moves the type, the touch targets and the spacing together — a student
  who needs bigger text needs bigger buttons too, and a transform would have
  scaled the layout off the side of the screen.
- **Spacing rather than a typeface.** A dyslexia-friendly font cannot ship here:
  no third-party runtime dependencies, and it has to work offline. The spacing is
  most of what the evidence supports anyway. **It is switched OFF for the
  completion code, the equations and the worked lines** — those are read
  character by character, and loosening them makes them harder rather than
  easier, which is the whole setting backwards.
- **One step at a time** is three `display: none` rules, because the app was
  step-gated already. This is what it looked like underneath.
- **Read-aloud is not a screen reader.** A sighted student with a reading
  difficulty does not run one, and it is among the commonest accommodations on a
  504. It reads the question and the equation, never the answer — the rule about
  not showing an answer before the attempt does not stop applying when the
  delivery is audio.

### The permissions gate was matching prose

Adding speech surfaced a real flaw in `permissions-check.mjs`: it matches text,
and text includes comments. A comment in `work.ts` mentioning
`clipboard.writeText` made it report a clipboard write with no fallback **in a
file that does not touch the clipboard**. The same flaw would fire on a comment
saying "this deliberately does not call getUserMedia" — a gate that fails on a
sentence promising to obey it teaches people to word things around it.

Comments are stripped before matching now, **conservatively**, because a
stripper that removes too much creates false negatives, which is the one failure
this gate cannot afford: block comments come out whole, and a line comment comes
out only when the line is entirely a comment, so `//` inside a URL cannot hide
anything after it. Planted with a forbidden call sharing a line with an
`https://` string; it fired.

**Speech synthesis is allowed and speech RECOGNITION is forbidden by name.** They
are one letter apart in the same corner of the platform and recognition turns on
a microphone.

### Two mistakes of mine worth recording

**A plant that does not compile passes silently.** Planting
`webkitSpeechRecognition` in a `.ts` file failed the type check, so the build
never wrote a new bundle, and the gate read the OLD one and passed. It looked
like the check not firing. A plant has to be verified as having reached the
thing under test — here, the built bundle, which is what the gate actually reads,
so that is where it was planted instead.

**And `git checkout <file>` on a file with uncommitted work destroys it.** Used
to revert a plant, it discarded the read-aloud code written minutes earlier,
which had to be written again. The backup copy taken for exactly this purpose was
sitting right there; the habit reached for git instead.

## The release check waited for the wrong thing, and 1.3.0's promote went red

The deploy step verifies TWO urls on a promote: the immutable per-deploy address
and the apex, because on `main` those answer different questions. 1.3.0 passed
the first and failed the second: **"it answers, but not with molebridge-1.3.0"**.

The bytes were fine. The per-deploy URL served 1.3.0 immediately. What failed is
one second later, on the apex — because **Cloudflare flips the production alias a
moment after the per-deploy URL goes live**, and the step's retry loop was
waiting on the wrong thing:

    for attempt in 1 2 3 4 5 6; do
      code=$(curl -o /dev/null -w '%{http_code}' "$DEPLOYED_URL/")
      [ "$code" = "200" ] && break
      ...

**The apex returns 200 instantly — serving the PREVIOUS release.** So the loop
was satisfied on the first attempt by the old build, every header check below
then measured the old build, and the version check at the end was a coin toss on
whether the alias had flipped yet. It came up heads for three promotes and tails
on the fourth.

The retry existed and looked like the right shape. It waited for *an answer*
where the whole point was *this answer*.

**The fix is to wait on the RELEASE**, up to ninety seconds, and to run the
header checks only after it arrives — so they measure the build being deployed
rather than whichever one is currently there. It can still fail, and must: a
version that never appears is a deploy that never landed, which is the thing this
step exists to catch. Hub LESSONS §53's shape exactly — a push is not a release —
with the hole this time inside the release check itself.

### And a bash trap that would have been worse than the bug

The first fix wrote the success line as `[ "$attempt" -gt 1 ] && echo ...`. The
step runs under `set -e`, and an AND-list whose test is FALSE returns non-zero
outside a condition context — so on the ordinary case, the edge being ready first
time, the whole check would have aborted. Caught by extracting the loop and
running all three paths against a fake edge — ready immediately, ready on the
third try, never ready — before it went anywhere near a promote.

## I1: the warm-up, and the one thing a real teacher said yes to

A chemistry teacher looked at this app and named exactly one use: a Monday
warm-up. She sees the same students twice a week, so a period spent on practice
is a period not spent on chemistry. **That is arithmetic, not a failure to see
the point**, and the honest response was to build the thing she named rather
than to explain the rest of it harder.

The app was not built for it. Starting a set meant a door, a roster number, an
assignment key, a set and a count — five decisions before a single problem, with
twenty-eight teenagers and five minutes.

**A LINK, because it is the shortest possible route.** She builds it on her own
page, writes it on the board or drops it in Classroom, and a student who opens it
is looking at the first problem. Everyone gets the same problems, which is what
makes a warm-up discussable afterwards; a warm-up nobody can talk through is
homework done early.

**It is practice with a shared seed and NOT a second engine path.** No roster
number because nothing is collected, no completion code because nothing is handed
in — and both of those fall out of the mode rather than being special-cased. A
mode that graded differently would be a second place for the rules to drift.

### The bug that would have been reported across a classroom

The link worked in isolation and failed in the walk. Not a service worker, which
was the first guess: **a URL differing only by its fragment is a same-document
navigation.** The page does not reload and `boot` does not run again.

So a student who already had MoleBridge open — which after the first visit is
most of them, because it installs to a home screen — and then tapped her link
would get nothing at all. It would have worked perfectly for anyone with a fresh
tab. **A bug that works for half a room is the worst kind to be told about from
the front of it.** Fixed by also listening for `hashchange`, and the walk now
drives the link from a tab that was already open BEFORE it drives it cold,
because that is the case that broke.

### Two things the gates caught the moment this existed

**The home screen said "Seven short lessons" with eight in the app.** Nothing
failed: no gate reads prose, and the number was right when it was typed. This is
exactly the hub's record of `checkOrientationTypes` in 3d-printing-pal — a
welcome describing three job types after a fourth was added. The fix is not a
better number, it is prose that does not carry one, and the walk now fails on any
count of lessons stated on the home screen.

**The `<select>` elements in the builder were 19px tall** against the 44px touch
floor, unstyled. Worth noting that the APP deliberately uses radios rather than a
select — a native select on a ViewBoard opens a list nobody at the back can read
— but that argument is about a screen projected to a room, and a teacher's
planning page never is. A select is right here; it still has to clear the floor,
because she might be doing this on a phone.

### What a warm-up does NOT resolve

She was not excited by the practice or the feedback, which is the thesis. This
builds the five minutes she asked for; it does not answer that. Her other
suggestion — homeschool communities — is a fit observation worth taking
seriously rather than a brush-off.

## J1: practising one step, and refusing to reward anybody for it

A student who inverts the mole ratio had to walk five other steps to reach the
one they were failing. **That is a tax on the thing they came to fix.** Whole
problems are INTERLEAVED practice, which is what makes a skill stick once you
have it; a skill you do not have yet is built by BLOCKED practice — the same
move again until it is yours. The app only had the first.

**The engine was ready and nobody had asked.** `classify` is a pure function of a
problem, a stage and an entry, so a drill is a loop around it: generate, present
one stage, classify, discard. No session, no completion code, nothing recorded.

`renderInputs` and a new `readEntryFrom` are exported from `work.ts` rather than
rewritten. A second renderer would be a second place for the rule about what a
student may see before answering to drift, and the drill shows the same stages to
the same people.

### The design rule, and why it is a test rather than a paragraph

**No score. No streak. No target. No congratulation.** Streaks and badges teach a
student to chase the animation, and they make stopping feel like failing — which
is exactly wrong for the person who most needs to do twenty of these, and who is
usually the one who has been told longest that they are bad at it.

That is the kind of rule a later session undoes in one well-meaning commit. So
`drill.test.ts` reads the source of both drill files and fails on `streak`,
`badge`, `points`, a fraction like `3/7`, and every variant of "Great job". It
strips comments before matching, because the comments say what must NOT be built
— the same trap `permissions-check.mjs` fell into when it fired on its own prose.

**What replaces praise is CHANGE.** A good tutor does not say "5 out of 7". They
say "that one went upside down again, here is why", and at the end "you were
getting these wrong the same way and now you are not". So the summary reports
what happened and, only where it is true, that the repeated mistake stopped: a
fact about the run rather than an opinion about the person. `stoppedHappening` is
false unless the run was long enough for the question to mean anything.

**Once is not a pattern.** A single mistake is never named — everybody makes
slips, and naming one would be the app inventing a problem to have an opinion
about. Twice is reported in the summary. Three times is said DURING the run,
once, with what fixes it, and never again: a thing repeated is nagging.

**The all-wrong summary is written separately.** The general sentence rendered it
as "4 questions, and 0 of them were right" — accurate, and the exact reading the
person doing twenty of these does not need. It says "You did 4. None of them came
out right yet", which is the same fact without the zero in it.

### Three things this found in the existing gates

**A selector loose enough to catch a second list.** The drill's step list reuses
`.lesson-row` for its shape, and the walk's unscoped `.lesson-row` count went
from 8 to 16 the moment the screen existed — a check reporting somebody else's
feature as a defect. Both counts are scoped to `#learn-list` now.

**The class-to-step map is derived, not typed.** `E-RATIO-INVERTED` is the mole
ratio by construction, so a table would be the same fact written twice and the
copy is what goes stale. Five classes belong to no step ON PURPOSE — a slip in
the arithmetic, a missing unit, rounding early and an unexplained answer happen
anywhere — and the test names all five, so a sixth appearing is a decision.

**A drill that could not generate its own step would be an empty screen.** Not
every problem has every stage, so each drillable step carries the tier that
produces it, `drillItem` is bounded rather than a `while (true)`, and the test
generates eight of each.

## J2: the app stopped assuming which room the reader is in

MoleBridge was written for one chemistry classroom, and the copy came out that
way. Twenty-nine places in the tree told the reader so: *your teacher has put
these on the board*, *type it into the Canvas assignment*, *decode a class*,
*half the class finished within N minutes*.

Every one of them was accurate. Every one of them also told a homeschooled
student — or a group of four, or a tutor, or an adult going back over this
alone — that the thing in front of them belongs to somebody else and they are
reading over a shoulder. Nothing about the app is wrong for those readers. Only
the sentences were, which is what makes this the cheap kind of defect to leave
in and the easy kind to reintroduce.

**The replacement is not vagueness.** "Someone" is worse than "your teacher" for
a fifteen-year-old in period three: it sounds like the app does not know what it
is for. Each phrase was replaced with wording that is true in both rooms and no
less specific in either — *whoever set the work*, *wherever you hand your work
in*, *the codes you were handed*, *both of these came with the work you were
set*. The graded door is called **Assignment** rather than **Class assignment**;
`mode: 'assignment'` in the code never moved.

**The teacher page is for whoever is marking, and that is still the right word
for a parent teaching at home.** What excluded them there was the room around
it: a class, a gradebook column, writing the link on the board. It is now
*Decode a set of codes*, the paste box is *The codes* with the gradebook named
as one thing that pastes in rather than the only thing, and the results heading
is *Everyone together*.

**`tools/language-check.mjs` is the gate, and it names the replacement.** A
failure that only says no gets worked around, and the way around this one is a
synonym that excludes exactly as much — so every forbidden phrase carries what
to say instead. It reads `public/index.html`, the teacher page and every source
file under `src/ui`, `src/learn`, `src/report` and `src/teacher`, with comments
stripped: the note above the warm-up builder says a teacher writes the link on
the board, because that is the thing that was asked for and the reason the
feature exists. A gate that deleted the reasoning to satisfy a rule about the
copy would be trading the wrong thing.

**`src/ui/releases.ts` is not scanned**, and that is a decision rather than an
oversight. It is generated from CHANGELOG.md, which is the record of what
shipped and when. Editing old entries so a gate goes green is rewriting history
to look like it never happened; the entries that say *Canvas* describe releases
where the app said Canvas. New entries are written in the neutral voice because
they are written now.

**One collision, and it is the LESSONS §108 shape.** `<a class="skip">` contains
the phrase "a class". A pattern flagging honest markup teaches people the gate
is noise, so a match immediately followed by an `=` is not a match.

**And the fix went to the one screen the check read.** The home screen said
"Seven short lessons" with eight in the app; 0.13.0 replaced the number with
prose that carries none and added a walk check. The LEARN screen said "Seven
lessons" for four releases after that, because the check asked `#screen-home`
and the sentence was one screen further in. **A check narrower than the rule it
enforces is the defect wearing the fix's clothes.** It now reads `#main`, which
is every screen at once including the hidden ones — and not the whole document,
because the patch notes live in a dialog outside it and say "Lessons. Seven of
them", which was true in the release it describes.

## The app changed under the reader and never said what for

§7h was built and half of it was missing. The strip told a reader a new version
was waiting, they pressed **Use it now**, the page reloaded, and the app was
different with no account of what changed. The notes existed the whole time,
behind the ⓘ under **What changed** — which is a place somebody opens only if
they already suspect there is news, and the whole point of an app that updates
itself is that they have no reason to.

**It has to happen AFTER the switch, and that is forced rather than chosen.**
The obvious design is a "what's in it" line on the strip itself. It cannot be
honest: the page showing that strip is the OLD build, and its `RELEASES` array
was generated from the changelog as it stood when that build was made. The
running code has never heard of the release it is offering. Anything it said
about the waiting version would be invented. The first moment anything in the
app actually knows is after the reload, in the new build.

**Three rules about when it may interrupt**, each of which is a walk assertion:

- A newcomer is never told. There is no news for somebody with no before, and
  two modals stacked on a first run is the app talking over itself at the one
  moment a reader is deciding what it is. The version is recorded silently, so
  their next update is news.
- Not over work in progress. A warm-up link puts a student in front of a problem
  within a second of tapping it, and a resumed session has their working still
  in it. Neither moment is for release notes — and neither loses them, because
  the version is not recorded, so the offer stands until they open the app with
  nothing waiting. Same posture as the strip's **Not yet**: dismissed, not
  resolved.
- Everything since, not just the last one. A device that sat over a holiday
  comes back several releases behind, and being told about one of four changes
  is how an app comes to seem like it changes for no reason.

**The case the feature creates for itself, which would have made the release
that adds it show nobody anything.** Every existing reader arrives at the first
build that records a version with nothing recorded — indistinguishable, from
that key alone, from somebody who has never opened the app. They are not the
same person and the app already knows which is which: a reader who has been here
before has read the orientation. So `releasesSince` takes a `returning` flag,
and a returning reader with no recorded version gets the release in front of
them — the most that can be said without inventing what they last saw.

**The decision is DOM-free and the dialog is next door**, which is the
`warmup.ts` split for the same reason. Every case worth getting right here is
about absence: never run the app, skipped four releases, carrying a version this
build has never heard of. None of them is convenient to arrange in a browser,
and a decision that can only be tested by driving Chromium is a decision that
gets tested once. The node type check found this rather than judgement did —
importing the panel into a test dragged `dom.ts` into a config with no DOM lib.

**Two things this turned up that nothing was looking for.**

The welcome said nothing was kept after the tab closed and that stopping halfway
meant starting again. That stopped being true in **1.2.0**, when an unfinished
set started surviving the tab closing, and nobody went back to the sentence. The
app was telling a student their work would be lost while it was saving it. It
now names what is kept — the problem in progress, the place in the lessons, how
it is set up to read — and that all of it stays on the device.

And the walk's first attempt at the resumed-session case set the news as due
BEFORE navigating home, which put a modal over the home screen with nothing to
click through to. That is the panel working exactly as the welcome does; it cost
a thirty-second timeout to see, and the order is now written down beside it.

**The `close` event is where the version is recorded**, not the button, because
Escape and the backdrop close a dialog too and a reader who dismissed it that
way has still been shown it. Recording only on the button would mean the same
notes on every launch, which is how people learn to dismiss a panel without
reading it. It is also a queued task rather than a synchronous one — the same
race that lost one walk run in three on the orientation move — so the walk waits
for the write rather than reloading straight after the click.

## The release notes were a record, and that was the wrong call

`tools/language-check.mjs` shipped in 1.6.0 exempting `src/ui/releases.ts` and
CHANGELOG.md, with the reasoning written into its header: the changelog is the
record of what shipped, and editing old entries so a gate goes green is
rewriting history to look like it never happened.

**That was wrong, and the distinction it missed is between the FACTS of a
release and the VOICE they are told in.** The facts are fixed. The voice is the
app's, and it belongs to now. The notes are not an archive: they are the app
talking to whoever is reading it TODAY, in the same ⓘ panel as everything else,
and twenty-eight entries about a class, a board and a gradebook teach a family
learning at home the same wrong thing about who this is for as any other screen
would. What happened in each release has not changed by a word; only the room
the sentence puts around the reader.

So CHANGELOG.md is scanned. `src/ui/releases.ts` is still not, and that is
mechanical rather than principled: it is generated from CHANGELOG.md, so the
source is where the line holds, and scanning a file that may not exist yet is a
check that can silently skip.

**The entry describing the fix could not quote what it fixed.** The 1.6.0 note
listed the exact phrases that had been removed, which the gate then found in the
changelog — correctly. Rewriting it to describe the room rather than quote the
sentences is better prose anyway, and it is the general shape: a note about
language that has to name the language needs a different sentence, not an
exemption.

## The notes were a wall, and the way out was behind it

Every surface that showed release notes showed all thirty. In the after-an-update
dialog that put the way out under everything the reader had not asked to read; in
the ⓘ panel it pushed every section below it — where the chemistry comes from,
how to report a problem, the accessibility statement — off the bottom.

**Five, then a door.** `NOTES_SHOWN` is one constant and `forAPanel` is one
function, so the dialog and the ⓘ cannot disagree about it. The count of what is
NOT shown is returned rather than a boolean, because a reader told there is
"more" learns nothing and one told there are twenty-four more knows whether the
page is worth opening.

**`/changes/` is a page in the app, not a link off it.** It is generated from the
same `RELEASES`, served from the same origin, picked up by the precache walk
automatically, and therefore works with no connection like everything else. It is
deliberately not a link to the repository: the reader of these notes is a student
or whoever is teaching them, and a code host is a different audience's document
in a different audience's language.

## `.button-small` meant two different things, depending on the element

The link to the history page was styled `button button-small`, which declares
`min-height: 2.75rem` — 44px, the floor this app holds itself to. It rendered at
36. **`min-height` is inert on an inline box**, and neither class had ever
declared a `display`: a `<button>` is inline-BLOCK by default so the floor
applied, and an `<a>` is inline, so the identical class produced a control eight
pixels under the floor.

**This is the `.choice` defect a second time, in a second place.** That one was a
42px row from `min-height` on an inline `<label>`, and the fix then was to give
that one rule a `display`. The general form was available and was not taken: a
class that says *this is a button* has to make that true of the ELEMENT, not
true of buttons. `.button`, `.button-small` and `.button-big` now declare their
display, so the class means the same thing wherever it is put.

**The accessibility gate found it, at 217x18, before the class was involved at
all** — the first version was a bare inline anchor inside a sentence. Fixing
that to a button class is what surfaced the 36px, which is the more interesting
half: the app already had a control that was under its own floor wherever it was
used on an anchor, including the link back from the page for whoever is marking.

## Hub LESSONS 141, applied the day it was read

**No way out is inside the box that scrolls**, checked over every `<dialog>` in
the document with no app state — so it covers surfaces the walk has never found a
route to, and a new one is red from the day it exists.

The lesson's own finding is what makes the shape matter: an app shipped 142
releases with two dialogs carrying this defect untouched, under a check that
reported *every scrolling surface with a way out* — because the check found its
subjects by looking for the class the FIX added. A surface that never got the fix
was not a failing row; it was not a row at all.

So the way out is **declared** (`data-way-out`) rather than inferred from an id
ending in `-close`. That convention would have silently exempted the two longest
dialogs here, which leave by **Get started** and **Got it**. A naming convention
is a filter wearing a costume.

Nothing here was failing. That is the point: the invariant costs seven attributes
and one loop, and the next dialog is measured before anybody thinks to look.

## A check's sentence and a check's predicate are two different things

The walk asserted `info.includes('0.1.0')` under the label *the patch notes name
the release that is running*. `0.1.0` is the OLDEST release in the file. It
passed for thirty releases because the panel rendered every one of them, so the
literal was always present — and it went red the moment the list was capped,
which is the first time it was ever asked the question its own sentence claims.

**An incidental truth held it up, and the fix that removed the incidental truth
is what exposed it.** Nothing was looking for this and nothing could have been:
the check was green, its text was accurate prose, and only its predicate was
wrong. It now reads `RELEASES[0].version`.

## Two things the walk taught about a modal being shared state

The first attempt at the resumed-session case made the news due BEFORE navigating
home, which put the panel over the home screen with nothing to click through to —
the panel working exactly as the welcome does, at the cost of a thirty-second
timeout.

The second was worse and quieter: the block ended by pressing **Got it** without
waiting for the version to be recorded, and `dialog.close()` fires its `close`
event as a queued task. The write lost the race, the notes stayed owed, and the
panel opened over a section thirty seconds further down the walk and intercepted
a click there. **A modal is shared state between parts of a walk that do not know
about each other**, so every dismissal now waits for the record rather than for
the click.

## The hub's own branches have diverged, and it now costs something

`.doctrine-sync` is deliberately NOT moved by this session. The hub's `main` is
six commits ahead of the SHA this repository last reconciled to — and the diff
between them is not a fast-forward. Reading it across the divergence shows the
hub's `main` **without** the `onAccent` palette role and **without** PALETTES §7b,
both of which MoleBridge depends on: `--on-accent` is declared in
`palettes/molebridge.json`, painted on every primary button, and measured by
`palette-check.mjs` at the pinned SHA. CI pins `HUB_SHA` to that same commit, so
the gates are currently green against a hub state that `main` does not have.

Adopting would assert this repository had reconciled to a hub that is missing
rules it relies on. It has not, and the resolution is not a session's to pick.
**This is the concrete cost of the divergence and it is the owner's call.**

Two hub LESSONS are owed and are not written for the same reason — writing them
would land on one side of a diverged history. They are recorded here in full
above: the check-sentence-versus-predicate finding, and §7h's missing half (an
app that offers an update and never says what changed, which every sibling with
an update strip has).

## Repository obligations still open

These are the things standing between MoleBridge and a class using it. None is
work a session can finish on its own.

- **Deploy is wired, and production is empty on purpose.** The workflow creates
  the Cloudflare Pages project if it is missing, so nothing has to be set up by
  hand. `main` is the production branch and the code is not on `main` yet — so
  `molebridge.pages.dev` will answer with nothing until somebody merges. Every
  other branch deploys as a PREVIEW on its own URL, which is what makes the
  pipeline verifiable without putting unreviewed work on the address a class
  would use.
- **The deploy job takes the GATED build as an artifact** rather than rebuilding.
  Rebuilding would ship a near-identical build that nothing had checked, and
  near-identical is the word that does the damage.
- **A required reviewer on `production` is NOT owed, and this line is the
  correction.** An earlier version of it said one was "worth adding", and it was
  then carried on the owner's list for six turns as though it were an
  obligation. Doctrine §16.5 does not ask for one: a required reviewer appears
  there only inside the description of the BAD UI, and what §16.5 offers is a
  protected environment, a typed confirmation, or both. No sibling repo has one.
  On a single-maintainer repo it means approving your own deploy — a dialog, not
  a second pair of eyes — and it would stall a promote waiting for a click. The
  friction §16.5 wants is already present three times: the branch guard refuses
  a commit on `main` without `MOLEBRIDGE_PROMOTE=1`, promotion is a deliberate
  merge, and the deploy job cannot start until every gate is green.
- **The environment split stays** — `production` from `main`, `preview` from
  anything else. It came from a real zizmor `secrets-outside-env` finding, costs
  nothing, and leaves a protection rule one click away if one is ever wanted.
- **Branches are settled, and `staging` exists.** The owner made the call on
  2026-08-25. Work commits to `staging`; `main` is production, because `main` is
  the Cloudflare Pages production branch and a commit landing there is a commit
  landing on the address a class opens. Promotion is a merge, and a commit made
  directly on `main` needs `MOLEBRIDGE_PROMOTE=1` in front of it. The harness's
  own `claude/*` branch is kept pointing at the same commit so nothing is
  stranded on it, but it is no longer where work belongs.
- **The pre-commit hook is generated, not written.** `.branch-guard` declares
  the whole configuration and the hub's `branch-guard.mjs --install` generates
  `.githooks/pre-commit` from it — the copy here is an artefact like
  CHANGELOG.md, and `npm run branch` fails on drift. It installs into
  `.git/hooks`, which no branch owns: the hub's first attempt pointed
  `core.hooksPath` at the tracked directory and failed open, because checking
  out an older branch deletes the hook with it, and the branch most in need of
  protecting is the one most likely to be older.
- **`tools/version-check.mjs` is an `also=` entry**, so the release triplet is
  held on every commit including a promote rather than when somebody remembers.
  A declared `also` script that is missing or not executable is a FAILURE and
  never a skip.
- **CI runs the guard as `--artefact`.** The plain check also asserts that
  `.git/hooks/pre-commit` is installed, which is a fact about one clone;
  `actions/checkout` leaves `.git/hooks` empty by definition, so the plain
  spelling would fail on every push forever. `--artefact` checks the tracked
  hook against `.branch-guard` and prints the two checks it skipped.
- **The guard was planted before it was believed**, and the two plants fired
  different rules. On the harness branch a commit was refused by the BRANCH
  rule, naming `staging` and printing the promote escape. On `main` it was
  refused by the `also` rule instead — `main` is still the initial commit and
  carries no `tools/`, so the declared check was missing, which is a failure and
  never a skip. Setting `MOLEBRIDGE_PROMOTE=1` did not get past that, correctly:
  the escape permits a commit on production, it does not excuse a check that
  cannot run. Once the promote merge puts `tools/` on `main`, the branch rule
  and its escape become the operative pair there. The same commit on `staging`
  went through with the triplet check printing its four lines.
- **There is a Content-Security-Policy, and it cost a header rather than a
  refactor.** Doctrine §16.6 says a CSP is a refactor anywhere a page carries
  inline script; this app has never carried one, and that was preserved
  deliberately — it is why `theme.js` is an external blocking file rather than
  the inline one-liner PALETTES.md suggests. This is what that decision was
  being kept for. Deny by default, with allowances only for what the app does:
  its own script, stylesheet, icons, worker and manifest. `form-action 'none'`
  and `connect-src 'self'` turn the no-network claim into a rule the browser
  enforces rather than a promise the code makes.
- **`tools/serve.mjs` parses `public/_headers` and serves what it declares**,
  which is the change that makes the policy real rather than aspirational. For
  most of this repository's life `_headers` was a Cloudflare file whose contents
  existed only in production: every browser-driven gate ran against a server
  sending none of them. That was survivable while they were headers that cannot
  break a page. **A CSP breaks a page silently and completely**, so a policy
  nothing exercises is a policy discovered by a class. Now the journey walk and
  the accessibility gate both run under it on every run. The parser handles a
  deliberate subset — exact paths and one trailing wildcard — and THROWS on a
  line it cannot read, because a header quietly not applied is the same
  fail-open the file exists to close.
- **The walk fails on any policy violation**, collected from the browser's own
  `securitypolicyviolation` event rather than by reading the console, and
  harvested from the teacher page before navigating away — `window` does not
  survive a navigation and the decoder is a different module. Planted twice:
  forbidding the stylesheet took nine checks down with it, and forbidding the
  module stopped the app booting at all. The edge check in CI asserts the header
  is actually present on the deployed page.
- **The on-device pass.** Headless Chromium cannot tell whether a 44px target is
  comfortable to hit with a finger at arm's length, and it has no opinion about
  a software keyboard covering the answer box. Real iPad, real ViewBoard, real
  Chromebook.
- **Repo metadata** — description, website, topics, social preview — is a manual
  GitHub step. Proposed values are in the hub's `METADATA.md`; nothing is set
  until they are applied there. The website item is deliberately marked not-yet-
  live.
