# MoleBridge

A step-gated stoichiometry trainer. The student enters **every** intermediate
value of a problem, not just the final answer. The system identifies which stage
failed and why, injects a targeted algebra micro-remediation at that stage, and
at the end of a session emits a short alphanumeric completion code the student
types into a Canvas text-entry assignment. The teacher pastes the gradebook
column of codes into a decoder page and gets a per-student and class-wide error
histogram.

**Attribution is the product.** Free tools already solve stoichiometry problems
and already explain the procedure. None of them attribute a specific wrong
number to a specific conceptual failure and report that to the teacher. This is
not a solver, and the internal balancer that exists to validate generated
problems is deliberately kept off every student-facing path.

## What is built so far

The engine, the completion code, and the student app. A student reads what
MoleBridge is, types the roster number and assignment key their teacher put on
the board, picks a set, and works problems one step at a time. It is installable
and works with no connection.

Deploy is wired to Cloudflare Pages: `main` is production, every other branch
lands as a preview on its own URL, and the build that deploys is the exact one
the gates passed. The teacher's decoder is session 3.

`NOTES.md` is the source of truth for what is settled, what each judgement call
cost, and what is still owed.

## Running it

Node 22.18 or newer, and nothing else. TypeScript is stripped by Node itself, so
there is no build step and no bundler; the only dependency in the tree is the
type checker.

```
npm ci
npm run check
```

`npm run check` is the type checks, the release-triplet gate, the patch-notes
drift check and the whole test suite — 108 tests, about fifteen seconds. The
pieces separately:

- `npm run typecheck` — `tsc --noEmit`, strict, no `any` anywhere. Twice: the
  engine is checked WITHOUT the DOM library, so a browser global in
  `src/chem`, `src/code` or `src/engine` is a type error rather than something
  that only shows up on a runner.
- `npm test` — `node --test` over `test/**/*.test.ts`.
- `npm run build` — emits the browser bundle to `public/app`, regenerates the
  patch notes and the icons. There is no bundler: `tsc` rewrites the `.ts`
  import specifiers Node needs into the `.js` ones a browser needs, so the same
  sources run in both.

### Looking at it

```
npm run build && npx --yes http-server public
```

Any static server will do — the app makes no network calls. The two gates that
drive a real browser:

- `npm run walk` — the primary journey, start screen to completion code. It gets
  one step wrong on purpose, because the diagnosis and the algebra help are the
  product, and it drops the network mid-session to prove the offline claim
  rather than asserting it.
- `npm run a11y` — the accessibility gate. Every state, both themes, measured
  from the pixels the browser resolved. It exits non-zero. Add `--verbose` to
  see every passing measurement.
- `npm run palette` — the colour floors, against the hub's canonical gate.

## The command-line harness

`tools/cli.ts` exercises the engine end to end. It is a development tool and
**not a student surface**: it prints answers, and it prints the balancer's
output.

Run a simulated session, print the completion code, and decode it back:

```
node tools/cli.ts session --key CHEM-A --tier 3 --problems 4
```

Simulate a student who gets things wrong, so the transcript shows the error
classification and the algebra remediation at the stage where it fires:

```
node tools/cli.ts session --key CHEM-A --tier 3 --problems 4 --errors
```

Show one problem as a student sees it — the reaction skeleton, the prompt, and
the stage list, with no answers:

```
node tools/cli.ts problem --key CHEM-A --tier 2 --index 0
```

Decode a completion code:

```
node tools/cli.ts decode 2K902-45180-00000-02G6M-ECW4
```

Sweep a tier for taxonomy collisions, broken generation guarantees, and the
unclassified rate:

```
node tools/cli.ts scan --key CHEM-A --tier 3 --count 500
```

The tiers are 1 for mass-to-mass, 2 for mass-to-particles and mass-to-volume
including hydrates, 3 for limiting reagent, and 4 for percent yield. Passing
`--tier 0` to `scan` sweeps all four.

## What the completion code is, and what it is not

**The secret ships inside the client bundle. The MAC detects typos,
transcription errors, and casual hand-editing of a code. It does NOT prevent
forgery by a student who reads the JavaScript.**

That is stated first because it is the thing most likely to be misread. This is
a completion-and-telemetry mechanism, not a proctor. The intended grading
posture is **completion credit, not correctness credit**, and nothing in the
product should be built on the assumption that a code proves work was done.

What the code does carry, in 24 Crockford Base32 characters: the format version,
the assignment key id, the teacher-assigned roster number, how many problems
were attempted, how many were right first time, the error count at each of the
six gated stages, how many algebra branches fired, how many entries the taxonomy
could not classify, the session duration in minutes, and the day offset from the
assignment epoch. Then a 24-bit truncated HMAC-SHA256 over everything before it,
keyed with the build secret and the assignment key id.

The countermeasures in scope are the cheap ones: the MAC, binding the key to the
assignment, binding the day offset, and internal consistency checks — more
first-try-correct answers than problems attempted is refused, as is a code
recording errors against no attempts at all. Obfuscation, server validation,
timing analysis and device fingerprinting are explicitly **out** of scope and
should not be added.

**No student PII, ever.** Identity is a teacher-assigned roster number from 1 to
4095. Nothing in this repository stores, transmits or encodes a name.

## Where things live

- `src/chem/elements.ts` — all 118 elements, IUPAC 2021 conventional atomic
  weights, never rounded in the data file. The header explains why the digit
  counts look uneven and why that is correct.
- `src/chem/formula.ts` — the formula parser: nested groups, both hydrate
  separators, charged species, and a structured rejection naming the character
  offset for anything it will not guess at.
- `src/chem/molarmass.ts` — molar mass, with hydrate water separable because
  leaving it out is its own error class.
- `src/chem/sigfig.ts` — significant figures, counted and propagated. An
  ambiguous number is reported as ambiguous and never resolved.
- `src/chem/balance.ts` — the equation balancer, by exact nullspace over BigInt
  rationals. **Validation only.** The file header says why, and names the one
  export that is safe for a student surface.
- `src/chem/constants.ts` — Avogadro's number, which is exact by definition, and
  the molar volume at STP, which is not.
- `src/code/sha256.ts` — SHA-256 and HMAC, implemented here because WebCrypto is
  asynchronous and `node:crypto` does not exist in a browser. Cross-checked
  against `node:crypto` over random input in the tests.
- `src/code/base32.ts` — Crockford Base32, tolerant of hyphens, whitespace, case,
  and the characters people confuse for 0 and 1.
- `src/code/codec.ts` — the completion code. One field table, walked in both
  directions, so the layout cannot drift between packing and unpacking.
- `src/code/secret.ts` — the build secret, with the warning above repeated where
  someone might be tempted to harden it.
- `src/engine/rng.ts` — the seeded generator, written out in the repository
  because `Math.random` cannot produce the same problems on thirty Chromebooks.
- `src/engine/problem.ts` — the deterministic problem generator and the
  generation guarantees it refuses to break.
- `src/engine/taxonomy.ts` — the error classification. This is the product.
- `src/engine/steps.ts` — the step state machine, immutable, with an injected
  clock.
- `src/engine/tolerance.ts` — every numeric tolerance in the engine, named, with
  the judgement behind it written down.

## What session 1 measured

The two numbers worth reporting, both printed by the test suite when it runs:

- **Taxonomy collisions: 0**, across 10,000 generated problems and 135,564
  predicted wrong values. A collision is two error classes predicting a value a
  student could not tell apart, and it fails the build rather than being
  resolved by a tiebreak.
- **E-UNCLASSIFIED rate: 10.32%** of deliberately wrong entries across a sweep
  of all four tiers. Most of that is by design: the sweep includes entries a
  factor of ten out, and anything past one order of magnitude is unclassified by
  definition. The number is reported rather than suppressed because it is what
  says whether the taxonomy is any good.

## Licence

PolyForm Noncommercial 1.0.0 — see `LICENSE.md`. People may use it; nobody may
sell it.
