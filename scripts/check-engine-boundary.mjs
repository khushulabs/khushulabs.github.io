// SPDX-License-Identifier: GPL-3.0-or-later
// D42 engine boundary check: modules/khushu-engine must stay free of
// app-domain words, in file contents AND in file and folder names. It also
// checks that every engine source file carries an Apache-2.0 SPDX header.
//
// - Text is normalised first (NFKD, then combining marks and invisible format
//   characters removed), so accents (jamā'at, Ṣalāh), fullwidth letters,
//   dotted capitals (MASJİD), zero-width spaces and soft hyphens don't hide a
//   word. The word lists below go through the same normalisation.
// - Long words match as case-insensitive substrings (no word boundary), so
//   `setMasjidFences` is caught. Apostrophes may be ' ‘ ’ ʼ ʾ ʿ or a hyphen.
// - Short words match only as whole tokens, after splitting on camelCase,
//   snake_case, digits and punctuation, and also with a trailing plural "s"
//   removed. So `finishAt`, `publishable` and `spray` pass, `EIDs` fails.
// - Native-script forms (Bengali, Hindi, Urdu/Arabic) of the core words are
//   matched as substrings, because those are the app's launch languages.
// - `khushu` is allowed on purpose: it is the engine's current name (D13
//   expects a later rename for the standalone engine).
// - Files come from git: tracked files plus untracked files that are not
//   gitignored. Nothing else is skipped, so a tracked `build/` source folder
//   is checked; ignored build output and node_modules are not.
// - It fails if it finds no files at all (for example after a rename or a
//   typo in the path), so the gate can't pass silently.
// - Limits: it is a line check. A word split across lines or string
//   concatenations ("mas" + "jid") is not caught; review is the backstop.
//   UTF-16 files are decoded when they have a BOM; any other file containing
//   NUL bytes fails unless it has a known binary extension.
//
// Usage: node scripts/check-engine-boundary.mjs [dir]   (default: modules/khushu-engine)
// Needs only Node and git (no install).

import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";

export const LONG_WORDS = [
  // Latin script, including common transliterations
  "prayer", "salah", "salaah", "salat", "namaz", "namaaz", "namaj", "nomaz",
  "masjid", "masjed", "mosque",
  "jamat", "jamaat", "jama'at", "jamaah", "jammat",
  "adhan", "adhaan", "azan", "azaan",
  "iqama", "zuhr", "dhuhr", "zohr", "maghrib", "fajr",
  "jumu'ah", "jumuah", "jummah", "jumma",
  "qibla", "muezzin", "khutba", "quran", "ramadan", "tarawih", "taraweeh",
  "tahajjud", "iftar", "suhoor", "sehri", "islam", "muslim",
  // Bengali
  "মসজিদ", "নামাজ", "নামায", "সালাত", "জামাত", "জামায়াত", "আজান",
  // Hindi (Devanagari)
  "मस्जिद", "नमाज़", "नमाज", "सलात", "जमात", "जमाअत", "अज़ान", "अजान",
  // Urdu / Arabic
  "مسجد", "نماز", "صلاة", "صلوة", "جماعت", "جماعة", "اذان", "أذان", "آذان",
];

export const SHORT_WORDS = [
  "asr", "asar", "isha", "esha", "isya", "eid", "imam", "athan",
  "pray", "prays", "prayed", "praying", "juma", "maghreb", "witr", "wudu", "allah",
];

/** NFKD, then drop combining marks and invisible format characters. */
export function normalize(text) {
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "");
}

const APOSTROPHE = "['\u2018\u2019\u02BC\u02BE\u02BF-]?";
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LONG_RE = new RegExp(
  LONG_WORDS.map((w) => normalize(w).split("'").map(escape).join(APOSTROPHE)).join("|"),
  "iu",
);
const SHORT = new Set(SHORT_WORDS);

/** Splits text into identifier-ish tokens, breaking camelCase and acronyms. */
export function tokens(text) {
  return text.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g) ?? [];
}

const isShort = (w) => {
  const lower = w.toLowerCase();
  return SHORT.has(lower) || (lower.endsWith("s") && SHORT.has(lower.slice(0, -1)));
};

/** Returns the forbidden words found in one string (a line or a path). */
export function findWords(raw) {
  const text = normalize(raw);
  const found = [];
  const long = text.match(LONG_RE);
  if (long) found.push(long[0]);
  // Whole alphanumeric words (catches "EIDs") and camelCase pieces (catches "ishaStart").
  for (const w of [...(text.match(/[A-Za-z0-9]+/g) ?? []), ...tokens(text)]) {
    if (isShort(w)) found.push(w);
  }
  return [...new Set(found)];
}

const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".jar", ".aar", ".so", ".ttf", ".otf"]);
const SPDX_EXT = new Set([".kt", ".kts", ".java", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".xml", ".gradle", ".md"]);
const SPDX = "SPDX-License-Identifier: Apache-2.0";

export function listFiles(dir) {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", dir], {
    encoding: "utf8",
  });
  return [...new Set(out.split("\0").filter((f) => f !== ""))];
}

/** Decodes a file, or returns null for a known binary file. Throws on unknown binary. */
function decode(file, buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  if (buf.includes(0)) {
    if (BINARY_EXT.has(extname(file).toLowerCase())) return null;
    throw new Error("contains NUL bytes but is not a known binary type (save it as UTF-8)");
  }
  return buf.toString("utf8");
}

/**
 * Checks every file under dir; returns { files, problems } where problems are
 * { file, line?, message } objects.
 */
export function checkDir(dir, { spdx = true } = {}) {
  const files = listFiles(dir);
  const problems = [];
  if (files.length === 0) {
    problems.push({ file: dir, message: `no files found in ${dir}; the check would pass while checking nothing` });
    return { files, problems };
  }
  for (const file of files) {
    for (const w of findWords(file)) problems.push({ file, message: `file name contains "${w}"` });
    let text;
    try {
      text = decode(file, readFileSync(file));
    } catch (e) {
      if (e && e.code === "ENOENT") continue; // deleted in the working tree
      problems.push({ file, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (text === null) continue;
    text.split("\n").forEach((line, i) => {
      for (const w of findWords(line)) problems.push({ file, line: i + 1, message: `contains "${w}"` });
    });
    if (spdx && SPDX_EXT.has(extname(file).toLowerCase())) {
      const head = text.split("\n").slice(0, 5).join("\n");
      if (!head.includes(SPDX)) problems.push({ file, line: 1, message: `missing "${SPDX}" header` });
    }
  }
  return { files, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dir = process.argv[2] ?? "modules/khushu-engine";
  const { files, problems } = checkDir(dir);
  if (problems.length > 0) {
    for (const p of problems) {
      const where = p.line ? `file=${p.file},line=${p.line}` : `file=${p.file}`;
      console.log(`::error ${where}::${p.file}${p.line ? `:${p.line}` : ""}: ${p.message}`);
    }
    console.log(`\n${problems.length} problem(s) in ${dir}. The engine must stay app-agnostic (D42).`);
    process.exit(1);
  }
  console.log(`D42 boundary OK: ${files.length} files in ${dir}, no forbidden words, SPDX headers present.`);
}
