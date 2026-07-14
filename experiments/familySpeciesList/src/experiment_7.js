// @ts-check
// Experiment 7: using experiment 4's result (unabbreviated, per-list aligned)
// as the source, insert a blank spacer line before each new genus group —
// same idea as experiment 6, but since experiment 4 never abbreviates names,
// there's no abbreviation marker to lean on; compare genus strings directly
// instead (reusing forEachSpeciesEntry's own genus-tracking/reset logic).
import fs from "node:fs/promises";
import { JSDOM } from "jsdom";
import { fixMainStylesheetHref, forEachSpeciesEntry, writeResult } from "./shared.js";

const SOURCE_FILE = "experiments/familySpeciesList/result/SACCBaseline02_4.htm";

const html = await fs.readFile(SOURCE_FILE, "utf8");
const dom = new JSDOM(html);
const { document } = dom.window;

// Collect insertion points first, then mutate — avoids touching the DOM
// while forEachSpeciesEntry is still walking it.
const insertBeforeThese = [];
forEachSpeciesEntry(document, ({ li, genus, previousGenus }) => {
  if (previousGenus !== null && genus !== previousGenus) {
    insertBeforeThese.push(li);
  }
});

let inserted = 0;
for (const li of insertBeforeThese) {
  const parent = li.parentNode;
  if (!parent) continue;

  const spacer = document.createElement("li");
  spacer.innerHTML = "&nbsp;";
  parent.insertBefore(spacer, li);
  parent.insertBefore(document.createTextNode("\n"), li);
  inserted++;
}

fixMainStylesheetHref(document);

await writeResult(dom, "SACCBaseline02_7.htm");
console.log(`Experiment 7: inserted ${ inserted } blank spacer line${ inserted === 1 ? "" : "s" }.`);
