// SPDX-License-Identifier: GPL-3.0-or-later
// Self-test for check-engine-boundary.mjs. Run: node --test scripts/check-engine-boundary.test.mjs
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { findWords } from "./check-engine-boundary.mjs";

const MUST_FAIL = [
  // camelCase, snake_case and constants
  "setMasjidFences", "SET_MASJID_FENCES", "MASJID_RADIUS", "mosque_id", "PrayerWindow",
  "Silenced for Zuhr jamat", "dhuhrStart", "adhanAlarm",
  // apostrophes and hyphens
  "jama'at", "jama-at", "Jumu'ah", "Jumu\u2018ah", "Jumu\u02BFah", "jam\u0101\u2018at",
  // accents, fullwidth, dotted capital, invisible characters
  "jam\u0101'at", "jam\u0101t", "\u1E62al\u0101h", "masj\u012Bd", "\u1E92uhr",
  "\uFF4D\uFF41\uFF53\uFF4A\uFF49\uFF44", "MASJ\u0130D", "m\u200Basjid", "mas\u00ADjid",
  // spellings
  "azaan", "adhaan", "namaaz", "namaj", "nomaz", "salaah", "jammat", "masjed", "taraweeh",
  "khutbah", "Quran", "tahajjud", "iftar", "suhoor", "sehri",
  // short words as tokens, plurals included
  "ishaStart", "ISHA_TIME", "asr", "AsrWindow", "Asar", "Esha", "isya", "Juma", "Maghreb",
  "eid-ul", "onEidDay", "EIDs", "eids", "imam_id", "imams", "pray", "prayed", "witr", "wudu",
  "Allah", "athan", "athanAlarm",
  // native scripts (Bengali, Hindi, Urdu/Arabic)
  "\u09AE\u09B8\u099C\u09BF\u09A6", "\u09A8\u09BE\u09AE\u09BE\u099C", "\u099C\u09BE\u09AE\u09BE\u09A4", "\u0986\u099C\u09BE\u09A8",
  "\u092E\u0938\u094D\u091C\u093F\u0926", "\u0928\u092E\u093E\u091C\u093C", "\u091C\u092E\u093E\u0924", "\u0905\u091C\u093C\u093E\u0928",
  "\u0645\u0633\u062C\u062F", "\u0646\u0645\u0627\u0632", "\u0635\u0644\u0627\u0629", "\u062C\u0645\u0627\u0639\u062A", "\u0623\u0630\u0627\u0646",
];

const MUST_PASS = [
  "finishAt", "publishable", "eraser", "deidentify", "fasterRestore", "Disha", "Ishaan", "Heidi",
  "spray", "Jonathan", "Nathan", "Tallahassee",
  "Silenced", "Unmute now", "khushu-engine", "KhushuEngineModule", "setFences", "window_open",
  "Back on at {until}", "io.github.khushulabs.engine",
];

test("flags app-domain words, spellings, accents, invisible characters and native scripts", () => {
  for (const s of MUST_FAIL) assert.notDeepEqual(findWords(s), [], `should flag: ${JSON.stringify(s)}`);
});

test("does not flag neutral words that contain short names", () => {
  for (const s of MUST_PASS) assert.deepEqual(findWords(s), [], `should pass: ${s}`);
});

const script = new URL("./check-engine-boundary.mjs", import.meta.url).pathname;
const HEADER = "// SPDX-License-Identifier: Apache-2.0\n";

function repo() {
  const root = mkdtempSync(join(tmpdir(), "kh-boundary-selftest-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  mkdirSync(join(root, "eng/src"), { recursive: true });
  writeFileSync(join(root, "eng/src/ok.ts"), `${HEADER}export const finishAt = 1;\n`);
  const run = (dir = "eng") => execFileSync("node", [script, dir], { cwd: root, encoding: "utf8" });
  const fails = (pattern) => assert.throws(() => run(), (e) => pattern.test(e.stdout), `expected ${pattern}`);
  return { root, git, run, fails, done: () => rmSync(root, { recursive: true, force: true }) };
}

test("passes a clean tree", () => {
  const r = repo();
  assert.match(r.run(), /D42 boundary OK: 1 files/);
  r.done();
});

test("fails when it finds no files", () => {
  const r = repo();
  assert.throws(() => r.run("does-not-exist"), (e) => /no files found in does-not-exist/.test(e.stdout));
  r.done();
});

test("checks file and folder names", () => {
  const r = repo();
  writeFileSync(join(r.root, "eng/src/MasjidFence.kt"), `${HEADER}class Fence\n`);
  r.fails(/file name contains "Masjid"/);
  r.done();
});

test("checks contents and reports file and line for GitHub annotations", () => {
  const r = repo();
  writeFileSync(join(r.root, "eng/src/api.ts"), `${HEADER}export function setMasjidFences() {}\n`);
  r.fails(/::error file=eng\/src\/api\.ts,line=2::.*contains "Masjid"/);
  r.done();
});

test("checks tracked build/ folders but skips gitignored build output", () => {
  const r = repo();
  writeFileSync(join(r.root, ".gitignore"), "build/\n");
  mkdirSync(join(r.root, "eng/android/build"), { recursive: true });
  writeFileSync(join(r.root, "eng/android/build/out.ts"), "setMasjidFences\n");
  assert.match(r.run(), /D42 boundary OK/); // ignored output is skipped
  mkdirSync(join(r.root, "eng/src/build"), { recursive: true });
  writeFileSync(join(r.root, "eng/src/build/gen.ts"), `${HEADER}setMasjidFences\n`);
  r.git("add", "-f", "eng/src/build/gen.ts"); // tracked source in a build/ folder
  r.fails(/eng\/src\/build\/gen\.ts:2: contains "Masjid"/);
  r.done();
});

test("decodes UTF-16 files and rejects other files with NUL bytes", () => {
  const r = repo();
  writeFileSync(join(r.root, "eng/src/strings.xml"), Buffer.from(`\uFEFF<!-- SPDX-License-Identifier: Apache-2.0 -->\n<s>Jamat</s>\n`, "utf16le"));
  r.fails(/strings\.xml:2: contains "Jamat"/);
  r.done();
  const r2 = repo();
  writeFileSync(join(r2.root, "eng/src/blob.txt"), Buffer.from([0x61, 0x00, 0x62]));
  r2.fails(/NUL bytes/);
  r2.done();
});

test("checks native-script resource files", () => {
  const r = repo();
  mkdirSync(join(r.root, "eng/res/values-bn"), { recursive: true });
  writeFileSync(join(r.root, "eng/res/values-bn/strings.xml"), "<!-- SPDX-License-Identifier: Apache-2.0 -->\n<s>\u09A8\u09BE\u09AE\u09BE\u099C</s>\n");
  r.fails(/values-bn\/strings\.xml:2: contains/);
  r.done();
});

test("requires the Apache-2.0 SPDX header on source files", () => {
  const r = repo();
  writeFileSync(join(r.root, "eng/src/nohdr.kt"), "class Fence\n");
  r.fails(/nohdr\.kt:1: missing "SPDX-License-Identifier: Apache-2.0" header/);
  r.done();
});
