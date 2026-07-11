// @ts-check
// node src/proposals.js                       — processes all files in dirty/proposals/
// node src/proposals.js ACCprop857 SACCprop285 — processes named files in sequence

import fs from "fs/promises";
import { createCleanHtml } from "./pipeline/createCleanHtml.js";
import {
  combineAbbreviatedItalicNames,
  trimFormattingTagWhitespace,
  unwrapPunctuationOnlyUnderlineTags,
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
  removeEmptySpans,
  simplifyLineSeparators,
  stripLangAttribute,
  stripWordFormatting,
  stripComments,
  stripSpans,
  trimParagraphTextNodes,
  unwrapAttributelessSpans,
  unwrapSpellCheckSpans,
} from "./cleanup/wordCleanup.js";

const SOURCE_DIR = "dirty/proposals";
const OUTPUT_DIR = "clean/proposals";
const CSS_HREF = "../../css/proposals/proposals.css";

const replaceProposalsHeadElement = (document) =>
  replaceHeadElement(document, { cssHref: CSS_HREF });

// Unlike the main SACC pages (body is bold throughout, so <b> is redundant Word
// noise), proposal pages use <b> to mark real section headers ("Principles and
// Procedures:") against normal-weight body text — keep it instead of unwrapping it.
const stripProposalsWordFormatting = (document) =>
  stripWordFormatting(document, { unwrapBold: false });

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

const cleanupSteps = [
  stripComments,
  replaceHtmlElement,
  replaceProposalsHeadElement,
  convertProposalHeader,
  simplifyLineSeparators,
  convertCitedText,
  stripSpans,
  unwrapSpellCheckSpans,
  stripProposalsWordFormatting,
  trimParagraphTextNodes,
  reclassifyHyperlinkSpans,
  stripLangAttribute,
  unwrapAttributelessSpans,
  removeEmptySpans,

  unwrapWhitespaceOnlyFormattingTags,    // post clean-up steps
  unwrapPunctuationOnlyUnderlineTags,
  trimFormattingTagWhitespace,
  combineAbbreviatedItalicNames,

  collapseBlankParagraphs,
  removeDivWrapper
];

for (const { sourceFile, outputFile } of files) {
  const { results } = await createCleanHtml({ sourceFile, outputFile, cleanupSteps });
  for (const result of results) {
    if (result?.message) console.log(result.message);
  }
  console.log(`Wrote ${ outputFile }.`);
}
