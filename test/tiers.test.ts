/**
 * tiers.test.ts — the difficulty ladder is measured, not asserted.
 *
 * ## Why this exists
 *
 * A tier control that exists and does nothing is worse than no control: its
 * presence answers "is difficulty handled here" for everybody who comes
 * afterwards, and the reader who picked the wrong rung gets a set that is not
 * the one they asked for. The names are copy; only the generator is evidence.
 *
 * ## The signal is UNIFORM, and that is the whole design
 *
 * Every tier is measured by the same probes. A per-tier probe is a probe
 * somebody can tune until the answer comes out right — hub LESSONS 141 is a
 * check that derived its population from the fix it enforced, and a
 * "difficulty" measure chosen per tier is that mistake wearing a lab coat.
 *
 * Two ways a tier may earn its place, and it passes on EITHER:
 *
 *   STRUCTURE   it poses problem kinds the tier below never produces, so it
 *               unlocks templates rather than merely scaling numbers.
 *   MAGNITUDE   a relative shift of at least `SEPARATION` in a uniform
 *               measure — stage count, species count, answer precision, or the
 *               size of the numbers.
 *
 * SIZE IS READ WITH ITS EXPONENT. Half this app's answers are in scientific
 * notation and run across orders of magnitude; comparing mantissas alone would
 * report a ladder as flat precisely where it climbs hardest.
 *
 * If a tier measures flat, the finding is the asymmetry — NOT a reason to
 * invent a difficulty so the ladder looks symmetrical.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TIERS, TIER_NAMES, generateProblem, solve } from '../src/engine/problem.ts';
import { stagesFor } from '../src/engine/taxonomy.ts';
import { readFileSync } from 'node:fs';

/**
 * The relative shift a uniform measure must show for a tier to count as
 * separated by magnitude alone.
 *
 * 12%: well under the separations a real step produces, and well above the
 * noise between two tiers that differ in nothing. Both numbers are printed by
 * this test rather than promised, so the floor can be re-judged against what it
 * actually sees.
 */
const SEPARATION = 0.12;

/** How many problems per tier. Enough that one odd draw cannot move a mean. */
const SAMPLE = 400;

/** Every uniform measure, read the same way for every tier. */
function measure(tier: number): {
  readonly kinds: Set<string>;
  readonly stages: number;
  readonly species: number;
  readonly figures: number;
  readonly magnitude: number;
} {
  const kinds = new Set<string>();
  let stages = 0;
  let species = 0;
  let figures = 0;
  let logSum = 0;

  for (let i = 0; i < SAMPLE; i += 1) {
    const problem = generateProblem(`LADDER-${tier}`, tier, i);
    kinds.add(problem.kind);
    stages += stagesFor(problem).length;
    species += problem.species.length;
    figures += problem.answerSigFigs;
    // THE EXPONENT IS PART OF THE SIZE. A base-10 log carries it by
    // construction, which is the point: 1.4e24 and 1.4e2 have the same mantissa
    // and are not the same number to anybody being asked to work with them.
    // `converted` and not the per-kind final value: tier 4 ends on a percentage
    // and the rest end on a quantity, so reading "the answer" would compare a
    // percent against grams and call the difference difficulty. `converted` is
    // the same quantity computed the same way at every tier, which is what
    // uniform means.
    const size = Math.abs(solve(problem).converted);
    logSum += Number.isFinite(size) && size > 0 ? Math.log10(size) : 0;
  }

  return {
    kinds,
    stages: stages / SAMPLE,
    species: species / SAMPLE,
    figures: figures / SAMPLE,
    magnitude: logSum / SAMPLE,
  };
}

const shift = (a: number, b: number): number =>
  Math.max(Math.abs(a), Math.abs(b)) === 0 ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));

test('EVERY TIER POSES SOMETHING THE ONE BELOW IT DOES NOT', () => {
  const seen = TIERS.map((tier) => ({ tier, m: measure(tier) }));

  for (const { tier, m } of seen) {
    console.log(
      `  tier ${tier}: kinds=${[...m.kinds].join('+')} stages=${m.stages.toFixed(2)}`
      + ` species=${m.species.toFixed(2)} figures=${m.figures.toFixed(2)}`
      + ` log10(answer)=${m.magnitude.toFixed(2)}`,
    );
  }

  const flat: string[] = [];
  for (let at = 1; at < seen.length; at += 1) {
    const below = seen[at - 1] as { tier: number; m: ReturnType<typeof measure> };
    const here = seen[at] as { tier: number; m: ReturnType<typeof measure> };

    const newKinds = [...here.m.kinds].filter((k) => !below.m.kinds.has(k));
    const shifts = {
      stages: shift(here.m.stages, below.m.stages),
      species: shift(here.m.species, below.m.species),
      figures: shift(here.m.figures, below.m.figures),
      magnitude: shift(here.m.magnitude, below.m.magnitude),
    };
    const biggest = Math.max(...Object.values(shifts));
    const how = Object.entries(shifts)
      .map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`)
      .join(', ');

    console.log(
      `  ${below.tier} → ${here.tier}: new kinds [${newKinds.join(', ') || 'none'}]  ${how}`,
    );

    if (newKinds.length === 0 && biggest < SEPARATION) {
      flat.push(`tier ${here.tier} poses nothing tier ${below.tier} does not (best signal ${(biggest * 100).toFixed(1)}%)`);
    }
  }

  assert.deepEqual(flat, [], flat.join('; '));
});

test('ONE LADDER, AND EVERY SURFACE READS IT FROM THE ENGINE', () => {
  /*
    THREE SURFACES DECLARED THREE LADDERS, and this test is what they cost.

    The assignment screen offered four sets, practice offered three, and the
    warm-up builder on the teacher's page offered a fourth set of names again.
    So percent yield could be assigned and could not be practised, and
    practice's third rung was called "Limiting reagent and yield" for a tier
    that has never once posed a yield. A student who chose it to rehearse the
    thing she was about to be graded on got a set without it in.

    STRUCTURAL, NOT A WORD SEARCH. Asking whether a file mentions a tier name
    would pass the moment somebody phrased one differently; asking whether it
    DECLARES a ladder of its own is a question about the shape of the code, and
    the only way past it is to stop declaring one.
  */
  const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

  const surfaces = [
    ['src/ui/setup.ts', 'the assignment screen'],
    ['src/ui/practice.ts', 'the practice screen'],
    ['src/codes/main.ts', "the warm-up builder"],
  ] as const;

  for (const [path, what] of surfaces) {
    const text = source(`../${path}`);
    assert.ok(
      /import \{[^}]*\bTIERS\b[^}]*\} from '[^']*engine\/problem\.ts'/.test(text),
      `${what} (${path}) does not import TIERS from the engine`,
    );
    assert.ok(
      /import \{[^}]*\bTIER_NAMES\b[^}]*\} from '[^']*engine\/problem\.ts'/.test(text),
      `${what} (${path}) does not import TIER_NAMES from the engine`,
    );
    assert.ok(
      !/^const TIERS\b/m.test(text) && !/^const TIER_NAMES\b/m.test(text),
      `${what} (${path}) declares a tier list of its own instead of the engine's`,
    );
  }

  // AND THE MARKUP. The warm-up set list was four hand-typed <option> rows in
  // the page, which no amount of discipline in the modules could have reached.
  const page = source('../public/codes/index.html');
  const select = /<select id="warmup-set">([\s\S]*?)<\/select>/.exec(page);
  assert.ok(select !== null, 'the warm-up set list is not in public/codes/index.html any more');
  assert.equal(
    (select[1] ?? '').trim(),
    '',
    'the warm-up set list has options typed into the page; it is filled from TIER_NAMES',
  );
});

test('EVERY TIER IS NAMED, AND NAMED FOR WHAT IT ACTUALLY POSES', () => {
  // A NAME IS A CLAIM. `Percent yield` on a tier that never poses a yield is a
  // wrong answer printed on a button, and nothing else in this suite reads the
  // names at all.
  const posed = new Map(TIERS.map((tier) => [tier, measure(tier).kinds]));
  const claims: Readonly<Record<number, readonly string[]>> = {
    1: ['MASS_TO_MASS'],
    2: ['MASS_TO_PARTICLES', 'MASS_TO_VOLUME'],
    3: ['LIMITING_REAGENT'],
    4: ['PERCENT_YIELD'],
  };

  for (const tier of TIERS) {
    const name = TIER_NAMES[tier];
    assert.ok(name !== undefined && name.trim() !== '', `tier ${tier} has no name`);
    assert.deepEqual(
      [...(posed.get(tier) ?? [])].sort(),
      [...(claims[tier] ?? [])].sort(),
      `tier ${tier} is called "${name ?? ''}" but poses something else`,
    );
  }

  assert.equal(
    new Set(TIERS.map((t) => TIER_NAMES[t])).size,
    TIERS.length,
    'two tiers share a name, so the control cannot tell them apart',
  );
});
