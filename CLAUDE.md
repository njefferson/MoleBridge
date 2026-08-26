# CLAUDE.md — MoleBridge

> **Inherits the Universal App Doctrine.** The canonical copy lives in the hub
> repository at [`noahjefferson/DOCTRINE.md`](https://github.com/njefferson/noahjefferson/blob/main/DOCTRINE.md),
> alongside [`LESSONS.md`](https://github.com/njefferson/noahjefferson/blob/main/LESSONS.md)
> and [`SECURITY.md`](https://github.com/njefferson/noahjefferson/blob/main/SECURITY.md).
> It is the single source of truth for product values, taste, accessibility,
> honesty, verification, release discipline, licensing, privacy, the permanent
> **AskUserQuestion ban** (§0), and the **repo-metadata confirm rule** (§10).
> **Where anything below overlaps the Doctrine, the Doctrine wins.** Never fork
> it into this repository — link to it.

**Run this first, in the hub, at the start of any session here:**

```
node ../noahjefferson/doctrine-sync.mjs --repo . --adopt
```

## Read NOTES.md before changing anything

[`NOTES.md`](NOTES.md) is this repository's source of truth: the thesis, what is
built, every judgement call and the reasoning behind it, the two defects the
tests caught, and what sessions 2 and 3 owe. It is short and it exists because
the reasoning behind a threshold is the first thing lost.

## What this repository is

A step-gated stoichiometry trainer for one high school chemistry classroom.
Static site, Cloudflare Pages, installable PWA, offline after first load, no
backend, no accounts, no cookies, no network calls at runtime. Students are on
managed Chromebooks; the board at the front is a ViewBoard running Chromium.

**Attribution is the product. Do not build a solver.** Free tools already solve
these problems and already explain the procedure. What none of them do is
attribute a specific wrong number to a specific conceptual failure and report
that to the teacher.

## The rules specific to this repository

- **NO STUDENT PII, EVER.** Identity is a teacher-assigned roster number from 1
  to 4095. Not a name, not an email, not a device id, not a class period that
  narrows to one person.
- **The correct answer is never displayed before the student's attempt at that
  stage.** `solve()` and `predictionsFor()` are the grader's. A screen renders a
  `Problem`, which carries no coefficients, no molar masses and no
  intermediates, and that separation is the reason the type exists.
- **`solveBalance` must not be reachable from any student-facing path.** The
  header of `src/chem/balance.ts` says so and names the one export that is safe
  there: `checkBalance`, which grades a coefficient set already committed to and
  cannot be run backwards into an answer.
- **The completion code's secret ships in the bundle, and that is accepted.**
  The MAC catches typos, transcription slips and casual hand-editing. It does
  not stop a student who reads the JavaScript. §9 of the project specification
  rules obfuscation, server validation, timing analysis and device
  fingerprinting out of scope — **do not add them**, and do not write anything
  that implies the code proves work was done. The grading posture is completion
  credit, not correctness credit.
- **A taxonomy collision fails the build. Never add a tiebreak.** If two error
  classes predict a value a student could not tell apart, the decomposition is
  wrong or the problem should not have been posed. Every fix so far has been a
  generation guarantee; `NOTES.md` lists them and what each was found by.
- **E-UNCLASSIFIED is counted and reported, never suppressed.** It is the metric
  that says whether the taxonomy needs work.
- **No third-party runtime dependencies for domain logic**, and no network calls
  at runtime. Element data is embedded. Build tooling only — today that is the
  type checker and nothing else.
- **NEVER ADD A COLOUR THEME THAT HAS NOT BEEN MEASURED.** Three files declare
  the palette — `palettes/molebridge.json`, `public/styles.css` and
  `public/theme.js` — and `npm run tokens` refuses to let them disagree, so a
  theme reaches the picker only after the hub's gate has cleared it in both
  modes. `npm run palette` measures all six. The neutrals are the Instrument
  family in every theme; only the accent moves.
- **A NEW COLOUR SET NEEDS `npm run palette` AND NOTHING ELSE — because two
  gates make that true, and breaking either one breaks it.** The app paints only
  role tokens, which `npm run a11y` asserts by reverse-mapping every rendered
  colour to the token it came from; and `_renders` in `palettes/molebridge.json`
  records the pairings the app actually makes, which the same run holds
  identical to what it just saw. **Never type into `_renders`** — it comes out
  of a run, and the failure message names the exact string. The default sweep is
  one palette; **CI runs `--all-palettes`, and that spelling is the only one the
  recorded list is authoritative from**, because two roles sharing a value in
  one palette mask a pairing. PALETTES.md §7b is the whole argument.
- **`public/theme.js` is a blocking, non-module, external script and must stay
  all three.** Non-module because a module is deferred and would run after the
  paint it prevents; external because this app has no inline script at all,
  which is what keeps a Content-Security-Policy reachable without
  `unsafe-inline`; after the stylesheet because it reads `--page` back out.
- **AN ACCOMMODATION IS A DEVICE-LOCAL PREFERENCE AND NEVER LEAVES THE DEVICE.**
  Text size, letter and line spacing, one-step-at-a-time and read-aloud live in
  `localStorage` and are applied by `public/theme.js` before first paint. **None
  of them may reach the completion code, the problem report, or the teacher's
  page.** A student's accommodations are disability information; a code that
  carried them would make a student disclose an accommodation by using it, over
  a channel they cannot opt out of. Two gates hold it: `readout.test.ts` fails
  on any codec field that is not described to the student, and the walk checks
  the problem report with every setting turned on. And the app must never store
  or transmit *which* accommodations a student has — that is her IEP paperwork
  and her gradebook, not a web app with no accounts.
- **NEVER WRITE THE ROOM AROUND THE READER.** This was built for one chemistry
  classroom and the copy came out that way — *your teacher has put these on the
  board*, *type it into the Canvas assignment*, *decode a class*. Every one was
  accurate and every one told a homeschooler, a tutor or an adult working alone
  that the app belongs to somebody else. `npm run language` forbids each phrase
  by name and prints the replacement, because the way around this gate is a
  synonym that excludes exactly as much: say *whoever set the work*, *wherever
  you hand your work in*, *the codes you were handed*. It reads with comments
  stripped — a comment may describe the classroom, since that is the reason
  several features exist — and it skips `src/ui/releases.ts`, which is generated
  from CHANGELOG.md and is a record rather than a surface.
- **Speech synthesis is allowed; speech RECOGNITION is not.** They are one
  letter apart in the same corner of the platform, and recognition turns on a
  microphone. `tools/permissions-check.mjs` names the allowance and forbids the
  other by name.
- **Every numeric tolerance is a named constant** in
  `src/engine/tolerance.ts`, with the judgement behind it written beside it.
  Never an inline literal.
- **No date access outside an injected clock.** The completion code carries a
  duration and a day offset, and a test that cannot control those cannot check
  them.

## Running it

Node 22.18 or newer. TypeScript is stripped by Node itself — no build step, no
bundler.

```
npm ci
npm run check
```

That is the strict type check followed by the whole test suite. `README.md` has
the command-line harness, which exercises the engine end to end and is **not a
student surface**: it prints answers.

## Branches

**Work commits to `staging`. `main` is production** — it is the Cloudflare Pages
production branch, so a commit landing on it is a commit landing on the address
a class opens. Promotion is a merge; a commit made directly on `main` needs
`MOLEBRIDGE_PROMOTE=1` in front of it. The harness's own `claude/*` branch is
kept pointing at the same commit so nothing is stranded on it.

**This is a hook, not a paragraph.** `.branch-guard` is the whole configuration
and the hub GENERATES `.githooks/pre-commit` from it — never edit that file:

```
node ../noahjefferson/branch-guard.mjs --repo . --install
```

`npm ci` runs the install through `prepare`, because a fresh clone has no
`.git/hooks` and the tracked copy is not the one git runs. `npm run branch`
fails on drift. CI runs it as `--artefact`, which is the only spelling a runner
can satisfy — see NOTES.md.

## Repo metadata (manual, confirm — Doctrine §10)

Description, website, topics and social preview are GitHub-UI steps a session
token cannot perform. Proposed values live in the hub's `METADATA.md`. Never
report this repository set up while a row there says proposed.
