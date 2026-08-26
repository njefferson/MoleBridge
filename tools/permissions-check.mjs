#!/usr/bin/env node
/**
 * permissions-check.mjs — this app asks the browser for nothing, and stays that way.
 *
 *   node tools/permissions-check.mjs        after `npm run build`
 *
 * ## Why a gate rather than a look
 *
 * "It does not use the camera" is true today and is a fact about a moment. A
 * dependency is not what would change it here — there are none — but a future
 * convenience is: a photo of your working, a notification when a new version
 * lands, a wake lock so the screen stays on during a long problem. Each is a
 * sentence somebody would say in good faith, and each would put a permission
 * prompt in front of a fifteen-year-old on a school device.
 *
 * So this reads the BUILT BUNDLE — the JavaScript that actually ships, not the
 * source it came from — and fails on any API that can raise a permission
 * prompt. And it reads `public/_headers` and fails if a feature stops being
 * denied there, because the header is the half that holds even for code nobody
 * audited.
 *
 * TWO ALLOWANCES, BOTH NAMED. `clipboard.writeText`, and `speechSynthesis` —
 * which is output only: it raises no prompt, touches no network and reads no
 * device state. It is here because read-aloud is one of the commonest
 * accommodations on a 504 plan, and an app that asks the browser for nothing
 * can still speak.
 *
 * The first allowance: Writing to the clipboard from a
 * click needs no prompt in any current browser, every call here is wrapped so a
 * refusal degrades to "write it down instead", and `clipboard-read` is denied
 * outright — reading is the half that could see something a student did not
 * mean to hand over.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC = join(REPO, 'public');

/**
 * Every API that can put a permission prompt on screen, or that reads something
 * about the device a student did not offer. Matched as text against the shipped
 * bundle, which is blunt and is the point: a match is a conversation, not a
 * silent pass.
 */
const FORBIDDEN = [
  ['getUserMedia', 'camera and microphone'],
  ['getDisplayMedia', 'screen capture'],
  ['mediaDevices', 'camera and microphone'],
  ['navigator.geolocation', 'location'],
  ['new Notification', 'notifications'],
  ['requestPermission', 'any permission prompt'],
  ['navigator.permissions', 'permission state'],
  ['navigator.bluetooth', 'Bluetooth'],
  ['navigator.usb', 'USB'],
  ['navigator.serial', 'serial ports'],
  ['navigator.hid', 'human interface devices'],
  ['requestMIDIAccess', 'MIDI'],
  ['wakeLock', 'keeping the screen awake'],
  ['clipboard.readText', 'READING the clipboard'],
  ['showOpenFilePicker', 'the file system'],
  ['showSaveFilePicker', 'the file system'],
  ['requestIdleDetector', 'idle detection'],
  ['IdleDetector', 'idle detection'],
  ['getInstalledRelatedApps', 'what else is installed'],
  ['navigator.getBattery', 'the battery'],
  ['requestDevice', 'a device pairing prompt'],
];

/** Features the Permissions-Policy must keep denying. */
const MUST_DENY = [
  'accelerometer', 'bluetooth', 'browsing-topics', 'camera', 'display-capture',
  'geolocation', 'gyroscope', 'hid', 'idle-detection', 'local-fonts',
  'magnetometer', 'microphone', 'midi', 'payment', 'screen-wake-lock',
  'serial', 'usb', 'window-management', 'xr-spatial-tracking', 'clipboard-read',
];

/**
 * The file with its comments taken out.
 *
 * THIS FILE MATCHES TEXT, which is blunt on purpose — and blunt was matching
 * PROSE. A comment in `work.ts` explaining that speech sits beside
 * `clipboard.writeText` as an allowance made this gate report a clipboard write
 * with no fallback, in a file that does not touch the clipboard. The same flaw
 * would fire on a comment saying "this deliberately does not call
 * getUserMedia" — a gate that fails on a sentence promising to obey it teaches
 * people to word things around it, which is the opposite of what it is for.
 *
 * DELIBERATELY CONSERVATIVE, because a stripper that removes too much creates
 * false NEGATIVES, which are the failure this file cannot afford. Block
 * comments come out whole; a line comment comes out only when the line is
 * ENTIRELY a comment. `//` inside a string — every https:// in the tree — is
 * left exactly where it is, so nothing after it on that line can be hidden.
 */
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

let failures = 0;
const fail = (message) => {
  console.log(`  FAIL  ${message}`);
  failures += 1;
};
const ok = (message) => console.log(`  ok    ${message}`);

console.log('\n=== permissions · MoleBridge ===\n');

/* ---- 1. the shipped bundle asks for nothing ---- */

function everyFile(directory) {
  const out = [];
  if (!existsSync(directory)) return out;
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) out.push(...everyFile(full));
    else out.push(full);
  }
  return out;
}

const shipped = [
  ...everyFile(join(PUBLIC, 'app')),
  ...everyFile(PUBLIC).filter((file) => file.endsWith('.js') || file.endsWith('.html')),
].filter((file, at, all) => all.indexOf(file) === at);

if (shipped.length === 0) {
  console.error('  No built bundle found. Run `npm run build` first.\n');
  process.exit(1);
}

let found = 0;
for (const file of shipped) {
  const text = withoutComments(readFileSync(file, 'utf8'));
  for (const [needle, what] of FORBIDDEN) {
    if (text.includes(needle)) {
      fail(`${relative(REPO, file)} uses ${needle} — that would ask for ${what}`);
      found += 1;
    }
  }
}
if (found === 0) ok(`${shipped.length} shipped files, none of which can raise a permission prompt`);

/* ---- 2. clipboard WRITE is the one allowance, and it degrades ---- */

const writers = shipped.filter((file) => withoutComments(readFileSync(file, 'utf8')).includes('clipboard.writeText'));
if (writers.length > 0) {
  // Every one has to be inside a try, or a browser that refuses leaves a button
  // that silently does nothing — which reads to a student as the app being
  // broken rather than as the clipboard being unavailable.
  for (const file of writers) {
    const text = withoutComments(readFileSync(file, 'utf8'));
    const at = text.indexOf('clipboard.writeText');
    const before = text.slice(Math.max(0, at - 400), at);
    if (!before.includes('try')) {
      fail(`${relative(REPO, file)} writes to the clipboard without a fallback`);
    }
  }
  if (failures === found) ok(`clipboard writing is the only allowance, in ${writers.length} file(s), each with a fallback`);
}

/* ---- 3. speech is output only, and stays that way ---- */

// SPEECH SYNTHESIS IS ALLOWED; SPEECH *RECOGNITION* IS NOT, and the two are one
// letter apart in the same corner of the platform. Recognition turns on a
// microphone and would put a permission prompt in front of a student — the
// exact thing this file exists to prevent — so the allowance is written as
// narrowly as the difference between them.
const RECOGNITION = ['SpeechRecognition', 'webkitSpeechRecognition', 'speechRecognition'];
let listening = 0;
for (const file of shipped) {
  const text = withoutComments(readFileSync(file, 'utf8'));
  for (const needle of RECOGNITION) {
    if (text.includes(needle)) {
      fail(`${relative(REPO, file)} uses ${needle} — that would ask for the microphone`);
      listening += 1;
    }
  }
}
if (listening === 0) {
  const speakers = shipped.filter((file) => withoutComments(readFileSync(file, 'utf8')).includes('speechSynthesis'));
  ok(
    speakers.length === 0
      ? 'nothing speaks, and nothing listens'
      : `speech is output only, in ${speakers.length} file(s) — nothing listens`,
  );
}

/* ---- 4. the header still denies what it claims to ---- */

const headers = readFileSync(join(PUBLIC, '_headers'), 'utf8');
const policyLine = /^\s*Permissions-Policy:\s*(.+)$/mi.exec(headers);
if (policyLine === null) {
  fail('public/_headers declares no Permissions-Policy at all');
} else {
  const policy = policyLine[1];
  const missing = MUST_DENY.filter((feature) => !policy.includes(`${feature}=()`));
  if (missing.length > 0) fail(`the Permissions-Policy no longer denies: ${missing.join(', ')}`);
  else ok(`the Permissions-Policy denies all ${MUST_DENY.length} features on the list`);

  if (!policy.includes('clipboard-write=(self)')) {
    fail('clipboard-write is not allowed, so every copy button on the site is dead');
  } else {
    ok('and allows clipboard-write, which is what the copy buttons need');
  }
}

if (failures > 0) {
  console.error(`\n${failures} problem(s). This app asks the browser for nothing, and something here would.\n`);
  process.exit(1);
}
console.log('\nNothing here can put a permission prompt in front of a student.\n');
