// @ts-check
// Experiment 1: align every commonName into a straight column across the
// whole .familySpeciesList, via CSS (no monospace font — see plan.txt).
import fs from "node:fs/promises";
import {
  loadFamilySpeciesListDom,
  fixMainStylesheetHref,
  addStylesheetLink,
  forEachSpeciesEntry,
  writeResult,
} from "./shared.js";

const dom = await loadFamilySpeciesListDom();
const { document } = dom.window;

// Longest scientific name (in characters) across the *entire* .familySpeciesList,
// not per-family, so alignment holds even across multiple families/subfamilies.
let maxLength = 0;
forEachSpeciesEntry(document, ({ scientificName }) => {
  maxLength = Math.max(maxLength, scientificName.length);
});

const cssPath = "experiments/familySpeciesList/css/experiment_1.css";
await fs.writeFile(
  cssPath,
  `/* Column-align commonName under .familySpeciesList without a monospace font: */\n` +
  `/* give every scientific name a shared minimum width via inline-block. */\n` +
  `.familySpeciesList li > i:first-child { display: inline-block; min-width: ${ maxLength + 1 }ch; }\n`,
  "utf8"
);

fixMainStylesheetHref(document);
addStylesheetLink(document, "../css/experiment_1.css");

await writeResult(dom, "SACCBaseline02_1.htm");
console.log(`Experiment 1: longest scientific name is ${ maxLength } characters. Wrote result + ${ cssPath }.`);
