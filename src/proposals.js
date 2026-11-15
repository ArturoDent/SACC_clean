// @ts-check
// node src/proposals.js                       — processes all files in dirty/proposals/ (in parallel)
// node src/proposals.js ACCprop857 SACCprop285 — processes named files in sequence
//
// SACC_SERIAL=1 node src/proposals.js — force a single process (profiling)

import fs from "fs/promises";
import { fileURLToPath } from "node:url";
import { createCleanHtml, logResults } from "./pipeline/createCleanHtml.js";
import { runStemsInParallel } from "./pipeline/runParallel.js";
import {
  combineAbbreviatedItalicNames,
  normalizeSpanNestingOrder,
  trimFormattingTagWhitespace,
  unwrapPunctuationOnlyFormattingTags,
  unwrapWhitespaceOnlyFormattingTags,
} from "./cleanup/inlineTagCleanup.js";
import { convertProposalHeader } from "./proposals/proposalHeader.js";
import { convertCitedText } from "./proposals/citedText.js";
import {
  replaceHtmlElement,
  replaceHeadElement,
  collapseBlankParagraphs,
  removeDivWrapper,
  reclassifyHyperlinkSpans,
  removeEmptyBoldTags,
  removeEmptySpans,
  simplifyLineSeparators,
  stripLangAttribute,
  stripWordFormatting,
  stripComments,
  stripSpans,
  trimParagraphTextNodes,
  unwrapAttributelessSpans,
  unwrapGramESpans,
  unwrapSpellCheckSpans,
} from "./cleanup/wordCleanup.js";

const SOURCE_DIR = "dirty/proposals";
const OUTPUT_DIR = "clean/proposals";
const CSS_HREF = "../../css/proposals/proposals.css";

const argStems = process.argv.slice(2);
const stems = argStems.length
  ? argStems
  // readdir only lists top-level entries, so roster_charts/SACCproproster
  // (the one file in that subfolder with an established clean/ output -
  // its 11 siblings are unprocessed raw chart exports, never published)
  // has to be added explicitly rather than discovered.
  : [
    ...(await fs.readdir(SOURCE_DIR))
      .filter(f => f.endsWith(".htm"))
      .map(f => f.replace(/\.htm$/, "")),
    "roster_charts/SACCproproster",
  ].sort();

// A batch run fans out to one child process per file (see runParallel.js); each
// child comes back through this same script with a single stem.
if (stems.length > 1 && !process.env.SACC_SERIAL) {
  const failures = await runStemsInParallel(fileURLToPath(import.meta.url), stems);
  if (failures) process.exitCode = 1;
} else {
  for (const stem of stems) await cleanProposal(stem);
}

async function cleanProposal(stem) {
  const sourceFile = `${ SOURCE_DIR }/${ stem }.htm`;
  const outputFile = `${ OUTPUT_DIR }/${ stem }.htm`;

  // The roster is a uniform ~1200-entry list with no bold/normal contrast to
  // preserve (unlike individual proposals, which use <b> for real section
  // headers) — bold it via CSS instead, same as the baseline pipeline does.
  const isRoster = stem === "roster_charts/SACCproproster";

  const replaceProposalsHeadElement = (document) =>
    replaceHeadElement(document, {
      cssHref: isRoster ? "../../../css/proposals/roster.css" : CSS_HREF,
    });

  const stripProposalsWordFormatting = (document) =>
    stripWordFormatting(document, { unwrapBold: isRoster });

  const cleanupSteps = [
    stripComments,
    replaceHtmlElement,
    replaceProposalsHeadElement,
    convertProposalHeader,
    simplifyLineSeparators,
    convertCitedText,
    stripSpans,
    unwrapSpellCheckSpans,
    unwrapGramESpans,
    stripProposalsWordFormatting,
    trimParagraphTextNodes,
    reclassifyHyperlinkSpans,
    stripLangAttribute,
    unwrapAttributelessSpans,
    removeEmptySpans,
    removeEmptyBoldTags,

    unwrapWhitespaceOnlyFormattingTags,    // post clean-up steps
    trimFormattingTagWhitespace,
    unwrapPunctuationOnlyFormattingTags,
    combineAbbreviatedItalicNames,
    normalizeSpanNestingOrder,

    collapseBlankParagraphs,
    removeDivWrapper
  ];

  try {
    const { results } = await createCleanHtml({ sourceFile, outputFile, cleanupSteps });
    logResults(results);
    console.log(`Wrote ${ outputFile }.`);
  } catch (err) {
    console.error(`Failed ${ stem } (${ sourceFile }): ${ err instanceof Error ? err.message : err }`);
    process.exitCode = 1;
  }
}
