/**
 * secret.ts — the build secret the completion-code MAC is keyed with.
 *
 * ================================================================
 *  THIS VALUE SHIPS INSIDE THE CLIENT BUNDLE. IT IS NOT A SECRET
 *  FROM A STUDENT. IT IS ONE FROM A TYPO.
 * ================================================================
 *
 * §8.3 calls it a compile-time constant in the bundle, and §9 accepts what that
 * means: anyone who opens the developer tools can read it and mint any code
 * they like. The MAC catches mistyped and transcribed codes, codes pasted into
 * the wrong assignment's column, and codes edited by hand by someone who did
 * not read the JavaScript. It catches nothing else and is not meant to.
 *
 * DO NOT HARDEN THIS. §9 rules obfuscation, server validation, timing analysis
 * and device fingerprinting explicitly out of scope, and the grading posture
 * the whole product assumes is completion credit rather than correctness
 * credit. A stronger secret here would buy nothing and would suggest a
 * guarantee that does not exist.
 *
 * A deployment replaces the value at build time. Changing it invalidates every
 * code already minted, so it changes between school years, not between
 * releases.
 */

/** The key material the MAC is built on. Replaced at build time. */
export const BUILD_SECRET = 'molebridge-session-1-development-build';
