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

**Session 3 — the teacher decoder and the print view.** The decoder takes a
pasted gradebook column, decodes each code, and reports a per-student and
class-wide error histogram. `decodeCompletionCode` already returns everything it
needs, including the four verdicts and the named consistency failures. Note that
it reports fields for a code that verifies but contradicts itself, and reports
nothing at all for a code whose MAC failed — the teacher-facing wording has to
keep those apart.

## Waiting on the owner — a candidate is deployed

**Version 0.1.0 is live on a preview URL**, from commit `e1a29ac`:

    https://claude-molebridge-engine-cod.molebridge.pages.dev

That is the branch alias and it moves with each push to the working branch. The
immutable per-deploy URL for this exact build is
`https://8d621a6a.molebridge.pages.dev`. Both were read out of the deploy log
rather than assembled from a branch name.

**Production is empty, and that is correct.** `main` is the Pages production
branch and the code is not on `main`, so `molebridge.pages.dev` answers with
nothing until somebody merges.

**What the run actually did**, from the log rather than from its exit code: the
Pages project was created, the token verified, 36 files uploaded including
`_headers`, and Cloudflare answered with the URLs above. The deploy job took the
build the gates passed as an artifact, so the bytes that went out are the bytes
the journey walk drove and the accessibility gate measured.

**What has NOT been verified, and cannot be from here.** The live page has not
been fetched. This sandbox's proxy denies `*.molebridge.pages.dev` at the CONNECT
stage — its own relay log records `connect_rejected, gateway answered 403` for
that host, while `github.com` answers normally, so the network is fine and the
host is refused by policy. That leaves three things owed to a real device:

- **Does the page load and work**, on a Chromebook, an iPad and the ViewBoard.
- **Are the security headers actually applied at the edge.** `_headers` uploaded,
  but Doctrine §16.8 says headers are checked by fetching the deployed page, and
  that fetch has not happened.
- **The on-device feel** — a 44px target is measured, not felt, and no gate has
  an opinion about a software keyboard covering the answer box.

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
- **Branches.** This repository has `main` and the harness branch. The family
  convention is `staging` and `main`, with `staging` a hard release gate. The
  harness's standing instruction here is to push only to its designated branch,
  which conflicts with creating and pushing `staging`, so that call is the
  owner's.
- **`.branch-guard` and the generated pre-commit hook** are owed in the same
  change that creates `staging`. `tools/version-check.mjs` is written to be an
  `also=` entry when that happens, so the release triplet is held on every
  commit rather than when somebody remembers.
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
