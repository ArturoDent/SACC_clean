// @ts-check
// Experiment 1: fill in missing proposal links in SACCproproster.htm.
// missingList.txt marks, per entry, which run of text should become the
// link (via an illustrative <a href="">...</a> that does not exist in the
// real source) — the real source just has that same text as a bare run or
// wrapped in <i>, with no anchor at all yet.
import fs from "node:fs/promises";
import { JSDOM } from "jsdom";
import { writeResult } from "./shared.js";

const SOURCE_FILE = "clean/proposals/roster_charts/SACCproproster.htm";
const MISSING_LIST_FILE = "experiments/rosterMissingLinks/missingList.txt";
const BASE_URL = "http://www.museum.lsu.edu/~Remsen/SACCprop";

/** @param {string} text */
function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** @param {string} raw */
function parseMissingList(raw) {
  const entries = [];
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const numberMatch = line.match(/^(\d+)([A-Za-z]?)\./);
    const anchorMatch = line.match(/<a href="">(.*?)<\/a>/);
    if (!numberMatch || !anchorMatch) {
      console.warn(`Skipping unparseable line: ${ line }`);
      continue;
    }

    entries.push({
      digits: numberMatch[1],
      letter: numberMatch[2],
      anchorText: anchorMatch[1],
      normalizedFullText: normalizeWhitespace(line.replace('<a href="">', "").replace("</a>", "")),
      // A trailing "*" (e.g. "* DID NOT PASS", "* PASSED (...)") marks the
      // missing link as intentional in the original document - not a gap to fix.
      intentionallyOmitted: line.includes("*"),
    });
  }
  return entries;
}

/** @param {string} digits */
function buildProposalUrl(digits) {
  const padded = digits.length === 1 ? `0${ digits }` : digits;
  return `${ BASE_URL }${ padded }.htm`;
}

// 216 and 217 were never published as their own pages - only bundled into a
// combined write-up alongside sibling numbers 214, 215, and 218 (discovered
// via the Wayback Machine's CDX index: their individual-number URLs 404 both
// live and in every archive snapshot, but this combined URL is live and
// covers them). 214 and 215 are also part of that same bundle, but both are
// separately marked "*" (intentionally omitted) so they never reach this
// lookup.
/** @type {Record<string, string>} */
const COMBINED_URL_OVERRIDES = {
  "216": `${ BASE_URL }214-218.htm`,
  "217": `${ BASE_URL }214-218.htm`,
};

/** @param {string} url */
async function urlExists(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Wraps targetText in a new <a href> within paragraph, preserving an
 * existing <i> wrapper (splitting it if targetText is only part of it).
 * @param {Document} document
 * @param {Element} paragraph
 * @param {string} targetText
 * @param {string} href
 */
function wrapMatchedText(document, paragraph, targetText, href) {
  for (const i of paragraph.querySelectorAll("i")) {
    if (i.closest("a")) continue;
    if (i.textContent?.trim() === targetText) {
      const a = document.createElement("a");
      a.setAttribute("href", href);
      i.replaceWith(a);
      a.appendChild(i);
      return true;
    }
  }

  const { NodeFilter } = /** @type {any} */ (document.defaultView);
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  /** @type {Text | null} */
  let node;
  while ((node = /** @type {Text | null} */ (walker.nextNode()))) {
    const parentEl = node.parentElement;
    if (parentEl?.closest("a")) continue;

    const text = node.textContent ?? "";
    const idx = text.indexOf(targetText);
    if (idx === -1) continue;

    const before = text.slice(0, idx);
    const after = text.slice(idx + targetText.length);
    const isItalic = parentEl?.tagName === "I";

    const a = document.createElement("a");
    a.setAttribute("href", href);

    if (isItalic && parentEl) {
      const linkedItalic = document.createElement("i");
      linkedItalic.textContent = targetText;
      a.appendChild(linkedItalic);

      const grandParent = parentEl.parentNode;
      if (!grandParent) continue;
      if (before) {
        const beforeI = document.createElement("i");
        beforeI.textContent = before;
        grandParent.insertBefore(beforeI, parentEl);
      }
      grandParent.insertBefore(a, parentEl);
      if (after) {
        const afterI = document.createElement("i");
        afterI.textContent = after;
        grandParent.insertBefore(afterI, parentEl);
      }
      grandParent.removeChild(parentEl);
    } else {
      a.textContent = targetText;
      const parent = node.parentNode;
      if (!parent) continue;
      if (before) parent.insertBefore(document.createTextNode(before), node);
      parent.insertBefore(a, node);
      if (after) parent.insertBefore(document.createTextNode(after), node);
      parent.removeChild(node);
    }
    return true;
  }

  return false;
}

/**
 * Entry 91 already has a link, but the source has a typo: "SACCrop91.htm"
 * (missing the second "p") instead of "SACCprop91.htm", so it 404s.
 * @param {Element} paragraph
 */
function fixEntry91Typo(paragraph) {
  const a = [...paragraph.querySelectorAll("a")].find((el) => /SACCrop\d+\.htm/.test(el.getAttribute("href") ?? ""));
  if (!a) return false;
  const href = /** @type {string} */ (a.getAttribute("href"));
  a.setAttribute("href", href.replace("SACCrop", "SACCprop"));
  return true;
}

/**
 * Entry 315's source has malformed nested <i> tags: the closing paren and
 * "ridibundus" were mistakenly swept inside the second <i>, e.g.
 * "<i>Chroicocephalus</i> (formerly <i>Larus) ridibundus</i>." Fix the
 * nesting, then wrap the full "Chroicocephalus (formerly Larus) ridibundus"
 * span (spanning both <i> elements and the plain text between/after them)
 * in a single new <a>.
 * @param {Document} document
 * @param {Element} paragraph
 * @param {string} href
 */
function fixEntry315AndLink(document, paragraph, href) {
  const italics = [...paragraph.querySelectorAll("i")];
  const firstItalic = italics.find((i) => i.textContent?.trim() === "Chroicocephalus");
  const malformedItalic = italics.find((i) => i.textContent?.includes("Larus)"));
  if (!firstItalic || !malformedItalic) return false;

  const text = malformedItalic.textContent ?? "";
  const splitIdx = text.indexOf(")");
  if (splitIdx === -1) return false;

  const fixedItalic = document.createElement("i");
  fixedItalic.textContent = text.slice(0, splitIdx);
  const restText = document.createTextNode(text.slice(splitIdx));
  malformedItalic.replaceWith(fixedItalic, restText);

  const parent = firstItalic.parentNode;
  if (!parent) return false;

  // Collect the sibling range [firstItalic ... restText] before moving anything.
  const rangeNodes = [];
  /** @type {ChildNode | null} */
  let node = firstItalic;
  while (node) {
    rangeNodes.push(node);
    if (node === restText) break;
    node = node.nextSibling;
  }
  if (rangeNodes[rangeNodes.length - 1] !== restText) return false;

  const a = document.createElement("a");
  a.setAttribute("href", href);
  parent.insertBefore(a, firstItalic);
  for (const n of rangeNodes) a.appendChild(n);

  return true;
}

const [html, missingListRaw] = await Promise.all([
  fs.readFile(SOURCE_FILE, "utf8"),
  fs.readFile(MISSING_LIST_FILE, "utf8"),
]);
const dom = new JSDOM(html);
const { document } = dom.window;

const entries = parseMissingList(missingListRaw);
const paragraphs = [...document.querySelectorAll("p")];

let linked = 0;
let skipped = 0;
const unresolved = [];

for (const entry of entries) {
  const label = `${ entry.digits }${ entry.letter }`;

  if (entry.intentionallyOmitted) {
    skipped++;
    continue;
  }

  const numberRegex = new RegExp(`^${ entry.digits }${ entry.letter }\\.`);
  let matches = paragraphs.filter((p) => numberRegex.test(normalizeWhitespace(p.textContent ?? "")));

  if (matches.length > 1) {
    // Same leading number shared by sub-parts (e.g. "930" A/B) - disambiguate
    // by exact full-text match against missingList.txt's own transcription.
    matches = matches.filter((p) => normalizeWhitespace(p.textContent ?? "") === entry.normalizedFullText);
  }

  if (matches.length !== 1) {
    unresolved.push(`${ label }: ${ matches.length === 0 ? "no matching paragraph found" : `ambiguous - ${ matches.length } paragraphs matched` }`);
    continue;
  }

  const paragraph = matches[0];

  // Entry 91 already has a link - it's just typo'd ("SACCrop" missing a "p").
  if (label === "91") {
    if (fixEntry91Typo(paragraph)) {
      linked++;
    } else {
      unresolved.push(`${ label }: expected typo'd link not found`);
    }
    continue;
  }

  const url = COMBINED_URL_OVERRIDES[entry.digits] ?? buildProposalUrl(entry.digits);
  if (!(await urlExists(url))) {
    unresolved.push(`${ label }: ${ url } does not exist`);
    continue;
  }

  // Entry 315's source has malformed nested <i> tags that need repairing
  // before the target text is a clean, wrappable run.
  if (label === "315") {
    if (fixEntry315AndLink(document, paragraph, url)) {
      linked++;
    } else {
      unresolved.push(`${ label }: malformed <i> structure not found as expected`);
    }
    continue;
  }

  if (wrapMatchedText(document, paragraph, entry.anchorText, url)) {
    linked++;
  } else {
    unresolved.push(`${ label }: target text "${ entry.anchorText }" not found in matched paragraph`);
  }
}

await writeResult(dom, "SACCproproster_1.htm");

console.log(`Experiment 1: linked ${ linked } of ${ entries.length } entries (${ skipped } intentionally omitted, skipped).`);
if (unresolved.length > 0) {
  console.log("Unresolved:");
  for (const line of unresolved) console.log(`  - ${ line }`);
}
