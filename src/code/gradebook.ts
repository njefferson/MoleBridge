/**
 * gradebook.ts — turning a pasted gradebook column into a class picture.
 *
 * A teacher copies a column out of Canvas and pastes it here. What comes across
 * is rarely just codes: it is names, email addresses, section numbers, blank
 * rows, a header, and somewhere in each line a completion code.
 *
 * ================================================================
 *  EVERYTHING THAT IS NOT A CODE IS DISCARDED, AND NOT BECAUSE IT
 *  IS UNTIDY. A pasted gradebook column contains STUDENT NAMES.
 * ================================================================
 *
 * This application has no field for a name, has never had one, and must never
 * have one. The roster number exists precisely so a teacher can map a result
 * back to a person IN THEIR OWN GRADEBOOK, where that mapping already lives and
 * is already protected. So the parser finds the code token on each line and
 * throws the rest of the line away without storing it, showing it, or counting
 * it — and the page says so where the teacher pastes, because a promise nobody
 * is told about is not one they can rely on.
 *
 * A CODE FROM ANOTHER ASSIGNMENT STILL VERIFIES. The MAC is keyed with the
 * assignment id carried inside the code itself, so a code minted for last
 * week's assignment is perfectly valid — it is simply not this one. That
 * comparison has to be made explicitly, and {@link summarise} makes it.
 *
 * PURE. No I/O, no globals, no clock.
 */

import { stripSeparators } from './base32.ts';
import {
  CODE_ALPHABET,
  CODE_CHARS,
  decodeCompletionCode,
  totalStageErrors,
  type DecodeResult,
  type Verdict,
} from './codec.ts';

/** Characters that separate fields in anything a spreadsheet produces. */
const FIELD_SEPARATORS = /[\s,;|"']+/;

/** Every character a code may contain once separators are stripped, folded. */
const CODE_CHARACTER = new RegExp(`^[${CODE_ALPHABET}OoIiLl]+$`, 'i');

/** One line of the paste, and the code found on it. */
export interface GradebookLine {
  /** 1-based, so a teacher can find the line they pasted. */
  readonly number: number;
  /** The code found, separators intact as written. Null where there is none. */
  readonly code: string | null;
}

/**
 * Find the completion code on each line, and discard everything else.
 *
 * PRECONDITION: none. Lines with no code come back with `code: null` and are
 * counted, not silently dropped — a teacher needs to know that four of their
 * thirty rows had nothing in them.
 *
 * NOTHING BUT THE CODE SURVIVES THIS FUNCTION. See the file header.
 */
export function extractCodes(pasted: string): GradebookLine[] {
  const out: GradebookLine[] = [];
  const lines = pasted.split(/\r\n|\r|\n/);

  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    let found: string | null = null;
    for (const field of line.split(FIELD_SEPARATORS)) {
      if (field === '') continue;
      const stripped = stripSeparators(field);
      if (stripped.length !== CODE_CHARS) continue;
      if (!CODE_CHARACTER.test(stripped)) continue;
      found = field;
      break;
    }
    out.push({ number: index + 1, code: found });
  });

  return out;
}

/** One line, decoded. */
export interface DecodedLine extends GradebookLine {
  /** Null where the line carried no code at all. */
  readonly result: DecodeResult | null;
}

/**
 * Decode every code in a pasted column.
 *
 * PRECONDITION: `secret` is the build secret the codes were minted with.
 */
export function decodeGradebook(pasted: string, secret: string): DecodedLine[] {
  return extractCodes(pasted).map((line) => ({
    ...line,
    result: line.code === null ? null : decodeCompletionCode(line.code, secret),
  }));
}

/** A roster number that turned up more than once, and how often. */
export interface Duplicate {
  readonly rosterId: number;
  readonly times: number;
}

/** What the class did, taken together. */
export interface ClassSummary {
  /** Lines that carried something code-shaped. */
  readonly linesWithCode: number;
  /** Lines that did not. */
  readonly linesWithoutCode: number;
  /** How many of each verdict. */
  readonly byVerdict: Readonly<Record<Verdict, number>>;
  /** Codes that verify and belong to THIS assignment. */
  readonly counted: number;
  /**
   * Codes that verify but were minted for a different assignment. Valid, and
   * not this one — the commonest real mistake, and invisible without a check.
   */
  readonly otherAssignment: number;
  /** Roster numbers handed in more than once. */
  readonly duplicates: readonly Duplicate[];
  /* ---- totals across the counted codes ---- */
  readonly problemsAttempted: number;
  readonly firstTryCorrect: number;
  readonly stageErrors: Readonly<Record<'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6', number>>;
  readonly algebraTriggers: number;
  /** §6.2: counted and reported, never suppressed. */
  readonly unclassified: number;
  /** Minutes, the middle value rather than the mean — one long session skews a mean. */
  readonly medianDurationMin: number;
}

const EMPTY_VERDICTS: Record<Verdict, number> = {
  VALID: 0,
  MAC_FAIL: 0,
  VERSION_UNKNOWN: 0,
  MALFORMED: 0,
};

/**
 * Take the decoded lines together into one picture of the class.
 *
 * PRECONDITION: `assignmentKeyId` is the id derived from the teacher's own key.
 * Codes carrying a different id are counted separately rather than added in —
 * they are valid codes for a different assignment, and averaging them into this
 * one is how a class looks worse or better than it was.
 */
export function summarise(lines: readonly DecodedLine[], assignmentKeyId: number): ClassSummary {
  const byVerdict: Record<Verdict, number> = { ...EMPTY_VERDICTS };
  const seen = new Map<number, number>();
  const durations: number[] = [];

  let linesWithCode = 0;
  let linesWithoutCode = 0;
  let counted = 0;
  let otherAssignment = 0;
  let problemsAttempted = 0;
  let firstTryCorrect = 0;
  let algebraTriggers = 0;
  let unclassified = 0;
  const stageErrors = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0 };

  for (const line of lines) {
    if (line.result === null) {
      linesWithoutCode += 1;
      continue;
    }
    linesWithCode += 1;
    byVerdict[line.result.verdict] += 1;

    const fields = line.result.fields;
    if (line.result.verdict !== 'VALID' || fields === null) continue;

    if (fields.assignmentKeyId !== assignmentKeyId) {
      otherAssignment += 1;
      continue;
    }

    counted += 1;
    seen.set(fields.rosterId, (seen.get(fields.rosterId) ?? 0) + 1);
    problemsAttempted += fields.attempted;
    firstTryCorrect += fields.firstTryCorrect;
    algebraTriggers += fields.algebraTriggers;
    unclassified += fields.unclassified;
    stageErrors.S1 += fields.errS1;
    stageErrors.S2 += fields.errS2;
    stageErrors.S3 += fields.errS3;
    stageErrors.S4 += fields.errS4;
    stageErrors.S5 += fields.errS5;
    stageErrors.S6 += fields.errS6;
    durations.push(fields.durationMin);
  }

  const duplicates: Duplicate[] = [...seen.entries()]
    .filter(([, times]) => times > 1)
    .map(([rosterId, times]) => ({ rosterId, times }))
    .sort((a, b) => a.rosterId - b.rosterId);

  return {
    linesWithCode,
    linesWithoutCode,
    byVerdict,
    counted,
    otherAssignment,
    duplicates,
    problemsAttempted,
    firstTryCorrect,
    stageErrors,
    algebraTriggers,
    unclassified,
    medianDurationMin: median(durations),
  };
}

/** The middle value. Zero for nothing at all. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return Math.round(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

/**
 * Total stage errors across a decoded line, or zero where it is not countable.
 *
 * PRECONDITION: none.
 */
export function errorsOn(line: DecodedLine): number {
  const fields = line.result?.fields;
  return fields === null || fields === undefined ? 0 : totalStageErrors(fields);
}
