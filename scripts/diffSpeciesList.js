// @ts-check
// node scripts/diffSpeciesList.js [SACC4 SACC5 ...] [--git]
//
// Reports what changed in the species list: species added, removed, renamed,
// reordered or moved to another family/part, status-code and footnote changes,
// and order/family/subfamily header changes. A "git diff" of the sidecars shows
// the same facts, but as raw JSON lines; this names them.
//
// Default: regenerates the named parts (all 11 if none given) from
// dirty/baseline into a temp directory through the normal pipeline and compares
// those sidecars against the current clean/baseline ones. So: download the new
// parts, run this, then re-run the pipeline. clean/ is left untouched.
//
// --git: compares the sidecars committed at HEAD against the working tree
// instead (no pipeline run) - for after the pipeline has already been re-run.
//
// Prints a summary and writes the full findings to species-list-changes.md.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compare } from "../spreadsheets/scripts/verifySpeciesOrder.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_DIR = path.join(ROOT, "clean", "baseline");
const REPORT_PATH = path.join(ROOT, "species-list-changes.md");
const CONSOLE_LIMIT = 20;

// Same naming as src/index.js: part 1 has no number, parts 2-11 are zero-padded.
const sidecarFileName = (part) => part === 1 ? "SACCBaseline.json" : `SACCBaseline${ String(part).padStart(2, "0") }.json`;

const args = process.argv.slice(2);
const useGit = args.includes("--git");
const parts = args.filter((a) => !a.startsWith("--")).map((raw) => {
  const match = raw.match(/^SACC(\d+)$/i);
  if (!match) { console.error(`Not a baseline part: ${ raw } (expected SACC1 .. SACC11)`); process.exit(1); }
  return Number(match[1]);
});
if (!parts.length) parts.push(...Array.from({ length: 11 }, (_, i) => i + 1));

// ---------------------------------------------------------------- loading

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const readCommittedJson = (part) => {
  const repoPath = `clean/baseline/${ sidecarFileName(part) }`;
  try {
    return JSON.parse(execFileSync("git", ["show", `HEAD:${ repoPath }`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    console.error(`${ repoPath } is not committed at HEAD - run without --git, or commit the sidecars first.`);
    process.exit(1);
  }
};

// Runs the pipeline on the requested parts with its output redirected to a
// scratch directory and returns the sidecars it wrote there.
const regenerateFromDirty = () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "sacc-diff-"));
  const stems = parts.map((n) => `SACC${ n }`);
  const run = spawnSync(process.execPath, [path.join(ROOT, "src/index.js"), ...stems], {
    cwd: ROOT,
    env: { ...process.env, SACC_OUTPUT_DIR: scratch },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (run.status !== 0) {
    console.error(run.stdout, run.stderr, `Pipeline failed (exit ${ run.status }); nothing compared.`);
    fs.rmSync(scratch, { recursive: true, force: true });
    process.exit(1);
  }

  const sidecars = new Map(parts.map((part) => [part, readJson(path.join(scratch, sidecarFileName(part)))]));
  fs.rmSync(scratch, { recursive: true, force: true });
  return sidecars;
};

// Species rows with the headers above them attached, so a species can be
// reported as "Part 4 / ARAMIDAE" and a move between families can be seen.
const speciesWithContext = (rows, part) => {
  const species = [];
  let order = "", family = "", subfamily = "";
  for (const row of rows) {
    if (row.type === "order") { order = row.label; family = ""; subfamily = ""; }
    else if (row.type === "family") { family = row.label; subfamily = ""; }
    else if (row.type === "subfamily") subfamily = row.label;
    else if (row.type === "species") {
      species.push({
        part, order, family, subfamily,
        scientific: row.scientificName,
        english: row.commonName,
        status: row.status ?? [],
        note: row.note ?? "",
      });
    }
  }
  return species;
};

const headerRows = (rows) => rows.filter((row) => row.type !== "species");

// ---------------------------------------------------------------- comparing

const placeOf = (entry) => [`Part ${ entry.part }`, entry.family, entry.subfamily].filter(Boolean).join(" / ");
const statusText = (status) => status.length ? `(${ status.join(", ") })` : "-";
const sameStatus = (a, b) => a.length === b.length && a.every((code, i) => code === b[i]);

const diffSpecies = (oldSidecars, newSidecars) => {
  const oldList = [], newList = [];
  for (const part of parts) {
    oldList.push(...speciesWithContext(oldSidecars.get(part), part));
    newList.push(...speciesWithContext(newSidecars.get(part), part));
  }
  oldList.forEach((entry, index) => { entry.index = index; });
  newList.forEach((entry, index) => { entry.index = index; });

  // compare() was written for spreadsheet-vs-baseline; here "spreadsheet" is
  // the old list and "baseline" the new one. It pairs species by scientific
  // name, pairs leftover ones by common name or near spelling (renames), and
  // finds the minimal set of species that moved (LIS alignment).
  const result = compare(oldList, newList);
  const pairs = result.pairs.map(({ spreadsheet, baseline, spelling }) => ({ old: spreadsheet, new: baseline, spelling }));

  return {
    added: result.onlyInBaseline,
    removed: result.onlyInSpreadsheet,
    renamed: result.spellingDifferences.map(({ spreadsheet, baseline }) => ({ old: spreadsheet, new: baseline })),
    reordered: result.outOfOrder.map(({ spreadsheet, baseline }) => ({ old: spreadsheet, new: baseline })),
    englishChanged: result.englishMismatches.map(({ spreadsheet, baseline }) => ({ old: spreadsheet, new: baseline })),
    statusChanged: pairs.filter((p) => !sameStatus(p.old.status, p.new.status)),
    noteChanged: pairs.filter((p) => p.old.note !== p.new.note),
    moved: pairs.filter((p) => placeOf(p.old) !== placeOf(p.new)),
    oldCount: oldList.length,
    newCount: newList.length,
  };
};

// Order/family/subfamily rows: added, removed, or same header with a changed
// footnote reference. Keyed by type + label within a part.
const diffHeaders = (oldSidecars, newSidecars) => {
  const added = [], removed = [], noteChanged = [];
  for (const part of parts) {
    const key = (row) => `${ row.type }|${ row.label }`;
    const oldMap = new Map(headerRows(oldSidecars.get(part)).map((row) => [key(row), row]));
    const newMap = new Map(headerRows(newSidecars.get(part)).map((row) => [key(row), row]));
    for (const [k, row] of newMap) {
      const before = oldMap.get(k);
      if (!before) added.push({ part, ...row });
      else if ((before.note ?? "") !== (row.note ?? "")) noteChanged.push({ part, old: before, new: row });
    }
    for (const [k, row] of oldMap) if (!newMap.has(k)) removed.push({ part, ...row });
  }
  return { added, removed, noteChanged };
};

// ---------------------------------------------------------------- reporting

const sections = (species, headers) => [
  { title: "Species added", items: species.added,
    columns: ["Species", "Common name", "Status", "Where"],
    row: (e) => [`*${ e.scientific }*`, e.english, statusText(e.status), placeOf(e)],
    line: (e) => `${ e.scientific } (${ e.english }) - ${ placeOf(e) }` },
  { title: "Species removed", items: species.removed,
    columns: ["Species", "Common name", "Status", "Where"],
    row: (e) => [`*${ e.scientific }*`, e.english, statusText(e.status), placeOf(e)],
    line: (e) => `${ e.scientific } (${ e.english }) - ${ placeOf(e) }` },
  { title: "Scientific name changed", items: species.renamed,
    columns: ["Before", "After", "Common name", "Where"],
    row: (p) => [`*${ p.old.scientific }*`, `*${ p.new.scientific }*`, p.new.english, placeOf(p.new)],
    line: (p) => `${ p.old.scientific } -> ${ p.new.scientific } (${ p.new.english })` },
  { title: "Common name changed", items: species.englishChanged,
    columns: ["Species", "Before", "After", "Where"],
    row: (p) => [`*${ p.new.scientific }*`, p.old.english, p.new.english, placeOf(p.new)],
    line: (p) => `${ p.new.scientific }: "${ p.old.english }" -> "${ p.new.english }"` },
  { title: "Status changed", items: species.statusChanged,
    columns: ["Species", "Common name", "Before", "After", "Where"],
    row: (p) => [`*${ p.new.scientific }*`, p.new.english, statusText(p.old.status), statusText(p.new.status), placeOf(p.new)],
    line: (p) => `${ p.new.scientific }: ${ statusText(p.old.status) } -> ${ statusText(p.new.status) }` },
  { title: "Footnote reference changed", items: species.noteChanged,
    columns: ["Species", "Common name", "Before", "After", "Where"],
    row: (p) => [`*${ p.new.scientific }*`, p.new.english, p.old.note || "-", p.new.note || "-", placeOf(p.new)],
    line: (p) => `${ p.new.scientific }: "${ p.old.note }" -> "${ p.new.note }"` },
  { title: "Moved to another family or part", items: species.moved,
    columns: ["Species", "Common name", "From", "To"],
    row: (p) => [`*${ p.new.scientific }*`, p.new.english, placeOf(p.old), placeOf(p.new)],
    line: (p) => `${ p.new.scientific }: ${ placeOf(p.old) } -> ${ placeOf(p.new) }` },
  { title: "Species reordered", items: species.reordered,
    columns: ["Species", "Common name", "Old position", "New position", "Where"],
    row: (p) => [`*${ p.new.scientific }*`, p.new.english, String(p.old.index + 1), String(p.new.index + 1), placeOf(p.new)],
    line: (p) => `${ p.new.scientific }: #${ p.old.index + 1 } -> #${ p.new.index + 1 } (${ placeOf(p.new) })` },
  { title: "Headers added", items: headers.added,
    columns: ["Type", "Label", "Note", "Part"],
    row: (h) => [h.type, h.label, h.note || "-", `Part ${ h.part }`],
    line: (h) => `${ h.type } ${ h.label } - Part ${ h.part }` },
  { title: "Headers removed", items: headers.removed,
    columns: ["Type", "Label", "Note", "Part"],
    row: (h) => [h.type, h.label, h.note || "-", `Part ${ h.part }`],
    line: (h) => `${ h.type } ${ h.label } - Part ${ h.part }` },
  { title: "Header footnote reference changed", items: headers.noteChanged,
    columns: ["Type", "Label", "Before", "After", "Part"],
    row: (h) => [h.new.type, h.new.label, h.old.note || "-", h.new.note || "-", `Part ${ h.part }`],
    line: (h) => `${ h.new.type } ${ h.new.label }: "${ h.old.note }" -> "${ h.new.note }"` },
];

const cell = (value) => String(value).replaceAll("|", "\\|");

const buildReport = (allSections, context) => {
  const lines = ["# Species list changes", ""];
  lines.push(`Generated by \`node scripts/diffSpeciesList.js${ context.argsText }\` on ${ context.generatedAt }.`, "");
  lines.push(`- Before: ${ context.beforeLabel } - **${ context.oldCount }** species`);
  lines.push(`- After: ${ context.afterLabel } - **${ context.newCount }** species`);
  lines.push(`- Parts compared: ${ parts.map((n) => `SACC${ n }`).join(", ") }`, "");

  lines.push("## Summary", "", "| Check | Findings |", "| --- | --- |");
  for (const s of allSections) lines.push(`| ${ s.title } | ${ s.items.length } |`);
  lines.push("");

  if (!context.total) {
    lines.push("No changes to the species list.", "");
    return `${ lines.join("\n") }\n`;
  }

  for (const s of allSections) {
    if (!s.items.length) continue;
    lines.push(`## ${ s.title }`, "");
    lines.push(`| ${ s.columns.join(" | ") } |`);
    lines.push(`| ${ s.columns.map(() => "---").join(" | ") } |`);
    for (const item of s.items) lines.push(`| ${ s.row(item).map(cell).join(" | ") } |`);
    lines.push("");
  }
  return `${ lines.join("\n") }\n`;
};

// ---------------------------------------------------------------- main

const main = () => {
  let oldSidecars, newSidecars, beforeLabel, afterLabel;
  if (useGit) {
    oldSidecars = new Map(parts.map((part) => [part, readCommittedJson(part)]));
    newSidecars = new Map(parts.map((part) => [part, readJson(path.join(BASELINE_DIR, sidecarFileName(part)))]));
    beforeLabel = "sidecars committed at HEAD";
    afterLabel = "sidecars in the working tree (clean/baseline/)";
  } else {
    oldSidecars = new Map(parts.map((part) => [part, readJson(path.join(BASELINE_DIR, sidecarFileName(part)))]));
    newSidecars = regenerateFromDirty();
    beforeLabel = "current sidecars (clean/baseline/)";
    afterLabel = "regenerated from dirty/baseline/";
  }

  const species = diffSpecies(oldSidecars, newSidecars);
  const headers = diffHeaders(oldSidecars, newSidecars);
  const allSections = sections(species, headers);
  const total = allSections.reduce((sum, s) => sum + s.items.length, 0);

  console.log(`Before: ${ beforeLabel } - ${ species.oldCount } species`);
  console.log(`After:  ${ afterLabel } - ${ species.newCount } species`);
  for (const s of allSections) {
    if (!s.items.length) continue;
    console.log(`\n${ s.title }: ${ s.items.length }`);
    for (const item of s.items.slice(0, CONSOLE_LIMIT)) console.log(`  ${ s.line(item) }`);
    if (s.items.length > CONSOLE_LIMIT) console.log(`  ... ${ s.items.length - CONSOLE_LIMIT } more (see the report)`);
  }

  fs.writeFileSync(REPORT_PATH, buildReport(allSections, {
    argsText: args.length ? ` ${ args.join(" ") }` : "",
    generatedAt: new Date().toISOString().slice(0, 10),
    beforeLabel, afterLabel, total,
    oldCount: species.oldCount, newCount: species.newCount,
  }), "utf8");

  console.log(`\n${ total === 0 ? "No changes to the species list." : `${ total } change(s) found.` }`);
  console.log(`Report written to ${ path.relative(ROOT, REPORT_PATH) }`);
};

main();
