// @ts-check
// Experiment 6: using experiment 5's result as the source, insert a blank
// spacer line before each new genus group — but not before the very first
// entry in a family/subfamily section, and not between consecutive
// same-genus entries (which stay grouped together with no gap).
//
// Reuses experiment 5's own abbreviation as the "same genus as predecessor"
// signal (an abbreviated name like "N. hirundinaceus" means the genus matches
// the previous entry; a full name means either a new genus or the first
// entry in a section) rather than re-deriving genus identity from scratch.
import fs from "node:fs/promises";
import { JSDOM } from "jsdom";
import { fixMainStylesheetHref, writeResult } from "./shared.js";

const SOURCE_FILE = "experiments/familySpeciesList/result/SACCBaseline02_5.htm";

const html = await fs.readFile(SOURCE_FILE, "utf8");
const dom = new JSDOM(html);
const { document } = dom.window;

let inserted = 0;

for (const list of document.querySelectorAll(".familySpeciesList")) {
  const walk = (ul) => {
    let firstInSection = true;

    for (const li of [...ul.children]) {
      if (li.tagName !== "LI") continue;

      if (
        li.classList.contains("family") ||
        li.classList.contains("subfamily") ||
        li.classList.contains("order") ||
        li.classList.contains("suborder") ||
        li.classList.contains("subclass") ||
        li.classList.contains("infraclass")
      ) {
        const nestedUl = li.querySelector(":scope > ul");
        if (nestedUl) walk(nestedUl);
        continue;
      }

      const i = li.querySelector(":scope > i");
      if (!i) continue;

      const isAbbreviated = /^[A-Z]\.\s/.test((i.textContent ?? "").trim());

      if (!isAbbreviated && !firstInSection) {
        const spacer = document.createElement("li");
        spacer.innerHTML = "&nbsp;";
        ul.insertBefore(spacer, li);
        ul.insertBefore(document.createTextNode("\n"), li);
        inserted++;
      }

      firstInSection = false;
    }
  };

  const topUl = list.querySelector(":scope > ul");
  if (topUl) walk(topUl);
}

fixMainStylesheetHref(document);

await writeResult(dom, "SACCBaseline02_6.htm");
console.log(`Experiment 6: inserted ${ inserted } blank spacer line${ inserted === 1 ? "" : "s" }.`);
