// @ts-check
// node src/proposals.js                       — processes all files in dirty/proposals/
// node src/proposals.js ACCprop857 SACCprop285 — processes named files in sequence

import fs from "fs/promises";
import { createCleanHtml } from "./pipeline/createCleanHtml.js";
import {
  combineAbbreviatedItalicNames,
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
  : (await fs.readdir(SOURCE_DIR))
    .filter(f => f.endsWith(".htm"))
    .map(f => f.replace(/\.htm$/, ""))
    .sort();

const files = stems.map(s => ({
  stem: s,
  sourceFile: `${ SOURCE_DIR }/${ s }.htm`,
  outputFile: `${ OUTPUT_DIR }/${ s }.htm`,
}));

for (const { stem, sourceFile, outputFile } of files) {
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

    collapseBlankParagraphs,
    removeDivWrapper
  ];

  const { results } = await createCleanHtml({ sourceFile, outputFile, cleanupSteps });
  for (const result of results) {
    if (result?.message) console.log(result.message);
  }
  console.log(`Wrote ${ outputFile }.`);
}
