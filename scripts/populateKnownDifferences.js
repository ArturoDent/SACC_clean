// node scripts/populateKnownDifferences.js [SACC1 SACC2 ...]
// Runs visual-compare tests for each stem and OVERWRITES all entries in
// tests/known-differences/baseline/<stem>.txt with the current failures
// (all commented out). The explanatory header at the top is always preserved.
// Uncomment the first line of an entry to silence that difference.
//
// Text entry format (3 comment lines):
//   # Original text here
//   # Cleaned text here
//   # Rendered line N  dirty L...  clean L...
//
// Color entry format (2 comment lines):
//   # "label" color mismatch: dirty=...  clean=...
//   # dirty L...  clean L...

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const DIFF_DIR = "tests/known-differences/baseline";
const ALL_STEMS = ["SACC1","SACC2","SACC3","SACC4","SACC5","SACC6","SACC7","SACC8","SACC9","SACC10","SACC11"];
const stems = process.argv.slice(2).length ? process.argv.slice(2) : ALL_STEMS;

const HEADER = [
  "# Known intentional differences between dirty/baseline and clean/baseline for this part.",
  "# Format for text mismatches: uncomment only the first line (the Original) to suppress.",
  "# Format for color mismatches: uncomment only the first line to suppress.",
  "# Lines starting with # are comments. Blank lines are ignored.",
].join("\n");

// Parse color failures. Returns Map<entry, location>.
const parseColorFailures = (msg) => {
  const entries = new Map();
  for (const block of msg.split("\n\n")) {
    const lines = block.trim().split("\n");
    const firstLine = lines[0]?.trim();
    if (!firstLine) continue;
    if (firstLine.includes("color mismatch:") || firstLine.includes("should appear with non-black color in clean")) {
      entries.set(firstLine, lines[1]?.trim() ?? "");
    }
  }
  return entries;
};

// Parse text failures. Returns Map<original, {cleaned, location}>.
const parseTextFailures = (msg) => {
  const entries = new Map();
  for (const block of msg.split("\n\n")) {
    const lines = block.trim().split("\n");
    const origLine = lines.find((l) => l.trim().startsWith("Original:"));
    const cleanLine = lines.find((l) => l.trim().startsWith("Cleaned:"));
    if (!origLine || !cleanLine) continue;
    const origMatch = origLine.match(/Original:\s+"(.*)"$/);
    const cleanMatch = cleanLine.match(/Cleaned:\s+"(.*)"$/);
    if (origMatch && cleanMatch) {
      entries.set(origMatch[1], { cleaned: cleanMatch[1], location: lines[0]?.trim() ?? "" });
    }
  }
  return entries;
};

// Format a commented color entry block.
const formatColorEntry = (entry, location) => {
  const lines = [`# ${ entry }`];
  if (location) lines.push(`# ${ location }`);
  return lines.join("\n");
};

// Format a commented text entry block.
const formatTextEntry = (original, cleaned, location) => {
  const lines = [`# ${ original }`, `# ${ cleaned }`];
  if (location) lines.push(`# ${ location }`);
  return lines.join("\n");
};

// Parse the existing file into active-entry blocks: each is
// { active: string, comments: string[] }.
const parseActiveBlocks = (content) => {
  const lines = content.split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const comments = [];
      i++;
      while (i < lines.length && lines[i].trim().startsWith("#")) {
        comments.push(lines[i].trim());
        i++;
      }
      // Skip trailing blanks before next entry
      while (i < lines.length && !lines[i].trim()) i++;
      blocks.push({ active: trimmed, comments });
    } else {
      i++;
    }
  }
  return blocks;
};

// Rebuild active blocks, augmenting with cleaned+location comments where missing.
const buildActiveSection = (activeBlocks, colorEntries, textEntries) => {
  return activeBlocks.map(({ active, comments }) => {
    const commentSet = new Set(comments.map((c) => c.replace(/^#\s*/, "")));

    // Is this a color entry or a text entry?
    const isColor = active.includes("color mismatch:") || active.includes("should appear with non-black color in clean");

    if (isColor) {
      // colorEntries maps entry → location string (not an object).
      const location = colorEntries.get(active) ?? "";
      const out = [active];
      if (location && !commentSet.has(location)) {
        out.push(`# ${ location }`);
      } else {
        out.push(...comments);
      }
      return out.join("\n");
    } else {
      // Text entry: active line is the original.
      const failure = textEntries.get(active);
      const out = [active];
      if (failure) {
        const cleanedComment = failure.cleaned;
        const locationComment = failure.location;
        if (!commentSet.has(cleanedComment)) out.push(`# ${ cleanedComment }`);
        if (locationComment && !commentSet.has(locationComment)) out.push(`# ${ locationComment }`);
        // Keep any pre-existing comments that differ
        for (const c of comments) {
          const stripped = c.replace(/^#\s*/, "");
          if (stripped !== cleanedComment && stripped !== locationComment) out.push(c);
        }
      } else {
        out.push(...comments);
      }
      return out.join("\n");
    }
  });
};

for (const stem of stems) {
  process.stdout.write(`${ stem } ... `);

  let jsonOutput;
  try {
    jsonOutput = execSync(
      `npx playwright test visual-compare --reporter=json`,
      { env: { ...process.env, TEST_FILE: stem, IGNORE_KNOWN_DIFFERENCES: "1" },
        encoding: "utf8", stdio: ["pipe","pipe","pipe"] }
    );
    console.log("all passed — nothing to add");
    continue;
  } catch (err) {
    jsonOutput = err.stdout ?? "";
  }

  let suite;
  try {
    suite = JSON.parse(jsonOutput);
  } catch {
    console.log("could not parse JSON output — skipping");
    continue;
  }

  const colorEntries = new Map();
  const textEntries  = new Map();

  const walkSuite = (s) => {
    for (const spec of (s.specs ?? [])) {
      for (const test of (spec.tests ?? [])) {
        for (const result of (test.results ?? [])) {
          for (const error of (result.errors ?? [])) {
            const msg = error.message ?? "";
            if (spec.title === "colored text has matching color in clean") {
              for (const [e, loc] of parseColorFailures(msg)) colorEntries.set(e, loc);
            } else if (spec.title === "dirty and clean contain identical visible text") {
              for (const [e, info] of parseTextFailures(msg)) textEntries.set(e, info);
            }
          }
        }
      }
    }
    for (const child of (s.suites ?? [])) walkSuite(child);
  };
  walkSuite(suite);

  const total = colorEntries.size + textEntries.size;
  if (!total) {
    console.log("no parseable failures — file unchanged");
    continue;
  }

  const filePath = path.join(DIFF_DIR, `${ stem }.txt`);
  const existingContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const activeBlocks = parseActiveBlocks(existingContent);

  // Build the updated active section (augmenting comments where needed).
  const activeSections = buildActiveSection(activeBlocks, colorEntries, textEntries);

  // Build the new commented entries section.
  const commentedEntries = [
    ...[...colorEntries.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([e, loc]) => formatColorEntry(e, loc)),
    ...[...textEntries.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([e, { cleaned, location }]) => formatTextEntry(e, cleaned, location)),
  ];

  const parts = [HEADER];
  if (activeSections.length) parts.push(activeSections.join("\n\n"));
  if (commentedEntries.length) parts.push(commentedEntries.join("\n\n"));
  fs.writeFileSync(filePath, parts.join("\n\n") + "\n");

  const preserved = activeBlocks.length;
  console.log(`wrote ${ total } entr${ total === 1 ? "y" : "ies" } (${ colorEntries.size } color, ${ textEntries.size } text)${ preserved ? `, preserved ${ preserved } active` : "" }`);
}
