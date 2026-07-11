// node scripts/setStylesheetLink.js [source] <destination>
// Rewrites the <link rel="stylesheet" href="..."> in every clean/<source>/*.html
// file (or clean/*.html directly if source is omitted) to point at <destination>
// instead — useful for re-pointing the deployed folder structure's CSS path
// without re-running the cleanup pipeline.
//
// Example: node scripts/setStylesheetLink.js proposals "../css/proposals.css"
// Example: node scripts/setStylesheetLink.js baseline "../css/styles.css"
// Example: node scripts/setStylesheetLink.js "../css/styles.css"   (clean/ root)

import fs from "fs/promises";
import path from "path";

const LINK_RE = /(<link rel="stylesheet" href=")[^"]*(">)/;

const args = process.argv.slice(2);
let source, destination;

if (args.length === 1) {
  [destination] = args;
} else if (args.length === 2) {
  [source, destination] = args;
}

if (!destination) {
  console.error("Usage: node scripts/setStylesheetLink.js [source] <destination>");
  console.error('Example: node scripts/setStylesheetLink.js proposals "../css/proposals.css"');
  process.exit(1);
}

const sourceDir = source ? `clean/${ source }` : "clean";
const names = (await fs.readdir(sourceDir)).filter((f) => f.endsWith(".html") || f.endsWith(".htm"));

let updated = 0;
for (const name of names) {
  const filePath = path.join(sourceDir, name);
  const html = await fs.readFile(filePath, "utf8");

  if (!LINK_RE.test(html)) {
    console.log(`SKIP ${ name } (no stylesheet link found)`);
    continue;
  }

  await fs.writeFile(filePath, html.replace(LINK_RE, `$1${ destination }$2`), "utf8");
  console.log(`OK   ${ name }`);
  updated++;
}

console.log(`Done. Updated ${ updated } of ${ names.length } file${ names.length === 1 ? "" : "s" }.`);
