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

**The first version of that was only half true, and the owner asked the question
that found it.** Eleven drill answers were bare literals — atom counts, balancing
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
without the one feature a mole is known for. It was caught by the owner, not by
any gate, and no gate could have caught it.

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
