// node scripts/downloadProposals.js <start> <end>
// npm run download-proposals -- <start> <end>
//
// Downloads items <start> through <end> (1-indexed, inclusive) from
// dirty/proposals/proposalLinks.txt into dirty/proposals/. Files that already
// exist there are skipped, so re-running the same range is safe.
//
// proposalLinks.txt is built by scripts/harvestProposalLinks.js — run that
// (or `npm run harvest-proposal-links`) first, and again whenever you save more
// chart/roster pages under dirty/proposals/roster_charts/.

import fs from "fs/promises";
import path from "path";

const DELAY_MS = 750;
const PROPOSALS_DIR = "dirty/proposals";
const LINKS_FILE = "dirty/proposals/proposalLinks.txt";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const [startArg, endArg] = process.argv.slice(2).map(Number);
if (!Number.isInteger(startArg) || !Number.isInteger(endArg) || startArg < 1 || endArg < startArg) {
  console.error("Usage: node scripts/downloadProposals.js <start> <end>  (1-indexed, inclusive)");
  process.exit(1);
}

if (!(await fileExists(LINKS_FILE))) {
  console.error(`${ LINKS_FILE } not found. Run: npm run harvest-proposal-links`);
  process.exit(1);
}

const urls = (await fs.readFile(LINKS_FILE, "utf8")).split("\n").map((line) => line.trim()).filter(Boolean);
console.log(`${ urls.length } links in ${ LINKS_FILE }.`);

if (startArg > urls.length) {
  console.error(`Start (${ startArg }) is beyond the ${ urls.length } available links.`);
  process.exit(1);
}

const block = urls.slice(startArg - 1, endArg);
console.log(`Downloading items ${ startArg }-${ Math.min(endArg, urls.length) } of ${ urls.length }.`);

await fs.mkdir(PROPOSALS_DIR, { recursive: true });

let downloaded = 0;
let skipped = 0;
let failed = 0;

for (const url of block) {
  const name = url.split("/").pop();
  const outPath = path.join(PROPOSALS_DIR, name);

  if (await fileExists(outPath)) {
    console.log(`SKIP ${ name } (already exists)`);
    skipped++;
    continue;
  }

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

console.log(`Done. Downloaded ${ downloaded }, skipped ${ skipped }, failed ${ failed }.`);
