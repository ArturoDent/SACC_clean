// @ts-check
// Experiment 4: per-list custom-property alignment (unabbreviated scientific
// names — combining with abbreviation is experiment 3's job, not this one),
// with a minimum 5-space gap before the common name. Run across every
// clean/baseline/** file, not just SACCBaseline02.htm.
import fs from "node:fs/promises";
import { loadDom, fixMainStylesheetHref, addStylesheetLink, writeResult } from "./shared.js";

const SOURCE_DIR = "clean/baseline";
const GAP_CHARS = 3;

// Static CSS rule — written once, shared unchanged by every result page below.
const cssPath = "experiments/familySpeciesList/css/experiment_4.css";
await fs.writeFile(
  cssPath,
  `/* Static, reusable across every page — the actual width comes from the */\n` +
  `/* --sci-name-width custom property set inline on each .familySpeciesList. */\n` +
  `.familySpeciesList li > i:first-child { display: inline-block; min-width: var(--sci-name-width); }\n`,
  "utf8"
);

const files = (await fs.readdir(SOURCE_DIR)).filter((f) => f.endsWith(".htm")).sort();

for (const file of files) {
  const dom = await loadDom(`${ SOURCE_DIR }/${ file }`);
  const { document } = dom.window;

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

  fixMainStylesheetHref(document);
  addStylesheetLink(document, "../css/experiment_4.css");

  const stem = file.replace(/\.htm$/, "");
  await writeResult(dom, `${ stem }_4.htm`);
  console.log(`Experiment 4: ${ file } — set --sci-name-width on ${ scopedLists } block${ scopedLists === 1 ? "" : "s" }.`);
}
