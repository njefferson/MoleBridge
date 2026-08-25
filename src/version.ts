/**
 * version.ts — the running release, and the ONE place it is written.
 *
 * Doctrine §7b: the version is on screen in the app's normal working view, read
 * from this constant at boot rather than typed a second time somewhere. A
 * screenshot arrives with no context, and without a version on it a session
 * cannot tell a bug that still exists from one fixed three releases ago — and
 * it will guess, confidently, either way.
 *
 * THE TRIPLET IS `version.capability.iteration` (Doctrine §7). Bump the slot
 * matching the kind of release and zero the slots after it:
 *
 *   VERSION     changes what the app IS. Rare, and the owner's call — never
 *               inferred from how much work a session did.
 *   CAPABILITY  the app can now do something it could not.
 *   ITERATION   a refinement or a fix of something that already exists.
 *
 * `tools/version-check.mjs` holds this value identical to the top entry of
 * CHANGELOG.md and to the service worker's cache name, so the three cannot
 * drift apart. Bump them in one commit.
 */

/** The running release. Read at boot; never written down twice. */
export const VERSION = '0.9.0';
