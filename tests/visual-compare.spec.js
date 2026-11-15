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
  const linkAllowlist = new Set();

  // Allow the populate script to get ALL failures (including suppressed ones) for
  // location discovery — set IGNORE_KNOWN_DIFFERENCES=1 to bypass loading.
  if (process.env.IGNORE_KNOWN_DIFFERENCES === "1") return { textAllowlist, colorAllowlist, linkAllowlist };

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    for (const raw of fs.readFileSync(filePath, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("Link ")) {
        linkAllowlist.add(line);       // link failure message (first line only)
      } else if (line.includes(" → ")) {
        textAllowlist.add(line);       // old format: "Original → Cleaned"
      } else if (line.includes("color mismatch:") || line.includes("should appear with non-black color in clean")) {
        colorAllowlist.add(line);      // color failure message (first line only)
      } else {
        textAllowlist.add(line);       // new format: plain original text (suppress any cleaning of it)
      }
    }
    break; // use the first file found
  }

  return { textAllowlist, colorAllowlist, linkAllowlist };
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

/**
 * Collect every <a href> as { text, href }.  Uses getAttribute (not a.href) so
 * the raw source value is compared - under file:// the a.href property resolves
 * to an absolute local path, hiding live-site vs relative differences.
 *
 * @param {import("@playwright/test").Page} page
 */
async function collectLinks(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("a[href]")].map((a) => ({
      text: (a.textContent ?? "").replace(/[\s\xA0]+/g, " ").trim(),
      href: (a.getAttribute("href") ?? "").trim(),
      // Image/media links have no text but are still visible.
      hasMedia: !!a.querySelector("img, svg, object, embed, video"),
    }))
  );
}

// Every id/name in the page - targets for "#fragment" links.
async function collectAnchorTargets(page) {
  return page.evaluate(() => [
    ...[...document.querySelectorAll("[id]")].map((el) => el.id),
    ...[...document.querySelectorAll("[name]")].map((el) => el.getAttribute("name") ?? ""),
  ]);
}

// The live site's own absolute prefix.  shortenSaccPropLinks
// (src/cleanup/wordCleanup.js) rewrites some of these to the bare relative
// filename, so strip it here to compare both forms as equal.
const LSU_PREFIX_RE = /^https?:\/\/www\.museum\.lsu\.edu\/(?:~|%7E)Remsen\//i;

function normalizeHref(href) {
  return href.replace(LSU_PREFIX_RE, "").replace(/^https?:\/\//i, "//").toLowerCase();
}

// Links that are checkable offline: fragments and relative paths.
// Absolute URLs (including the live LSU site) are external and skipped.
function isLocalHref(href) {
  return !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
}

// Lowercased basename -> path for every .htm/.html file under root.  The live
// site is flat, so a bare "SACCprop979.htm" link can only be resolved by name
// against wherever that file sits locally (baseline/, proposals/, ...).
function indexHtmlFiles(root) {
  const index = new Map();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.html?$/i.test(entry.name)) index.set(entry.name.toLowerCase(), full);
    }
  };
  walk(root);
  return index;
}

// Pairs dirty links with clean links by a longest-common-subsequence over their
// normalized targets - the same alignment a line diff uses.  Returns, for each
// dirty index, the matched clean index or -1.  Counting this way means losing
// one of nine identical "proposal" -> SACCprop979.htm links leaves exactly one
// dirty link unmatched.
function alignLinks(dirtyLinks, cleanLinks) {
  const a = dirtyLinks.map((l) => normalizeHref(l.href));
  const b = cleanLinks.map((l) => normalizeHref(l.href));
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const matchOf = new Array(n).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { matchOf[i] = j; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return matchOf;
}

// 1-indexed source line of each link, found by scanning forward for its href
// value in document order.  Link text can't be used - "proposal" is on
// hundreds of lines - but Word only wraps source lines at spaces, and an href has none.
// Tracks a character offset (not just a line) so two links on one line both
// resolve, and repeats of the same href resolve to successive occurrences.
function hrefSourceLines(rawLines, links) {
  const raw = rawLines.join("\n");
  let pos = 0, line = 1;
  return links.map(({ href }) => {
    if (!href) return null;
    const candidates = [`"${ href }"`, `'${ href }'`]
      .map((q) => raw.indexOf(q, pos))
      .filter((at) => at !== -1);
    if (!candidates.length) return null;
    const at = Math.min(...candidates);
    for (let k = pos; k < at; k++) if (raw.charCodeAt(k) === 10) line++;
    pos = at + 1;
    return line;
  });
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

// Rules 1 + 2: every dirty link survives into clean, pointing at the same target.
// Links are aligned in document order (see alignLinks) rather than looked up by
// text: most proposal links share the text "proposal", and the same target is
// often linked many times, so only position distinguishes one copy from another.
test("dirty links are preserved in clean", async ({ page }) => {
  const { originalPath, cleanedPath } = resolvePaths(testFile);
  const dirtyRaw = readRawLines(originalPath);
  const cleanRaw = readRawLines(cleanedPath);
  const { linkAllowlist } = loadKnownDifferences(testFile);

  await loadLocalHtml(page, originalPath);
  const dirtyLinks = await collectLinks(page);

  await loadLocalHtml(page, cleanedPath);
  const cleanLinks = await collectLinks(page);

  const matchOf = alignLinks(dirtyLinks, cleanLinks);
  const cleanMatched = new Set(matchOf.filter((j) => j !== -1));
  const dirtyLines = hrefSourceLines(dirtyRaw, dirtyLinks);
  const cleanLines = hrefSourceLines(cleanRaw, cleanLinks);

  // A dirty fragment of a hyperlink Word split in two: its neighbor has the same
  // target and was matched to a clean link whose text is longer and contains both.
  const isMergedFragment = (i) => [i - 1, i + 1].some((k) => {
    const j = matchOf[k];
    if (j === undefined || j === -1) return false;
    if (normalizeHref(dirtyLinks[k].href) !== normalizeHref(dirtyLinks[i].href)) return false;
    const merged = cleanLinks[j].text;
    return merged !== dirtyLinks[k].text && merged.includes(dirtyLinks[i].text);
  });

  const failures = [];
  const paired = new Set();

  for (let i = 0; i < dirtyLinks.length; i++) {
    if (matchOf[i] !== -1 || isMergedFragment(i)) continue;
    const { text, href, hasMedia } = dirtyLinks[i];

    // Invisible link - Word leaves these wrapped around a bare &nbsp; in
    // otherwise empty paragraphs, which cleanup rightly removes.
    if (!text && !hasMedia) continue;

    // Bounds of the clean gap this dirty link fell into.
    let lo = -1, hi = cleanLinks.length;
    for (let k = i - 1; k >= 0; k--) if (matchOf[k] !== -1) { lo = matchOf[k]; break; }
    for (let k = i + 1; k < dirtyLinks.length; k++) if (matchOf[k] !== -1) { hi = matchOf[k]; break; }

    let retargetTo = -1;
    for (let j = lo + 1; j < hi; j++) {
      if (!cleanMatched.has(j) && !paired.has(j) && cleanLinks[j].text === text) { retargetTo = j; break; }
    }

    const label = text ? `"${ text.slice(0, 60) }"` : "(no text)";
    let firstLine, cLine;
    if (retargetTo !== -1) {
      paired.add(retargetTo);
      firstLine = `Link retargeted: ${ label } dirty=${ href }  clean=${ cleanLinks[retargetTo].href }`;
      cLine = cleanLines[retargetTo];
    } else {
      firstLine = `Link lost: ${ label } -> ${ href }`;
      cLine = lo === -1 ? null : cleanLines[lo];
    }
    if (linkAllowlist.has(firstLine)) continue;

    const cLabel = retargetTo !== -1 ? `clean L${ cLine ?? "?" }` : `clean after L${ cLine ?? "?" }`;
    failures.push(`${ firstLine }\n  dirty L${ dirtyLines[i] ?? "?" }  ${ cLabel }`);
  }

  if (failures.length) {
    const err = new Error("\n\n" + failures.join("\n\n"));
    err.stack = `Error: ${ err.message }`;
    throw err;
  }
});

// Rule 3: every local link in clean resolves.  "#frag" needs a matching id/name;
// a bare filename must exist somewhere under clean/.  A target that was
// downloaded (exists under dirty/) but never cleaned is a failure; one that was
// never downloaded at all is only listed as an annotation in the report, since
// proposals are fetched in ranges and most aren't local yet.
test("clean links resolve", async ({ page }) => {
  const { cleanedPath } = resolvePaths(testFile);
  const cleanRaw = readRawLines(cleanedPath);
  const { linkAllowlist } = loadKnownDifferences(testFile);

  await loadLocalHtml(page, cleanedPath);
  const cleanLinks = await collectLinks(page);
  const anchorTargets = new Set(await collectAnchorTargets(page));

  const cleanIndex = indexHtmlFiles(path.join(__dirname, "../clean"));
  const dirtyIndex = indexHtmlFiles(path.join(__dirname, "../dirty"));

  const failures = [];
  const notDownloaded = new Set();
  const seen = new Set();
  let cleanFromLine = 0;

  for (const { text, href } of cleanLinks) {
    if (!href || !isLocalHref(href) || seen.has(href)) continue;
    seen.add(href);

    const [filePart, fragment = ""] = href.split("#");
    let file = "";
    try { file = decodeURIComponent(filePart.split("?")[0]); } catch { file = filePart; }

    let problem = "";
    if (!file) {
      if (fragment && !anchorTargets.has(fragment)) problem = "no matching id on this page";
    } else {
      const targetPath = file.includes("/")
        ? path.resolve(path.dirname(cleanedPath), file)
        : cleanIndex.get(file.toLowerCase());

      if (!targetPath || !fs.existsSync(targetPath)) {
        if (file.includes("/") || dirtyIndex.has(file.toLowerCase())) {
          problem = file.includes("/") ? "file not found" : "downloaded but not cleaned";
        } else {
          notDownloaded.add(href);
          continue;
        }
      } else if (fragment && /\.html?$/i.test(targetPath)) {
        const targetHtml = fs.readFileSync(targetPath, "utf8");
        const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`(id|name)\\s*=\\s*["']?${ escaped }["'\\s>]`, "i").test(targetHtml)) {
          problem = `no id "${ fragment }" in ${ path.basename(targetPath) }`;
        }
      }
    }
    if (!problem) continue;

    const firstLine = `Link broken: "${ text.slice(0, 60) }" -> ${ href } (${ problem })`;
    if (linkAllowlist.has(firstLine)) continue;

    const cLine = findSourceLine(cleanRaw, text, cleanFromLine);
    if (cLine) cleanFromLine = cLine - 1;
    failures.push(`${ firstLine }\n  clean L${ cLine ?? "?" }`);
  }

  if (notDownloaded.size) {
    test.info().annotations.push({
      type: `${ notDownloaded.size } link target(s) not downloaded`,
      description: [...notDownloaded].sort().join(", "),
    });
  }

  if (failures.length) {
    const err = new Error("\n\n" + failures.join("\n\n"));
    err.stack = `Error: ${ err.message }`;
    throw err;
  }
});

}); // test.describe

} // for testFile
