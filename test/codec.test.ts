/**
 * codec.test.ts — the completion code.
 *
 * A codec that loses a field is unrecoverable in the way that matters: nothing
 * throws, the teacher's histogram is simply wrong, and by the time anyone
 * notices a class has already used it. So every field is round-tripped a
 * hundred thousand times, and the check compares FIELD BY FIELD rather than
 * comparing two strings — a string comparison would pass a codec that packed
 * and unpacked the same wrong way twice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  CODE_ALPHABET,
  CODE_CHARS,
  CODE_VERSION,
  FIELDS,
  FIELD_MAX,
  MAC_BITS,
  MAC_INPUT_BITS,
  TOTAL_BITS,
  checkConsistency,
  decodeCompletionCode,
  encodeCompletionCode,
  macKey,
  packPayload,
  saturate,
  totalStageErrors,
  unpackPayload,
  type CompletionPayload,
} from '../src/code/codec.ts';
import { hmacSha256, sha256, utf8Bytes } from '../src/code/sha256.ts';
import { makeRng, nextInt } from '../src/engine/rng.ts';

const SECRET = 'molebridge-test-secret';

/* ------------------------------------------------------------------ */
/* The hash, cross-checked against a real one                          */
/* ------------------------------------------------------------------ */

test('SHA-256 matches the published vectors', () => {
  const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
  assert.equal(
    hex(sha256(utf8Bytes('abc'))),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(
    hex(sha256(new Uint8Array(0))),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  assert.equal(
    hex(sha256(utf8Bytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
});

test('SHA-256 and HMAC agree with node:crypto over random input', () => {
  // This is the check that makes the hand-written hash trustworthy, and it is
  // the one thing the implementation cannot do for itself.
  const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
  for (let i = 0; i < 300; i += 1) {
    const message = randomBytes(i * 3);
    const key = randomBytes(1 + (i % 130));
    assert.equal(hex(sha256(new Uint8Array(message))), createHash('sha256').update(message).digest('hex'));
    assert.equal(
      hex(hmacSha256(new Uint8Array(key), new Uint8Array(message))),
      createHmac('sha256', key).update(message).digest('hex'),
    );
  }
});

test('UTF-8 encoding matches the platform, including outside the basic plane', () => {
  for (const text of ['', 'abc', 'héllo', '·', '世界', '🙂', 'CHEM-A · 2026 🙂']) {
    assert.deepEqual(
      Buffer.from(utf8Bytes(text)).toString('hex'),
      Buffer.from(text, 'utf8').toString('hex'),
      text,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

test('the layout adds up to exactly twenty-four characters', () => {
  const fieldBits = FIELDS.reduce((sum, f) => sum + f.bits, 0);
  assert.equal(fieldBits, 95, 'the fields §8.2 lists sum to 95 bits before the MAC');
  assert.equal(fieldBits + MAC_BITS, 119, "which is §8.2's own sum, 119");
  assert.equal(MAC_INPUT_BITS, 96, 'one pad bit plus the fields is what the MAC covers');
  assert.equal(TOTAL_BITS, 120);
  assert.equal(CODE_CHARS, 24);
  assert.equal(CODE_ALPHABET, '0123456789ABCDEFGHJKMNPQRSTVWXYZ');
  assert.equal(CODE_ALPHABET.length, 32);
  for (const forbidden of ['I', 'L', 'O', 'U']) {
    assert.ok(!CODE_ALPHABET.includes(forbidden), `${forbidden} must not be in the alphabet`);
  }
});

/* ------------------------------------------------------------------ */
/* Round trip                                                          */
/* ------------------------------------------------------------------ */

function randomPayload(rng: () => number): CompletionPayload {
  const out: Record<string, number> = {};
  for (const field of FIELDS) out[field.name] = nextInt(rng, 0, FIELD_MAX[field.name]);
  out['version'] = CODE_VERSION;
  return out as CompletionPayload;
}

/** A payload that also satisfies every §9 consistency check. */
function consistentPayload(rng: () => number): CompletionPayload {
  // At least two attempts, and at most eight errors per stage: forty-eight
  // errors is plausible across two problems and the ratio check agrees. Drawing
  // attempted from 1 put the generator itself in violation of §9 — which the
  // round-trip test caught, exactly as it should have.
  const attempted = nextInt(rng, 2, FIELD_MAX.attempted);
  const stages = [0, 0, 0, 0, 0, 0].map(() => nextInt(rng, 0, 8));
  const errors = stages.reduce((a, b) => a + b, 0);
  return {
    version: CODE_VERSION,
    assignmentKeyId: nextInt(rng, 0, FIELD_MAX.assignmentKeyId),
    rosterId: nextInt(rng, 1, FIELD_MAX.rosterId),
    attempted,
    firstTryCorrect: nextInt(rng, 0, attempted),
    errS1: stages[0] as number,
    errS2: stages[1] as number,
    errS3: stages[2] as number,
    errS4: stages[3] as number,
    errS5: stages[4] as number,
    errS6: stages[5] as number,
    algebraTriggers: Math.min(FIELD_MAX.algebraTriggers, nextInt(rng, 0, Math.max(0, errors))),
    unclassified: Math.min(FIELD_MAX.unclassified, nextInt(rng, 0, Math.max(0, errors))),
    durationMin: nextInt(rng, 0, FIELD_MAX.durationMin),
    dayOffset: nextInt(rng, 0, FIELD_MAX.dayOffset),
  };
}

test('one hundred thousand random payloads pack and unpack with zero field loss', () => {
  const rng = makeRng('codec-roundtrip');
  for (let i = 0; i < 100_000; i += 1) {
    const payload = randomPayload(rng);
    const back = unpackPayload(packPayload(payload));
    for (const field of FIELDS) {
      assert.equal(back[field.name], payload[field.name], `${field.name} lost at iteration ${i}`);
    }
  }
});

test('twenty thousand payloads survive the whole encode and decode', () => {
  const rng = makeRng('codec-full-roundtrip');
  let valid = 0;
  for (let i = 0; i < 20_000; i += 1) {
    const payload = consistentPayload(rng);
    const code = encodeCompletionCode(payload, SECRET);
    assert.equal(code.replace(/-/g, '').length, CODE_CHARS);
    const decoded = decodeCompletionCode(code, SECRET);
    assert.equal(decoded.verdict, 'VALID', `${code} came back ${decoded.verdict}: ${decoded.detail}`);
    assert.deepEqual(decoded.fields, payload, `fields differ at iteration ${i}`);
    valid += 1;
  }
  assert.equal(valid, 20_000);
});

test('the display format is 5-5-5-5-4 and the decoder does not care', () => {
  const payload = consistentPayload(makeRng('format'));
  const code = encodeCompletionCode(payload, SECRET);
  assert.match(code, /^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{4}$/);

  const raw = code.replace(/-/g, '');
  const variants = [
    raw,
    code,
    code.toLowerCase(),
    raw.replace(/(.{4})/g, '$1 '),
    `  ${code}\n`,
    raw.split('').join('-'),
    `${raw.slice(0, 7)}\t${raw.slice(7)}`,
  ];
  for (const variant of variants) {
    const decoded = decodeCompletionCode(variant, SECRET);
    assert.equal(decoded.verdict, 'VALID', JSON.stringify(variant));
    assert.deepEqual(decoded.fields, payload);
  }
});

test('Crockford confusables decode the way Crockford says', () => {
  const payload = consistentPayload(makeRng('confusable'));
  const code = encodeCompletionCode(payload, SECRET);
  const folded = code.replace(/0/g, 'O').replace(/1/g, 'l');
  const decoded = decodeCompletionCode(folded, SECRET);
  assert.equal(decoded.verdict, 'VALID');
  assert.deepEqual(decoded.fields, payload);
  // And `I` reads as one as well.
  assert.equal(decodeCompletionCode(code.replace(/1/g, 'I'), SECRET).verdict, 'VALID');
});

/* ------------------------------------------------------------------ */
/* Corruption                                                          */
/* ------------------------------------------------------------------ */

test('single-character corruption is caught as MAC_FAIL essentially always', () => {
  const rng = makeRng('corruption');
  let trials = 0;
  let caught = 0;
  const missed: string[] = [];
  const otherVerdicts: Record<string, number> = {};

  for (let n = 0; n < 250; n += 1) {
    const payload = consistentPayload(rng);
    const raw = encodeCompletionCode(payload, SECRET).replace(/-/g, '');
    for (let position = 0; position < raw.length; position += 1) {
      for (const replacement of CODE_ALPHABET) {
        if (replacement === raw[position]) continue;
        const corrupted = raw.slice(0, position) + replacement + raw.slice(position + 1);
        const decoded = decodeCompletionCode(corrupted, SECRET);
        trials += 1;
        if (decoded.verdict === 'MAC_FAIL') caught += 1;
        else {
          otherVerdicts[decoded.verdict] = (otherVerdicts[decoded.verdict] ?? 0) + 1;
          if (decoded.verdict === 'VALID') missed.push(corrupted);
        }
      }
    }
  }

  assert.ok(trials >= 100_000, `only ${trials} corruptions were tried`);
  const rate = caught / trials;
  assert.ok(
    rate >= 0.9999,
    `MAC_FAIL rate ${(rate * 100).toFixed(4)}% over ${trials} corruptions; others ${JSON.stringify(otherVerdicts)}`,
  );
  assert.deepEqual(missed, [], 'a corrupted code was reported VALID');
});

test('a code minted with a different secret, or a different assignment, does not verify', () => {
  const payload = consistentPayload(makeRng('keying'));
  const code = encodeCompletionCode(payload, SECRET);
  assert.equal(decodeCompletionCode(code, `${SECRET}x`).verdict, 'MAC_FAIL');
  assert.equal(decodeCompletionCode(code, '').verdict, 'MAC_FAIL');

  // The key is bound to the assignment id, so the same counts under a different
  // assignment produce a different code.
  const elsewhere = encodeCompletionCode(
    { ...payload, assignmentKeyId: (payload.assignmentKeyId + 1) % 4096 },
    SECRET,
  );
  assert.notEqual(code, elsewhere);
  assert.deepEqual(
    macKey(SECRET, 0x0102),
    Uint8Array.from([...utf8Bytes(SECRET), 0x01, 0x02]),
  );
});

/* ------------------------------------------------------------------ */
/* Verdicts                                                            */
/* ------------------------------------------------------------------ */

test('a malformed code is MALFORMED, and reports nothing from it', () => {
  for (const bad of ['', '   ', 'ABC', 'A'.repeat(23), 'A'.repeat(25), '----', '2K902-4518U-00000-02G6M-ECW4']) {
    const decoded = decodeCompletionCode(bad, SECRET);
    assert.equal(decoded.verdict, 'MALFORMED', JSON.stringify(bad));
    assert.equal(decoded.fields, null, 'a malformed code must report no fields');
  }
});

test('a MAC failure reports NOTHING from the code', () => {
  const payload = consistentPayload(makeRng('macfail'));
  const raw = encodeCompletionCode(payload, SECRET).replace(/-/g, '');
  const corrupted = `${raw.slice(0, 5)}${raw[5] === 'A' ? 'B' : 'A'}${raw.slice(6)}`;
  const decoded = decodeCompletionCode(corrupted, SECRET);
  assert.equal(decoded.verdict, 'MAC_FAIL');
  assert.equal(decoded.fields, null, '§8.5: never partially report a MAC_FAIL code as if valid');
  assert.deepEqual(decoded.failures, []);
});

test('an unknown format version is its own verdict, not a MAC failure', () => {
  const payload = { ...consistentPayload(makeRng('version')), version: 2 };
  // Built by hand: the encoder will not write a version it does not know.
  const bytes = packPayload(payload);
  const mac = hmacSha256(macKey(SECRET, payload.assignmentKeyId), bytes.slice(0, MAC_INPUT_BITS / 8));
  bytes.set(mac.slice(0, MAC_BITS / 8), MAC_INPUT_BITS / 8);

  let raw = '';
  for (let bit = 0; bit < TOTAL_BITS; bit += 5) {
    let value = 0;
    for (let k = 0; k < 5; k += 1) {
      const index = bit + k;
      value = (value << 1) | (((bytes[index >> 3] as number) >> (7 - (index & 7))) & 1);
    }
    raw += CODE_ALPHABET[value] as string;
  }

  const decoded = decodeCompletionCode(raw, SECRET);
  assert.equal(decoded.verdict, 'VERSION_UNKNOWN');
  assert.equal(decoded.fields, null);
  assert.match(decoded.detail, /version 2/);
});

/* ------------------------------------------------------------------ */
/* §9 internal consistency                                             */
/* ------------------------------------------------------------------ */

/** Encode without the version being forced, so a check can be violated. */
function encodeExactly(payload: CompletionPayload): string {
  return encodeCompletionCode(payload, SECRET);
}

test('every internal consistency check rejects its own case', () => {
  const base = consistentPayload(makeRng('consistency'));
  const clean: CompletionPayload = {
    ...base,
    attempted: 10,
    firstTryCorrect: 4,
    errS1: 2, errS2: 2, errS3: 2, errS4: 2, errS5: 2, errS6: 2,
    algebraTriggers: 3,
    unclassified: 2,
    rosterId: 17,
  };
  assert.deepEqual(checkConsistency(clean), []);
  assert.equal(decodeCompletionCode(encodeExactly(clean), SECRET).verdict, 'VALID');

  const cases: ReadonlyArray<readonly [string, CompletionPayload]> = [
    ['ROSTER_ID_ZERO', { ...clean, rosterId: 0 }],
    ['FIRST_TRY_EXCEEDS_ATTEMPTED', { ...clean, firstTryCorrect: 11 }],
    [
      'NOTHING_ATTEMPTED_BUT_ACTIVITY',
      { ...clean, attempted: 0, firstTryCorrect: 0 },
    ],
    ['UNCLASSIFIED_EXCEEDS_ERRORS', { ...clean, unclassified: 13 }],
    ['ALGEBRA_EXCEEDS_ERRORS', { ...clean, algebraTriggers: 13 }],
    [
      'ERRORS_IMPLAUSIBLE_FOR_ATTEMPTS',
      // No stage at its ceiling, or the check suspends itself — see the test
      // below. Thirty-six errors across one attempted problem is the case.
      { ...clean, attempted: 1, firstTryCorrect: 0, errS1: 30, errS2: 6, errS3: 0, errS4: 0, errS5: 0, errS6: 0, algebraTriggers: 3, unclassified: 2 },
    ],
  ];

  for (const [check, payload] of cases) {
    const failures = checkConsistency(payload);
    assert.ok(
      failures.some((f) => f.check === check),
      `${check} did not fire; got ${JSON.stringify(failures.map((f) => f.check))}`,
    );
    const decoded = decodeCompletionCode(encodeExactly(payload), SECRET);
    assert.equal(decoded.verdict, 'MALFORMED', `${check} should not decode as valid`);
    assert.ok(decoded.failures.some((f) => f.check === check));
    // The MAC verified, so the bits ARE trustworthy and are reported beside the
    // complaint. That is not the same as reporting the code as valid.
    assert.notEqual(decoded.fields, null);
  }
});

test('a saturated counter suspends the ratio checks rather than false-accusing', () => {
  // Every stage at its ceiling means the true error count is unknown, so a
  // bound computed from it would reject a real session. §9 is a completion
  // mechanism, not a proctor, and the asymmetry runs that way on purpose.
  const saturated: CompletionPayload = {
    version: CODE_VERSION,
    assignmentKeyId: 7,
    rosterId: 3,
    attempted: 4,
    firstTryCorrect: 0,
    errS1: 31, errS2: 31, errS3: 31, errS4: 31, errS5: 31, errS6: 31,
    algebraTriggers: 15,
    unclassified: 15,
    durationMin: 60,
    dayOffset: 3,
  };
  assert.equal(totalStageErrors(saturated), 186);
  assert.deepEqual(checkConsistency(saturated), []);
  assert.equal(decodeCompletionCode(encodeExactly(saturated), SECRET).verdict, 'VALID');
});

test('out-of-range counters saturate rather than throwing or wrapping', () => {
  const over: CompletionPayload = {
    version: CODE_VERSION,
    assignmentKeyId: 99_999,
    rosterId: 99_999,
    attempted: 400,
    firstTryCorrect: 400,
    errS1: 90, errS2: -3, errS3: 0, errS4: 0, errS5: 0, errS6: 0,
    algebraTriggers: 40,
    unclassified: 40,
    durationMin: 500,
    dayOffset: 9_999,
  };
  const clamped = saturate(over);
  assert.equal(clamped.attempted, 127);
  assert.equal(clamped.firstTryCorrect, 127);
  assert.equal(clamped.errS1, 31);
  assert.equal(clamped.errS2, 0, 'a negative clamps to zero, it does not wrap to the ceiling');
  assert.equal(clamped.algebraTriggers, 15);
  assert.equal(clamped.durationMin, 127);
  assert.equal(clamped.dayOffset, 511);
  assert.equal(clamped.assignmentKeyId, 4095);
  assert.equal(clamped.rosterId, 4095);
});

test('packPayload throws rather than truncating a field that does not fit', () => {
  const bad = { ...consistentPayload(makeRng('overflow')), rosterId: 5000 };
  assert.throws(() => packPayload(bad), RangeError);
});
