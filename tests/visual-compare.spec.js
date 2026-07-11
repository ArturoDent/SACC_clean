// @ts-nocheck  — parameter types inside page.evaluate() are browser-context
//               closures; the TS language service cannot infer them in plain JS.
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadLocalHtml(page, filePath) {
  await page.goto("file://" + path.resolve(filePath));
  await page.waitForLoadState("domcontentloaded");
}

// Searches rawLines for the first line at or after fromLine that contains
// the text (or a progressively shorter prefix of it — 40 → 20 → 10 chars).
// Short prefixes handle content that spans multiple HTML elements so the full
// rendered text never appears contiguously on a single source line.
// The caller advances fromLine to the returned index so repeated/ambiguous
// text is anchored by its position relative to the previous match.
function findSourceLine(rawLines, text, fromLine = 0) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const len of [40, 20, 10]) {
    const query = trimmed.slice(0, len).toLowerCase();
    if (query.length < 4) break;
    for (let i = fromLine; i < rawLines.length; i++) {
      if (rawLines[i].toLowerCase().includes(query)) return i + 1; // 1-indexed
    }
  }
  return null;
}

function readRawLines(filePath) {
  return fs.readFileSync(path.resolve(filePath), "utf8").split("\n");
}

// Loads the known-differences file for a test stem and returns two sets:
//   textAllowlist  — "original → cleaned" pairs (for text comparison mismatches)
//   colorAllowlist — verbatim first lines of color failure messages
// File location: tests/known-differences/baseline/SACCn.txt  (baseline files)
//                tests/known-differences/proposals/<stem>.txt (proposals)
//                tests/known-differences/<stem>.txt           (everything else)
function loadKnownDifferences(testFile) {
  const dirs = /^SACC\d+$/i.test(testFile) ? ["baseline"]
             : /^(SACC|ACC)prop/i.test(testFile) ? ["proposals"]
             : [];
  const candidates = [
    ...dirs.map(d => path.join(__dirname, "known-differences", d, `${ testFile }.txt`)),
    path.join(__dirname, "known-differences", `${ testFile }.txt`),
  ];

  const textAllowlist = new Set();
  const colorAllowlist = new Set();

  // Allow the populate script to get ALL failures (including suppressed ones) for
  // location discovery — set IGNORE_KNOWN_DIFFERENCES=1 to bypass loading.
  if (process.env.IGNORE_KNOWN_DIFFERENCES === "1") return { textAllowlist, colorAllowlist };

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    for (const raw of fs.readFileSync(filePath, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.includes(" → ")) {
        textAllowlist.add(line);       // old format: "Original → Cleaned"
      } else if (line.includes("color mismatch:") || line.includes("should appear with non-black color in clean")) {
        colorAllowlist.add(line);      // color failure message (first line only)
      } else {
        textAllowlist.add(line);       // new format: plain original text (suppress any cleaning of it)
      }
    }
    break; // use the first file found
  }

  return { textAllowlist, colorAllowlist };
}

expect.extend({
  toMatchClean(received, expected, label = "") {
    if (received === expected) return { pass: true, message: () => "" };
    return {
      pass: false,
      message: () => [
        label,
        `  Original: "${ expected }"`,
        `  Cleaned:  "${ received }"`,
      ].filter(Boolean).join("\n"),
    };
  },
  // Shows only the provided message on failure — no Expected/Received boilerplate.
  toBeTrue(received, message = "") {
    if (received) return { pass: true, message: () => "" };
    return { pass: false, message: () => message };
  },
});

// Part 1 is "SACCBaseline.htm" (no number); parts 2-11 are "SACCBaselineNN.htm"
// (zero-padded) — matching the live site's own naming, same as src/index.js.
const baselineFileName = (n) => n === 1 ? "SACCBaseline.htm" : `SACCBaseline${ String(n).padStart(2, "0") }.htm`;

// Resolves dirty/clean paths for a stem regardless of which category it belongs
// to: baseline SACC list pages ("SACCn" -> dirty/clean/baseline/SACCBaselineNN.htm),
// proposals (dirty/proposals/, .htm, clean output nested under clean/proposals/),
// or files that deliberately stay directly in dirty/ (e.g. SACCCountryLists.htm).
function resolvePaths(testFile) {
  const baselineMatch = testFile.match(/^SACC(\d+)$/i);
  if (baselineMatch) {
    const fileName = baselineFileName(Number(baselineMatch[1]));
    return {
      originalPath: path.join(__dirname, `../dirty/baseline/${ fileName }`),
      cleanedPath: path.join(__dirname, `../clean/baseline/${ fileName }`),
    };
  }

  const proposalsDirty = path.join(__dirname, `../dirty/proposals/${ testFile }.htm`);
  if (fs.existsSync(proposalsDirty)) {
    return { originalPath: proposalsDirty, cleanedPath: path.join(__dirname, `../clean/proposals/${ testFile }.htm`) };
  }

  return {
    originalPath: path.join(__dirname, `../dirty/${ testFile }.htm`),
    cleanedPath: path.join(__dirname, `../clean/${ testFile }.htm`),
  };
}

function normalizeText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\xA0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n_+\n/g, "\n")
    .replace(/\n+/g, "\n")
    .trim();
}

/**
 * Walk every text node and collect { text, color } for text that has a
 * non-black computed color.  Whitespace is collapsed.  Exact {text,color}
 * pairs are deduplicated.
 *
 * @param {import("@playwright/test").Page} page
 * @param {boolean} inlineOnly  When true, only include text whose nearest
 *   ancestor carries an explicit inline style="color:…".  Use for the dirty
 *   Word export to ignore colors from Word's embedded <style> sheet.
 *   Also skips text inside <a> elements (hyperlink color = UI design).
 */
async function collectColoredItems(page, inlineOnly = false) {
  return page.evaluate((inlineOnly) => {
    const BLACK = "rgb(0, 0, 0)";
    const items = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    function hasInlineColorAncestor(el) {
      let node = el;
      while (node && node !== document.body) {
        if (node.style && node.style.color) return true;
        node = node.parentElement;
      }
      return false;
    }

    function isInsideLink(el) {
      let node = el;
      while (node && node !== document.body) {
        if (node.tagName === "A") return true;
        node = node.parentElement;
      }
      return false;
    }

    while (walker.nextNode()) {
      const text = (walker.currentNode.nodeValue ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const parent = walker.currentNode.parentElement;
      if (!parent) continue;

      if (inlineOnly && (!hasInlineColorAncestor(parent) || isInsideLink(parent))) continue;

      // Skip single-char fragments and repeated-single-char separators
      // (&&&& / ____ → <hr> in clean).
      if (text.length < 2 || /^(.)\1+$/.test(text)) continue;

      // For dirty: skip very long spans — Word fragments long colored runs into
      // many spans that clean merges into one element, so exact matching fails.
      if (inlineOnly && text.length > 100) continue;

      const color = getComputedStyle(parent).color;
      if (color === BLACK) continue;
      const key = `${ color }|${ text }`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ text, color });
    }

    return items;
  }, inlineOnly);
}

// TEST_FILE names the file stem(s) used for both dirty/ and clean/.
// Run with:  $env:TEST_FILE="SACC2,SACC3"; npx playwright test   (PowerShell)
//            TEST_FILE=SACC2,SACC3 npx playwright test           (bash)
// Single file: TEST_FILE=SACC4 npx playwright test
const testFiles = (process.env.TEST_FILE ?? "clean1").split(",");

for (const testFile of testFiles) {

test.describe(testFile, () => {

test("colored text has matching color in clean", async ({ page }) => {
  const { originalPath, cleanedPath } = resolvePaths(testFile);
  const dirtyRaw = readRawLines(originalPath);
  const cleanRaw = readRawLines(cleanedPath);
  const { colorAllowlist } = loadKnownDifferences(testFile);

  await loadLocalHtml(page, originalPath);
  const dirtyItems = await collectColoredItems(page, true);

  await loadLocalHtml(page, cleanedPath);
  const cleanItems = await collectColoredItems(page, false);

  // Build a multi-map: text → [color, …].
  // For clean items starting with "* " (the pipeline merges a standalone "*"
  // bullet into the following text), also register the stripped form.
  const cleanMap = new Map();
  for (const { text, color } of cleanItems) {
    for (const key of new Set([text, text.replace(/^\*\s+/, "")])) {
      if (!cleanMap.has(key)) cleanMap.set(key, []);
      cleanMap.get(key).push(color);
    }
  }

  const failures = [];
  let dirtyFromLine = 0;
  let cleanFromLine = 0;

  for (const { text, color } of dirtyItems) {
    const label = `"${ text.slice(0, 60) }"`;

    // Primary lookup: exact text match.
    let matches = cleanMap.get(text);

    // Fallback: dirty fragments that clean merges into a longer element.
    if (!matches) {
      const colors = cleanItems
        .filter((item) => item.text.includes(text))
        .map((item) => item.color);
      if (colors.length > 0) matches = colors;
    }

    if (!matches || !matches.includes(color)) {
      const firstLine = !matches
        ? `${ label } should appear with non-black color in clean`
        : `${ label } color mismatch: dirty=${ color }  clean=${ matches.join(", ") }`;
      if (colorAllowlist.has(firstLine)) continue;

      const dLine = findSourceLine(dirtyRaw, text, dirtyFromLine);
      const cLine = findSourceLine(cleanRaw, text, cleanFromLine);
      if (dLine) dirtyFromLine = dLine - 1;
      if (cLine) cleanFromLine = cLine - 1;
      failures.push(`${ firstLine }\n  dirty L${ dLine ?? "?" }  clean L${ cLine ?? "?" }`);
    }
  }

  if (failures.length) {
    const err = new Error("\n\n" + failures.join("\n\n"));
    err.stack = `Error: ${ err.message }`;
    throw err;
  }
});

test("dirty and clean contain identical visible text", async ({ page }) => {
  const { originalPath, cleanedPath } = resolvePaths(testFile);
  const dirtyRaw = readRawLines(originalPath);
  const cleanRaw = readRawLines(cleanedPath);
  const { textAllowlist } = loadKnownDifferences(testFile);

  await loadLocalHtml(page, originalPath);
  const dirtyText = normalizeText(await page.innerText("body"));

  await loadLocalHtml(page, cleanedPath);
  const cleanText = normalizeText(await page.innerText("body"));

  const dirtyRendered = dirtyText.split("\n");
  const cleanRendered = cleanText.split("\n");
  const maxLen = Math.max(dirtyRendered.length, cleanRendered.length);

  const failures = [];
  let dirtyFromLine = 0;
  let cleanFromLine = 0;

  for (let i = 0; i < maxLen; i++) {
    const d = dirtyRendered[i];
    const c = cleanRendered[i];
    if (d === c) continue;
    if (d !== undefined && c !== undefined &&
        (textAllowlist.has(`${ d } → ${ c }`) || textAllowlist.has(d))) continue;

    const dLine = findSourceLine(dirtyRaw, d ?? "", dirtyFromLine);
    const cLine = findSourceLine(cleanRaw, c ?? "", cleanFromLine);
    if (dLine) dirtyFromLine = dLine - 1;
    if (cLine) cleanFromLine = cLine - 1;

    failures.push([
      `Rendered line ${ i + 1 }  dirty L${ dLine ?? "?" }  clean L${ cLine ?? "?" }`,
      `  Original: "${ d ?? "" }"`,
      `  Cleaned:  "${ c ?? "" }"`,
    ].join("\n"));
  }

  if (failures.length) {
    const err = new Error("\n\n" + failures.join("\n\n"));
    err.stack = `Error: ${ err.message }`;
    throw err;
  }
});

}); // test.describe

} // for testFile
