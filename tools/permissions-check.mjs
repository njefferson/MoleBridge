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
 * ONE ALLOWANCE, NAMED: `clipboard.writeText`. Writing to the clipboard from a
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
  const text = readFileSync(file, 'utf8');
  for (const [needle, what] of FORBIDDEN) {
    if (text.includes(needle)) {
      fail(`${relative(REPO, file)} uses ${needle} — that would ask for ${what}`);
      found += 1;
    }
  }
}
if (found === 0) ok(`${shipped.length} shipped files, none of which can raise a permission prompt`);

/* ---- 2. clipboard WRITE is the one allowance, and it degrades ---- */

const writers = shipped.filter((file) => readFileSync(file, 'utf8').includes('clipboard.writeText'));
if (writers.length > 0) {
  // Every one has to be inside a try, or a browser that refuses leaves a button
  // that silently does nothing — which reads to a student as the app being
  // broken rather than as the clipboard being unavailable.
  for (const file of writers) {
    const text = readFileSync(file, 'utf8');
    const at = text.indexOf('clipboard.writeText');
    const before = text.slice(Math.max(0, at - 400), at);
    if (!before.includes('try')) {
      fail(`${relative(REPO, file)} writes to the clipboard without a fallback`);
    }
  }
  if (failures === found) ok(`clipboard writing is the only allowance, in ${writers.length} file(s), each with a fallback`);
}

/* ---- 3. the header still denies what it claims to ---- */

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
