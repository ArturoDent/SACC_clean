// node index.js
// node index.js dirty1.html dirty1_clean.html

import { createCleanHtml } from "../createCleanHtml.js";
import { convertFamilySpeciesLists } from "../familySpeciesList.js";
import { convertOrderPhylogeny } from "../orderPhylogeny.js";
import { convertSaccFooter } from "../saccFooter.js";
import { convertSaccPageLinks } from "../saccPageLinks.js";
import {
  removeHeadStyles,
  replaceSpacerElements,
  simplifyBanner,
  simplifyLineSeparators,
  simplifyPageWrapper,
  stripWordFormatting,
  stripComments,
  stripSpans,
  // stripEmptyLines
  trimParagraphTextNodes,
  // collapseBlankLinesToString
  // collapseBlankLinesFromDocumentToString
  // collapseBlankParagraphsFromDocument
  // removeWhitespaceBetweenBlocks
} from "../wordCleanup.js";

const sourceFile = process.argv[2] ?? "dirty/dirty1.html";
const outputFile = process.argv[3] ?? "clean/dirty1_clean.html";

const cleanupSteps = [
  // fix the <html> attributes
  stripComments,
  removeHeadStyles,  // remove <meta> and <link> from the <head> that we don't need - just create a new head
  simplifyPageWrapper,
  simplifyBanner,
  simplifyLineSeparators,
  convertOrderPhylogeny,
  convertFamilySpeciesLists,
  convertSaccPageLinks,
  convertSaccFooter,
  stripWordFormatting,
  replaceSpacerElements,
  // remove <span> elements, replace with its textContent but not in familySpeciesList
  stripSpans,
  // remove empty lines and <br> elements?
  // stripEmptyLines
  trimParagraphTextNodes,
  // collapseBlankLinesToString
  // collapseBlankLinesFromDocumentToString
  // collapseBlankParagraphsFromDocument
  // removeWhitespaceBetweenBlocks
];

const { results } = await createCleanHtml({
  sourceFile,
  outputFile,
  cleanupSteps
});

for (const result of results) {
  if (result?.message) console.log(result.message);
}

console.log(`Wrote ${ outputFile }.`);
