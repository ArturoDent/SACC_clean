// @ts-check
// Shared helpers for the familySpeciesList experiments. Reads from
// clean/baseline/SACCBaseline02.htm only — never writes there.
import { JSDOM } from "jsdom";
import fs from "node:fs/promises";
import { formatHtmlString } from "../../../src/formatting/vscodeHtmlFormatter.js";

export const SOURCE_FILE = "clean/baseline/SACCBaseline02.htm";
export const RESULT_DIR = "experiments/familySpeciesList/result";

export async function loadFamilySpeciesListDom() {
  const html = await fs.readFile(SOURCE_FILE, "utf8");
  return new JSDOM(html);
}

// For experiments that run across every clean/baseline/** file rather than
// just SACCBaseline02.htm.
/** @param {string} filePath */
export async function loadDom(filePath) {
  const html = await fs.readFile(filePath, "utf8");
  return new JSDOM(html);
}

// The result file lives 3 directories deep (experiments/familySpeciesList/result/)
// vs. the source's 2 (clean/baseline/), so the existing stylesheet link needs
// re-pointing, not just copying as-is.
export function fixMainStylesheetHref(document) {
  const link = document.querySelector('link[rel="stylesheet"]');
  if (link) link.setAttribute("href", "../../../css/styles.css");
}

export function addStylesheetLink(document, href) {
  const link = document.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("href", href);
  document.head.appendChild(link);
}

/**
 * @callback SpeciesEntryCallback
 * @param {{ li: Element, i: Element, scientificName: string, genus: string, previousGenus: string | null, list: Element }} entry
 * @returns {void}
 */

// Walk every species <li> in every .familySpeciesList, in document order,
// resetting the "current genus" whenever a family/subfamily/order/suborder
// boundary is crossed (each of those starts a fresh taxonomic grouping).
/**
 * @param {Document} document
 * @param {SpeciesEntryCallback} callback
 */
export function forEachSpeciesEntry(document, callback) {
  for (const list of document.querySelectorAll(".familySpeciesList")) {
    let previousGenus = null;

    const walk = (ul) => {
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
          previousGenus = null;
          const nestedUl = li.querySelector(":scope > ul");
          if (nestedUl) walk(nestedUl);
          continue;
        }

        // A plain species row: <li><i>Scientific name</i> <span class="commonName ...">...</span> [note]</li>
        const i = li.querySelector(":scope > i");
        if (!i) continue;

        const scientificName = (i.textContent ?? "").trim();
        const genus = scientificName.split(" ")[0];

        callback({ li, i, scientificName, genus, previousGenus, list });
        previousGenus = genus;
      }
    };

    const topUl = list.querySelector(":scope > ul");
    if (topUl) walk(topUl);
  }
}

export async function writeResult(dom, outputFile) {
  await fs.mkdir(RESULT_DIR, { recursive: true });
  const outputPath = `${ RESULT_DIR }/${ outputFile }`;

  // Same formatting pass the real pipeline uses (src/pipeline/writeClean.js) —
  // re-indents from actual DOM depth rather than relying on whatever raw
  // whitespace happens to already be in the serialized string.
  const html = formatHtmlString(dom.serialize(), `file://${ outputPath }`, {
    tabSize: 2,
    insertSpaces: true,
    wrapLineLength: 120,
  });

  await fs.writeFile(outputPath, html, "utf8");
}
