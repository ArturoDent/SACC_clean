// node scripts/downloadBaseline.js         — downloads all 11 parts to dirty/baseline/
// node scripts/downloadBaseline.js 6       — downloads only part 6
//
// Source/local filename are identical: SACCBaseline.htm (part 1, no number) or
// SACCBaselineNN.htm (parts 2-11, zero-padded) — matching the live site's own naming.

import fs from "fs/promises";
import path from "path";

const DELAY_MS = 750;
const OUTPUT_DIR = "dirty/baseline";
const BASE_URL = "https://www.museum.lsu.edu/~Remsen/";

// Part 1 is the one exception: https://www.museum.lsu.edu/~Remsen/SACCBaseline.htm
// (no number). Parts 2-11 are SACCBaseline02.htm ... SACCBaseline11.htm.
const baselineFileName = (n) => n === 1 ? "SACCBaseline.htm" : `SACCBaseline${ String(n).padStart(2, "0") }.htm`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const [arg] = process.argv.slice(2);
let parts;

if (arg === undefined) {
  parts = Array.from({ length: 11 }, (_, i) => i + 1);
} else {
  const n = Number(arg);
  if (!Number.isInteger(n) || n < 1 || n > 11) {
    console.error("Usage: node scripts/downloadBaseline.js [1-11]");
    process.exit(1);
  }
  parts = [n];
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });

let downloaded = 0;
let failed = 0;

for (const n of parts) {
  const name = baselineFileName(n);
  const url = `${ BASE_URL }${ name }`;
  const outPath = path.join(OUTPUT_DIR, name);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${ response.status }`);
    const html = await response.text();
    await fs.writeFile(outPath, html, "utf8");
    console.log(`OK   ${ name }`);
    downloaded++;
  } catch (err) {
    console.log(`FAIL ${ name } : ${ err instanceof Error ? err.message : err }`);
    failed++;
  }

  await sleep(DELAY_MS);
}

console.log(`Done. Downloaded ${ downloaded }, failed ${ failed }.`);
