/**
 * rng.ts — the seeded generator, written out here on purpose.
 *
 * §6.3: a problem set is a pure function of (assignmentKey, tier, index), and
 * the same key produces the same problems on every device, every time.
 * `Math.random` cannot do that and is banned by the specification, and a
 * package is banned by the no-runtime-dependencies constraint, so the generator
 * lives here where it can be pinned by a test.
 *
 * sfc32, seeded through a 32-bit FNV-1a walk over the key string. Every
 * operation is uint32 with `>>> 0` or `| 0`, so a Chromebook, a ViewBoard and a
 * CI runner produce the same stream — which is the entire requirement. Nothing
 * here is cryptographic and nothing here should be used as if it were.
 *
 * PURE apart from the generator's own advancing state, which is explicit.
 */

/** A generator: each call returns the next uint32. */
export type Rng = () => number;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Hash a string to a uint32, FNV-1a.
 *
 * PRECONDITION: none. Operates on UTF-16 code units, which is stable across
 * every engine this ships to for the ASCII keys a teacher types.
 */
export function hashString(text: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/**
 * Build a generator from a seed string.
 *
 * PRECONDITION: none. The same string always yields the same stream; different
 * strings almost always yield different ones, which is all that is asked of it.
 */
export function makeRng(seed: string): Rng {
  let a = hashString(`${seed}|a`) >>> 0;
  let b = hashString(`${seed}|b`) >>> 0;
  let c = hashString(`${seed}|c`) >>> 0;
  let d = hashString(`${seed}|d`) >>> 0;

  const next = (): number => {
    const t = (a + b) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    d = (d + 1) >>> 0;
    const u = (t + d) >>> 0;
    c = (c + u) >>> 0;
    return u;
  };

  // Discard the first draws: the state is a hash of the seed rather than a
  // random one, and the earliest outputs of sfc32 carry that structure through.
  for (let i = 0; i < 20; i += 1) next();
  return next;
}

/**
 * A uniform integer in [min, max], both inclusive.
 *
 * PRECONDITION: `min` and `max` are integers and `min <= max`. Rejection
 * sampling, not modulo — a modulo fold makes the low values fractionally more
 * likely, which over ten thousand generated problems is a visible bias in which
 * reactions a class sees.
 */
export function nextInt(rng: Rng, min: number, max: number): number {
  const span = max - min + 1;
  if (span <= 0) throw new RangeError(`empty range ${min}..${max}`);
  const limit = Math.floor(0x100000000 / span) * span;
  let draw = rng();
  while (draw >= limit) draw = rng();
  return min + (draw % span);
}

/**
 * Pick one item.
 *
 * PRECONDITION: `items` is not empty.
 */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick from an empty list');
  return items[nextInt(rng, 0, items.length - 1)] as T;
}
