/**
 * releases.ts — GENERATED FROM CHANGELOG.md. Do not edit.
 *
 * Doctrine §7d: the reader sees what changed, from one source. Run
 * `node tools/changelog.mjs` to regenerate; `--check` fails on drift and is
 * part of `npm run check`.
 */

/** One release, as a reader sees it. */
export interface Release {
  readonly version: string;
  /** VERSION, CAPABILITY or ITERATION — Doctrine §7's release taxonomy. */
  readonly kind: string;
  /** The notes, one string per paragraph. Plain text: the app renders nodes. */
  readonly paragraphs: readonly string[];
}

/** Every release, newest first. */
export const RELEASES: readonly Release[] = [
  {
    version: "0.1.0",
    kind: "CAPABILITY",
    paragraphs: [
      "The first build you can actually use.",
      "Work a stoichiometry problem one step at a time. You enter every value along the way — the balanced coefficients, the molar mass, the moles, the ratio — and you cannot move on until the step in front of you is right. When a step is wrong, MoleBridge tells you which mistake produces that exact number rather than just marking it wrong, and where the mistake is an algebra one it shows you three lines of the algebra using your own numbers.",
      "At the end you get a completion code to type into Canvas.",
      "Five kinds of problem: mass to mass, mass to particles, mass to volume at STP, limiting reactant, and percent yield. Your teacher's assignment key decides which problems you get, and everyone with the same key gets the same ones.",
      "Works with no connection once it has loaded, and can be installed to your home screen or shelf.",
      "What is still missing, so you know rather than wonder. There is no way to review a problem you have already finished. There is no running total across sessions — close the tab and the count starts again, because nothing is stored anywhere. And the code carries counts only: it cannot show your teacher which particular problem went wrong.",
    ],
  },
];
