// node scripts/harvestProposalLinks.js
// npm run harvest-proposal-links
//
// Extracts every proposal link referenced anywhere in dirty/SACC*.html and under
// dirty/proposals/roster_charts/ (the roster page itself lists every proposal under
// category headings like "Proposals that have PASSED", plus whatever the saved
// tracking chart pages add), dedupes them, sorts them, and writes the result to
// dirty/proposals/proposalLinks.txt — one URL per line — for downloadProposals.js
// to read from. Re-run this whenever you save more chart/roster pages.

import fs from "fs/promises";
import path from "path";

const DIRTY_DIR = "dirty";
const SAVED_CHARTS_DIR = "dirty/proposals/roster_charts";
const OUTPUT_FILE = "dirty/proposals/proposalLinks.txt";
const REMSEN_BASE = "https://www.museum.lsu.edu/~Remsen/";

const HREF_RE = /href="([^"]+)"/gi;

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

// Recognizes any href that points at an individual proposal page, however it's
// expressed in the source HTML, and normalizes it to the live web URL.
const normalizeProposalHref = (href) => {
  // Word/Excel-saved single-file pages keep the original local hyperlink as-is.
  const fileMatch = href.match(/^file:\/\/\/(SACCprop\d[0-9A-Za-z]*)\.html?$/i);
  if (fileMatch) return `${ REMSEN_BASE }${ fileMatch[1].replace(/prop/i, "prop") }.htm`;

  // Absolute museum URL, any protocol — requires a digit right after "prop" so
  // chart pages (SACCPropChart...) and the roster page (SACCproproster.htm)
  // don't get mistaken for individual proposals. Some source pages have a typo'd
  // "Prop" (capital P); the live server is case-sensitive and only has lowercase.
  const webMatch = href.match(/^https?:\/\/www\.museum\.lsu\.edu\/~Remsen\/([^?#]*[Pp]rop\d[^?#]*\.htm)$/i);
  if (webMatch) return `${ REMSEN_BASE }${ webMatch[1].replace(/prop/i, "prop") }`;

  // Bare relative reference (e.g. "../SACCprop1044.htm" or "SACCprop1044.htm").
  const relativeMatch = href.match(/^(?:\.\.\/)?(SACCprop\d[0-9A-Za-z]*\.htm)$/i);
  if (relativeMatch) return `${ REMSEN_BASE }${ relativeMatch[1].replace(/prop/i, "prop") }`;

  return null;
};

// Some proposals are linked via both http:// and https:// (or file:// vs web) in
// different places. Key by filename and prefer https when more than one shows up.
const addLink = (map, url) => {
  const name = url.split("/").pop();
  const existing = map.get(name);
  if (!existing || (existing.startsWith("http://") && url.startsWith("https://"))) {
    map.set(name, url);
  }
};

const collectFromFile = async (filePath, urls) => {
  const html = await fs.readFile(filePath, "utf8");
  for (const match of html.matchAll(HREF_RE)) {
    const normalized = normalizeProposalHref(match[1]);
    if (normalized) addLink(urls, normalized);
  }
};

const urls = new Map();

const saccPageNames = (await fs.readdir(DIRTY_DIR)).filter((f) => /^SACC\d+\.html?$/i.test(f));
for (const name of saccPageNames) {
  await collectFromFile(path.join(DIRTY_DIR, name), urls);
}
console.log(`After dirty/SACC*.html: ${ urls.size } unique links.`);

if (await fileExists(SAVED_CHARTS_DIR)) {
  const entries = await fs.readdir(SAVED_CHARTS_DIR, { recursive: true, withFileTypes: true });
  const htmlPaths = entries
    .filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));

  for (const filePath of htmlPaths) {
    await collectFromFile(filePath, urls);
  }
  console.log(`After ${ SAVED_CHARTS_DIR }: ${ urls.size } unique links.`);
} else {
  console.log(`${ SAVED_CHARTS_DIR } not found — skipping.`);
}

// Numeric sort on the proposal number (so prop2 < prop10, not the reverse as a
// plain string sort would give), with any letter suffix (e.g. "1044B") as a tiebreaker.
const sortKey = (url) => {
  const match = url.match(/(\d+)([A-Za-z]*)\.htm$/i);
  return match ? [Number(match[1]), match[2].toLowerCase()] : [Infinity, url];
};

const sorted = [...urls.values()].sort((a, b) => {
  const [numA, suffixA] = sortKey(a);
  const [numB, suffixB] = sortKey(b);
  return numA !== numB ? numA - numB : suffixA.localeCompare(suffixB);
});
await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
await fs.writeFile(OUTPUT_FILE, sorted.join("\n") + "\n", "utf8");

console.log(`Wrote ${ sorted.length } unique proposal links to ${ OUTPUT_FILE }.`);
