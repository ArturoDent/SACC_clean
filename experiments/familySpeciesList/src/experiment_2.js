// @ts-check
// Experiment 2: abbreviate a genus to its first letter when it repeats on the
// immediately following entry (resetting at each new genus/family/subfamily).
import {
  loadFamilySpeciesListDom,
  fixMainStylesheetHref,
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

fixMainStylesheetHref(document);

await writeResult(dom, "SACCBaseline02_2.htm");
console.log(`Experiment 2: abbreviated ${ abbreviated } repeated genus name${ abbreviated === 1 ? "" : "s" }.`);
