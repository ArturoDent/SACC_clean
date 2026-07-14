// @ts-check
// Experiment 5: combine (3) and (4) — abbreviate repeated genus names first,
// then align using experiment 4's per-list CSS custom-property mechanism
// (measuring the already-abbreviated/displayed text), with a 3-space gap.
import fs from "node:fs/promises";
import {
  loadFamilySpeciesListDom,
  fixMainStylesheetHref,
  addStylesheetLink,
  forEachSpeciesEntry,
  writeResult,
} from "./shared.js";

const GAP_CHARS = 3;

const dom = await loadFamilySpeciesListDom();
const { document } = dom.window;

let abbreviated = 0;
forEachSpeciesEntry(document, ({ i, scientificName, genus, previousGenus }) => {
  if (genus !== previousGenus) return;

  const rest = scientificName.slice(genus.length).trim();
  i.textContent = `${ genus[0] }. ${ rest }`;
  abbreviated++;
});

// Measure against the already-abbreviated text, per-list (not page-wide).
let scopedLists = 0;
for (const listEl of document.querySelectorAll(".familySpeciesList")) {
  const list = /** @type {HTMLElement} */ (listEl);
  let maxLength = 0;
  for (const i of list.querySelectorAll("li > i:first-child")) {
    maxLength = Math.max(maxLength, (i.textContent ?? "").trim().length);
  }
  if (maxLength === 0) continue;

  list.style.setProperty("--sci-name-width", `${ maxLength + GAP_CHARS }ch`);
  scopedLists++;
}

const cssPath = "experiments/familySpeciesList/css/experiment_5.css";
await fs.writeFile(
  cssPath,
  `/* Static, reusable across every page — the actual width comes from the */\n` +
  `/* --sci-name-width custom property set inline on each .familySpeciesList. */\n` +
  `.familySpeciesList li > i:first-child { display: inline-block; min-width: var(--sci-name-width); }\n`,
  "utf8"
);

fixMainStylesheetHref(document);
addStylesheetLink(document, "../css/experiment_5.css");

await writeResult(dom, "SACCBaseline02_5.htm");
console.log(`Experiment 5: abbreviated ${ abbreviated } genus name${ abbreviated === 1 ? "" : "s" }; set --sci-name-width on ${ scopedLists } block${ scopedLists === 1 ? "" : "s" }.`);
