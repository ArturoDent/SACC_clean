// node spreadsheets/scripts/verifySpeciesOrder.js [path/to/file.xlsx] [--strict]
//
// Verifies that the species in the SACCListByCountry spreadsheet appear in the
// same order as the .familySpeciesList entries in clean/baseline/*.htm.
//
// With no argument it uses the most recent .xlsx in spreadsheets/. Prints a
// summary to the console and writes the full findings to
// spreadsheets/species-order-report.md.
//
// --strict exits with code 1 when any difference is found (for CI use);
// by default the script always exits 0.


// Alignment beats index - by - index comparison.A naive xlsx[i] vs html[i] loop reported
// 15 mismatches; the LIS alignment reports 6 - the minimum set of species you'd actually 
// have to move.The difference is that a swap of A and B shows up as two mismatches in a 
// positional compare but only one displacement in an alignment, and a single insertion 
// would show as ~3000 vs. 1.

// Uniqueness enabled the cheap algorithm.Because scientific names are unique on both sides,
//   each HTML entry maps to one spreadsheet index, reducing the problem to a
// longest - increasing - subsequence over integers - O(n log n) via patience sorting 
// - instead of an O(n^2) edit - distance diff over 3513x3513 cells.

//   Node's own \uXXXX escapes got flattened on write. The literal U+00A0 that landed in 
// normalizeText's regex was visually identical to a space, which is exactly the class of 
// bug the pipeline's normalizeText exists to fix. Worth checking with a code - point scan 
// rather than by eye.

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {JSDOM} from "jsdom";
import {readSheetRows} from "./readXlsx.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SPREADSHEET_DIR = path.join(ROOT, "spreadsheets");
const BASELINE_DIR = path.join(ROOT, "clean", "baseline");
const REPORT_PATH = path.join(SPREADSHEET_DIR, "species-order-report.md");

const BASELINE_FILES = [
  "SACCBaseline.htm",
  ...Array.from({length: 10}, (_, i) => `SACCBaseline${String(i + 2).padStart(2, "0")}.htm`),
];

const FIRST_DATA_ROW = 4;        // rows 1-3 are titles and column headings
const SCIENTIFIC_COLUMN = "E";
const ENGLISH_COLUMN = "F";
const CONSOLE_LIMIT = 20;        // findings shown per section in the terminal

// ---------------------------------------------------------------- normalizing

const normalizeText = (value) =>
  value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

// The HTML writes "Tschudi's Nightjar" with a U+2019 apostrophe where the
// spreadsheet uses a plain ASCII one. Folding the typographic forms keeps
// around 20 purely cosmetic differences out of the report.
const foldPunctuation = (value) =>
  value
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-");

// Status codes live in their own spreadsheet columns, but are appended to the
// common name in the HTML, e.g. "Alder Flycatcher (NB)".
const STATUS_SUFFIX = /\s*\((?:V\??|IN|NB|EX\??)(?:\s*,\s*(?:V\??|IN|NB|EX\??))*\)\s*$/i;

const englishKey = (value) =>
  normalizeText(foldPunctuation(value).replace(STATUS_SUFFIX, "")).toLowerCase();

const scientificKey = (value) => normalizeText(foldPunctuation(value)).toLowerCase();

// ---------------------------------------------------------------- extraction

const findSpreadsheet = () => {
  const explicit = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (explicit) return path.resolve(explicit);

  const candidates = fs.readdirSync(SPREADSHEET_DIR)

    // So without the filter, the script would pick the lock file every single time the 
    // spreadsheet happened to be open in Excel.And an owner file isn't a workbook at all
    // - it's a small binary blob holding a username, not a ZIP archive.readSheetRows would
    // scan it for a central directory, find none, and throw.

    .filter((name) => name.toLowerCase().endsWith(".xlsx") && !name.startsWith("~$"))
    .sort();
  if (!candidates.length) throw new Error(`No .xlsx found in ${SPREADSHEET_DIR}`);
  return path.join(SPREADSHEET_DIR, candidates.at(-1));
};

// Keep only rows carrying both a scientific and an English name. That excludes
// the trailing legend block ("Residents (extant) = X*" etc.), which fills the
// scientific-name column but never the English one.
const readSpreadsheetSpecies = (xlsxPath) => {
  const rows = readSheetRows(xlsxPath);
  const species = [];

  for (const rowNumber of [...rows.keys()].sort((a, b) => a - b)) {
    if (rowNumber < FIRST_DATA_ROW) continue;
    const cells = rows.get(rowNumber);
    const scientific = normalizeText(cells[SCIENTIFIC_COLUMN] ?? "");
    const english = normalizeText(cells[ENGLISH_COLUMN] ?? "");
    if (!scientific || !english) continue;
    species.push({index: species.length, row: rowNumber, scientific, english});
  }

  return species;
};

// Byte offset -> 1-based line number, so the report can link to a species.
const lineNumberAt = (lineStarts, offset) => {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
};

const escapeHtml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const readBaselineSpecies = () => {
  const species = [];

  for (const file of BASELINE_FILES) {
    const filePath = path.join(BASELINE_DIR, file);
    const source = fs.readFileSync(filePath, "utf8");
    const lineStarts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === "\n") lineStarts.push(i + 1);

    const {document} = new JSDOM(source).window;
    // A species row is the only kind of list item with a direct-child <i>;
    // order/family/subfamily rows carry a class instead.
    let searchFrom = 0;

    for (const li of document.querySelectorAll(".familySpeciesList li")) {
      const italic = li.querySelector(":scope > i");
      if (!italic) continue;

      const scientific = normalizeText(italic.textContent ?? "");
      const english = normalizeText(li.querySelector(":scope > span.commonName")?.textContent ?? "");

      // Locate the source line. The generator emits "<li><i>Name</i>" intact on
      // one line; scanning forward keeps repeated fragments in document order.
      const needle = `<i>${escapeHtml(scientific)}</i>`;
      const found = source.indexOf(needle, searchFrom);
      if (found !== -1) searchFrom = found + needle.length;

      species.push({
        index: species.length,
        file,
        line: found === -1 ? null : lineNumberAt(lineStarts, found),
        scientific,
        english,
      });
    }
  }

  return species;
};

// ---------------------------------------------------------------- comparison

// Patience sorting. Returns the set of positions in `values` that form a
// longest increasing subsequence.
// See explanation below.
const longestIncreasingSubsequence = (values) => {
  const tails = [];
  const previous = new Array(values.length).fill(-1);

  for (let i = 0; i < values.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]] < values[i]) lo = mid + 1; else hi = mid;
    }
    if (lo > 0) previous[i] = tails[lo - 1];
    if (lo === tails.length) tails.push(i); else tails[lo] = i;
  }

  const keep = new Set();
  let cursor = tails.length ? tails.at(-1) : -1;
  while (cursor !== -1) {
    keep.add(cursor);
    cursor = previous[cursor];
  }
  return keep;
};

// Bounded Levenshtein: gives up as soon as the distance exceeds `limit`, which
// is all we need to decide "same name, different spelling".
const withinEditDistance = (a, b, limit) => {
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({length: b.length + 1}, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return false;
    previous = current;
  }

  return previous[b.length] <= limit;
};

// Exported so the alignment can be exercised on synthetic sequences without
// reading the real files.
export const compare = (spreadsheet, baseline) => {
  const byName = new Map();
  for (const entry of spreadsheet) {
    const key = scientificKey(entry.scientific);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(entry);
  }

  const pairs = [];                       // matched, in baseline order
  const unmatchedBaseline = [];
  const claimed = new Set();

  for (const entry of baseline) {
    const candidates = byName.get(scientificKey(entry.scientific)) ?? [];
    const match = candidates.find((candidate) => !claimed.has(candidate.index));
    if (!match) {
      unmatchedBaseline.push(entry);
      continue;
    }
    claimed.add(match.index);
    pairs.push({baseline: entry, spreadsheet: match, spelling: false});
  }

  const unmatchedSpreadsheet = spreadsheet.filter((entry) => !claimed.has(entry.index));

  // A name misspelt on one side would otherwise be reported twice, as a
  // missing species and an unexpected one. Pair those up instead.
  const spellingDifferences = [];
  const stillUnmatchedBaseline = [];

  for (const entry of unmatchedBaseline) {
    const at = unmatchedSpreadsheet.findIndex((candidate) =>
      englishKey(candidate.english) === englishKey(entry.english)
      || withinEditDistance(scientificKey(candidate.scientific), scientificKey(entry.scientific), 2));

    if (at === -1) {
      stillUnmatchedBaseline.push(entry);
      continue;
    }
    const [match] = unmatchedSpreadsheet.splice(at, 1);
    spellingDifferences.push({baseline: entry, spreadsheet: match});
    pairs.push({baseline: entry, spreadsheet: match, spelling: true});
  }

  // Restore baseline order after the fuzzy pass appended its pairs.
  pairs.sort((a, b) => a.baseline.index - b.baseline.index);

  const keep = longestIncreasingSubsequence(pairs.map((pair) => pair.spreadsheet.index));
  const outOfOrder = pairs.filter((_, i) => !keep.has(i));

  const englishMismatches = pairs.filter((pair) =>
    englishKey(pair.baseline.english) !== englishKey(pair.spreadsheet.english));

  return {
    pairs,
    outOfOrder,
    englishMismatches,
    spellingDifferences,
    onlyInBaseline: stillUnmatchedBaseline,
    onlyInSpreadsheet: unmatchedSpreadsheet,
  };
};

// Consecutive displaced species are one disturbance, not several. Group
// findings that sit within a couple of positions of each other so a swap
// reads as a single region.
const groupRegions = (outOfOrder, gap = 2) => {
  const regions = [];
  for (const pair of outOfOrder) {
    const last = regions.at(-1);
    if (last && pair.baseline.index - last.at(-1).baseline.index <= gap) last.push(pair);
    else regions.push([pair]);
  }
  return regions;
};

// ---------------------------------------------------------------- reporting

const baselineLink = ({file, line}) =>
  line === null
    ? `\`${file}\``
    : `[${file}:${line}](../clean/baseline/${file}#L${line})`;

const buildReport = (result, context) => {
  const {pairs, outOfOrder, englishMismatches, spellingDifferences, onlyInBaseline, onlyInSpreadsheet} = result;
  const lines = [];

  lines.push("# Species order: spreadsheet vs. clean baseline", "");
  lines.push(`Generated by \`node spreadsheets/scripts/verifySpeciesOrder.js\` on ${context.generatedAt}.`, "");
  lines.push(`- Spreadsheet: \`${context.spreadsheetName}\` - **${context.spreadsheetCount}** species`);
  lines.push("- Baseline: `clean/baseline/SACCBaseline*.htm` - "
    + `**${context.baselineCount}** species`);
  lines.push(`- Matched by scientific name: **${pairs.length}**`, "");

  lines.push("## Summary", "");
  lines.push("| Check | Findings |");
  lines.push("| --- | --- |");
  lines.push(`| Species out of order | ${outOfOrder.length} |`);
  lines.push(`| English name mismatches | ${englishMismatches.length} |`);
  lines.push(`| Scientific name spelling differences | ${spellingDifferences.length} |`);
  lines.push(`| Only in spreadsheet | ${onlyInSpreadsheet.length} |`);
  lines.push(`| Only in baseline | ${onlyInBaseline.length} |`);
  lines.push("");

  const total = outOfOrder.length + englishMismatches.length + spellingDifferences.length
    + onlyInSpreadsheet.length + onlyInBaseline.length;
  if (total === 0) {
    lines.push("The two lists are in the same order and carry the same names.", "");
    return `${lines.join("\n")}\n`;
  }

  if (outOfOrder.length) {
    const regions = groupRegions(outOfOrder);
    lines.push("## Species out of order", "");
    lines.push(`${outOfOrder.length} species appear in a different position in the two sources, in `
      + `${regions.length} region${regions.length === 1 ? "" : "s"}. Each table lists the species in `
      + "baseline order, with one row of context either side; a sheet row that goes "
      + "backwards is the disagreement. Displaced species are marked.", "");

    for (const region of regions) {
      const first = region[0].baseline;
      const last = region.at(-1).baseline;
      const displaced = new Set(region);
      const window = pairs.filter((pair) =>
        pair.baseline.index >= first.index - 1 && pair.baseline.index <= last.index + 1);

      lines.push(`### ${first.scientific}`, "");
      lines.push("| Baseline order | Species | Sheet row | Location |");
      lines.push("| --- | --- | --- | --- |");
      for (const pair of window) {
        const flag = displaced.has(pair) ? " **(displaced)**" : "";
        lines.push(`| ${pair.baseline.index + 1} | *${pair.baseline.scientific}*${flag} `
          + `| ${pair.spreadsheet.row} | ${baselineLink(pair.baseline)} |`);
      }
      lines.push("");
    }
  }

  if (englishMismatches.length) {
    lines.push("## English name mismatches", "");
    lines.push("Same scientific name, different common name. Status suffixes such as `(NB)` "
      + "and typographic punctuation are ignored when comparing.", "");
    lines.push("| Species | Spreadsheet | Baseline | Sheet row | Location |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const pair of englishMismatches) {
      lines.push(`| *${pair.baseline.scientific}* | ${pair.spreadsheet.english} `
        + `| ${pair.baseline.english} | ${pair.spreadsheet.row} | ${baselineLink(pair.baseline)} |`);
    }
    lines.push("");
  }

  if (spellingDifferences.length) {
    lines.push("## Scientific name spelling differences", "");
    lines.push("Matched by common name or near-identical spelling, so these are the same "
      + "species written two ways rather than a missing one.", "");
    lines.push("| Spreadsheet | Baseline | Common name | Sheet row | Location |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const pair of spellingDifferences) {
      lines.push(`| *${pair.spreadsheet.scientific}* | *${pair.baseline.scientific}* `
        + `| ${pair.baseline.english} | ${pair.spreadsheet.row} | ${baselineLink(pair.baseline)} |`);
    }
    lines.push("");
  }

  if (onlyInSpreadsheet.length) {
    lines.push("## Only in the spreadsheet", "");
    lines.push("| Species | Common name | Sheet row |");
    lines.push("| --- | --- | --- |");
    for (const entry of onlyInSpreadsheet) {
      lines.push(`| *${entry.scientific}* | ${entry.english} | ${entry.row} |`);
    }
    lines.push("");
  }

  if (onlyInBaseline.length) {
    lines.push("## Only in the baseline", "");
    lines.push("| Species | Common name | Location |");
    lines.push("| --- | --- | --- |");
    for (const entry of onlyInBaseline) {
      lines.push(`| *${entry.scientific}* | ${entry.english} | ${baselineLink(entry)} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
};

const printSection = (title, findings, format) => {
  if (!findings.length) return;
  console.log(`\n${title}: ${findings.length}`);
  for (const finding of findings.slice(0, CONSOLE_LIMIT)) console.log(`  ${format(finding)}`);
  if (findings.length > CONSOLE_LIMIT) {
    console.log(`  ... ${findings.length - CONSOLE_LIMIT} more (see the report)`);
  }
};

// ---------------------------------------------------------------------- main

const main = () => {
  const xlsxPath = findSpreadsheet();
  const spreadsheet = readSpreadsheetSpecies(xlsxPath);
  const baseline = readBaselineSpecies();
  const result = compare(spreadsheet, baseline);

  console.log(`Spreadsheet: ${path.relative(ROOT, xlsxPath)} - ${spreadsheet.length} species`);
  console.log(`Baseline:    clean/baseline/SACCBaseline*.htm - ${baseline.length} species`);
  console.log(`Matched by scientific name: ${result.pairs.length}`);

  printSection("Species out of order", result.outOfOrder, (pair) =>
    `${pair.baseline.scientific} - baseline #${pair.baseline.index + 1} `
    + `(${pair.baseline.file}:${pair.baseline.line}) vs sheet row ${pair.spreadsheet.row}`);

  printSection("English name mismatches", result.englishMismatches, (pair) =>
    `${pair.baseline.scientific} - sheet "${pair.spreadsheet.english}" `
    + `vs baseline "${pair.baseline.english}"`);

  printSection("Scientific name spelling differences", result.spellingDifferences, (pair) =>
    `sheet "${pair.spreadsheet.scientific}" vs baseline "${pair.baseline.scientific}" `
    + `(${pair.baseline.english})`);

  printSection("Only in the spreadsheet", result.onlyInSpreadsheet, (entry) =>
    `${entry.scientific} (${entry.english}) - row ${entry.row}`);

  printSection("Only in the baseline", result.onlyInBaseline, (entry) =>
    `${entry.scientific} (${entry.english}) - ${entry.file}:${entry.line}`);

  const findingCount = result.outOfOrder.length + result.englishMismatches.length
    + result.spellingDifferences.length + result.onlyInSpreadsheet.length + result.onlyInBaseline.length;

  fs.writeFileSync(REPORT_PATH, buildReport(result, {
    generatedAt: new Date().toISOString().slice(0, 10),
    spreadsheetName: path.basename(xlsxPath),
    spreadsheetCount: spreadsheet.length,
    baselineCount: baseline.length,
  }), "utf8");

  console.log(`\n${findingCount === 0 ? "No differences found." : `${findingCount} difference(s) found.`}`);
  console.log(`Report written to ${path.relative(ROOT, REPORT_PATH)}`);

  if (findingCount && process.argv.includes("--strict")) process.exit(1);
};

// Only run when invoked directly, so the comparison can also be imported.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

// ---------------------------------------------------------------------------
// APPENDIX: what a "longest increasing subsequence" is
// ---------------------------------------------------------------------------
//
// A subsequence is what you get by deleting some elements from a sequence
// while keeping the rest in their original order - unlike a substring, the
// kept elements need not be adjacent. An increasing subsequence is one whose
// values only go up. The longest increasing subsequence (LIS) is the biggest
// such set you can keep.
//
// In the sequence 3, 1, 4, 1, 5, 9, 2, 6 the answer is 1, 4, 5, 6 - four
// elements, scattered across the sequence, each larger than the last. You
// cannot do better than four here.
//
//
// How that answers "which species are out of order?"

// TOY: a scrambled list
//   sequence : 3, 1, 4, 1, 5, 9, 2, 6
//   kept     : 1, 4, 5, 6 (length 4)
//   removed  : 3, 1, 9, 2

// ALREADY SORTED: nothing to remove
//   sequence : 1, 2, 3, 4, 5
//   kept     : 1, 2, 3, 4, 5 (length 5)
//   removed  : (none)

// REVERSED: worst case
//   sequence : 5, 4, 3, 2, 1
//   kept     : 1 (length 1)
//   removed  : 5, 4, 3, 2

// REAL: Tolmomyias region (sheet rows)
//   sequence : 2344, 2347, 2346, 2345
//   kept     : 2344, 2345 (length 2)
//   removed  : poliocephalus, assimilis

// REAL: Microspingus trifasciatus region
//   sequence : 3384, 3379, 3385
//   kept     : 3379, 3385 (length 2)
//   removed  : cinereus

// --------------------------------------------------
//
// Walk the baseline in its own order and write down, for each species, the
// spreadsheet row it lands on. If the two sources agreed perfectly, those
// row numbers would climb steadily: 2344, 2345, 2346, 2347 ... Any dip is a
// disagreement.
//
// The real Tolmomyias region produces 2344, 2347, 2346, 2345. The LIS is
// 2344, 2345, so two species must come out - and those two, poliocephalus
// and assimilis, are exactly what the report flags.
//
// So the logic inverts neatly:
//
//   - On the LIS  = these species sit consistently in both lists. Leave
//                   them alone.
//   - Off the LIS = the smallest set you would have to move to reconcile
//                   the two.
//
// Maximizing what you keep is the same thing as minimizing what you report.
// That is why the script surfaces 6 displacements where a naive
// position-by-position compare shouted about 15 - both describe the same
// reality, but 6 is the minimal, actionable set.
//
//
// One wrinkle: the LIS is not always unique
// -----------------------------------------
//
// Pulled out of context, the Microspingus window 3384, 3379, 3385 can keep
// 3379, 3385 and blame cinereus. The actual report blames trifasciatus
// (3379) instead. Both are valid length-2 answers for that fragment - the
// full 3513-element sequence breaks the tie, because keeping 3379 would
// force dropping the whole ascending run 3380-3384 before it. The optimum
// is global, so a window pulled out of context can resolve a tie
// differently than the real run does.
//
//
// Why patience sorting
// --------------------
//
// The textbook dynamic-programming solution is O(n^2) - about 12 million
// operations at n = 3513. longestIncreasingSubsequence() above uses
// patience sorting instead: O(n log n), roughly 3513 x 12. The `tails`
// array holds the smallest possible ending value for an increasing run of
// each length, and the binary search finds where each new value belongs -
// hence the `while (lo < hi)` loop.
//
//
// Notes
// -----
//
//   - The name comes from the card game. Dealing cards onto piles, each
//     card going on the leftmost pile whose top is larger, is exactly this
//     algorithm - the number of piles ends up equal to the LIS length.
//     `tails` is the row of pile tops.
//
//   - `previous[]` is what makes it reconstructible. Patience sorting
//     naturally yields the length of the LIS; the back-pointer array is
//     what lets the code walk backwards and recover which elements formed
//     it - and it is the membership, not the length, this script needs.
//
//   - This is the same machinery `git diff` rests on. Finding the longest
//     common subsequence of two files is the diff problem; here, because
//     the species names are unique on both sides, it collapses to the
//     simpler LIS-over-integers form.
