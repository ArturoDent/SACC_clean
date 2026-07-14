// @ts-check
// Experiment 3: combine 1 + 2 — abbreviate repeated genus names first, then
// column-align based on the resulting (possibly shorter) displayed names.
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

let abbreviated = 0;
forEachSpeciesEntry(document, ({ i, scientificName, genus, previousGenus }) => {
  if (genus !== previousGenus) return;

  const rest = scientificName.slice(genus.length).trim();
  i.textContent = `${ genus[0] }. ${ rest }`;
  abbreviated++;
});

// Measure against the already-abbreviated text, since that's what's displayed.
let maxLength = 0;
for (const i of document.querySelectorAll(".familySpeciesList li > i:first-child")) {
  maxLength = Math.max(maxLength, (i.textContent ?? "").trim().length);
}

const cssPath = "experiments/familySpeciesList/css/experiment_3.css";
await fs.writeFile(
  cssPath,
  `/* Same column-alignment technique as experiment_1.css, applied after */\n` +
  `/* experiment 2's genus abbreviation shortens some scientific names. */\n` +
  `.familySpeciesList li > i:first-child { display: inline-block; min-width: ${ maxLength + 1 }ch; }\n`,
  "utf8"
);

fixMainStylesheetHref(document);
addStylesheetLink(document, "../css/experiment_3.css");

await writeResult(dom, "SACCBaseline02_3.htm");
console.log(`Experiment 3: abbreviated ${ abbreviated } genus name${ abbreviated === 1 ? "" : "s" }; longest displayed name is ${ maxLength } characters.`);
