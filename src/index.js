// node index.js
// node index.js dirty1.html dirty1_clean.html

import { createCleanHtml } from "../createCleanHtml.js";
import { convertFamilySpeciesLists } from "../familySpeciesList.js";
import { convertOrderPhylogeny } from "../orderPhylogeny.js";
import { convertSaccFooter } from "../saccFooter.js";
import { convertSaccPageLinks } from "../saccPageLinks.js";
import {
  replaceHtmlElement,
  // removeHeadStyle,
  replaceHeadElement,
  replaceSpacerElements,
  simplifyBanner,
  simplifyLineSeparators,
  simplifyPageWrapper,
  stripWordFormatting,
  stripComments,
  stripSpans,
  trimParagraphTextNodes,       // removes empty lines and lines with whitespace only
} from "../wordCleanup.js";

const sourceFile = process.argv[2] ?? "dirty/dirty1.html";
const outputFile = process.argv[3] ?? "clean/dirty1_clean.html";

const cleanupSteps = [
  stripComments,
  // removeHeadStyle,  // remove <meta> and <link> from the <head> that we don't need - just create a new head
  replaceHtmlElement,
  replaceHeadElement,
  simplifyPageWrapper,
  simplifyBanner,
  simplifyLineSeparators,
  stripWordFormatting,
  replaceSpacerElements,
  // remove <span> elements, replace with its textContent but not in familySpeciesList
  stripSpans,
  // remove empty lines and <br> elements?
  trimParagraphTextNodes,
  convertOrderPhylogeny,
  convertFamilySpeciesLists,
  convertSaccPageLinks,
  convertSaccFooter,
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
