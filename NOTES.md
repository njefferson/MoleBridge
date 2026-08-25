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

**Still owed to a real device: the ViewBoard, and a Chromebook.** The board at
the front of the room is further away and runs a Chromium nobody here can test
against.

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
- **A required reviewer on `production` is worth adding, and is a GitHub step.**
  The deploy job runs in a dedicated environment — `production` from `main`,
  `preview` from anything else — so a protection rule can sit on production
  alone without gating every preview. Nothing protects it today.
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
- **No Content-Security-Policy.** `public/_headers` says so in as many words
  rather than implying otherwise. The app carries no inline script, so one is
  reachable; it is a refactor rather than a header and it has not been done.
- **The on-device pass.** Headless Chromium cannot tell whether a 44px target is
  comfortable to hit with a finger at arm's length, and it has no opinion about
  a software keyboard covering the answer box. Real iPad, real ViewBoard, real
  Chromebook.
- **Repo metadata** — description, website, topics, social preview — is a manual
  GitHub step. Proposed values are in the hub's `METADATA.md`; nothing is set
  until they are applied there. The website item is deliberately marked not-yet-
  live.
