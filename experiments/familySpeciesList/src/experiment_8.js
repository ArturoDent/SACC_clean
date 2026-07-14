// @ts-check
// Experiment 8: using experiment 7's result as the source, mark each blank
// spacer <li>&nbsp;</li> with a .spacer class and control its height via a
// configurable CSS custom property (--spacer-height), rather than a full
// text-height blank line.
import fs from "node:fs/promises";
import { JSDOM } from "jsdom";
import { fixMainStylesheetHref, addStylesheetLink, writeResult } from "./shared.js";

const SOURCE_FILE = "experiments/familySpeciesList/result/SACCBaseline02_7.htm";

const html = await fs.readFile(SOURCE_FILE, "utf8");
const dom = new JSDOM(html);
const { document } = dom.window;

let marked = 0;
for (const li of document.querySelectorAll(".familySpeciesList li")) {
  // A spacer has no element children at all — just the literal &nbsp; text —
  // unlike a species row (has an <i>) or a section header (has a nested <ul>).
  if (li.children.length === 0 && li.textContent === "\u00A0") {
    li.classList.add("spacer");
    marked++;
  }
}

const cssPath = "experiments/familySpeciesList/css/experiment_8.css";
await fs.writeFile(
  cssPath,
  `/* Configurable via --spacer-height (falls back to 0.4em if unset) — set it */\n` +
  `/* inline on .familySpeciesList, or per-spacer, to tune the gap without */\n` +
  `/* touching this rule. */\n` +
  `.familySpeciesList li.spacer { line-height: var(--spacer-height, 0.4em); }\n`,
  "utf8"
);

fixMainStylesheetHref(document);
addStylesheetLink(document, "../css/experiment_8.css");

await writeResult(dom, "SACCBaseline02_8.htm");
console.log(`Experiment 8: marked ${ marked } spacer${ marked === 1 ? "" : "s" } with .spacer.`);
