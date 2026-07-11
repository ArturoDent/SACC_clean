// @ts-check
// node src/index.js            — processes all files in dirty/
// node src/index.js SACC6 SACC7 — processes named files in sequence

// TEST_FILE=SACC2 npx playwright test
// TEST_FILE=SACC3,SACC4 npx playwright test

import fs from "fs/promises";
import { createCleanHtml } from "./pipeline/createCleanHtml.js";
import {
  combineAbbreviatedItalicNames,
  trimFormattingTagWhitespace,
  unwrapPunctuationOnlyUnderlineTags,
  unwrapWhitespaceOnlyFormattingTags,
} from "./cleanup/inlineTagCleanup.js";
import { convertFamilySpeciesLists } from "./sacc/familySpeciesList.js";
import { convertOrderPhylogeny } from "./sacc/orderPhylogeny.js";
import { convertSaccFooter } from "./sacc/saccFooter.js";
import { convertSaccAuxLinks } from "./sacc/saccAuxLinks.js";
import { convertPartHeaders } from "./sacc/saccPartHeaders.js";
import { convertSaccPageLinks } from "./sacc/saccPageLinks.js";
import { convertSpeciesListTable, classifySpeciesListColumns } from "./sacc/speciesListTable.js";
import { convertStatusCodes } from "./sacc/statusCodes.js";
import { convertMembershipSection } from "./sacc/saccRoster.js";
import { convertFootnotes } from "./sacc/footnotes.js";
import { addTaxonomyLevels } from "./helpers/levelClasses.js";
import {
  replaceHtmlElement,
  replaceHeadElement,
  replaceSpacerElements,
  reclassifyHyperlinkSpans,
  removeDivWrapper,
  removeEmptySpans,
  simplifyBanner,
  simplifyLineSeparators,
  stripLangAttribute,
  stripWordFormatting,
  stripComments,
  stripSpans,
  trimParagraphTextNodes,       // removes empty lines and lines with whitespace only
  unwrapAttributelessSpans,
} from "./cleanup/wordCleanup.js";

const SOURCE_DIR = "dirty/baseline";
const OUTPUT_DIR = "clean/baseline";

// The live site (and our local copies) name part 1 "SACCBaseline.htm" (no number)
// and parts 2-11 "SACCBaselineNN.htm" (zero-padded). The CLI/test-facing name for
// all of them stays "SACCn" for convenience.
const baselineFileName = (n) => n === 1 ? "SACCBaseline.htm" : `SACCBaseline${ String(n).padStart(2, "0") }.htm`;

const parseBaselineFileName = (fileName) => {
  if (/^SACCBaseline\.htm$/i.test(fileName)) return 1;
  const match = fileName.match(/^SACCBaseline(\d+)\.htm$/i);
  return match ? Number(match[1]) : null;
};

// SACCCountryLists (and anything else that isn't a "SACCn" baseline part)
// deliberately lives outside dirty/baseline/, so it's excluded from the default
// no-args run but still works when named explicitly.
const resolveStem = (stem) => {
  const match = stem.match(/^SACC(\d+)$/i);
  if (match) {
    const fileName = baselineFileName(Number(match[1]));
    return { stem, sourceFile: `${ SOURCE_DIR }/${ fileName }`, outputFile: `${ OUTPUT_DIR }/${ fileName }` };
  }

  if (stem === "SACCCountryLists") {
    return { stem, sourceFile: "dirty/SACCCountryLists.htm", outputFile: "clean/SACCCountryLists.htm" };
  }

  return { stem, sourceFile: `dirty/${ stem }.html`, outputFile: `clean/${ stem }.html` };
};

const argStems = process.argv.slice(2);
const files = argStems.length
  ? argStems.map(resolveStem)
  : (await fs.readdir(SOURCE_DIR))
    .map(parseBaselineFileName)
    .filter((n) => n !== null)
    .sort((a, b) => a - b)
    .map((n) => resolveStem(`SACC${ n }`));

// The dirty source titles are inconsistent (some correct, some missing the part
// number, part 1's is a completely different string) — rebuild it from the part
// number we already know instead of trying to patch the original text.
const baselineTitle = (stem) => {
  const match = stem.match(/^SACC(\d+)$/i);
  return match ? `A classification of the bird species of South America. Part ${ Number(match[1]) }` : undefined;
};

for (const { stem, sourceFile, outputFile } of files) {
  const title = baselineTitle(stem);
  const replaceBaselineHeadElement = (document) =>
    replaceHeadElement(document, title ? { title } : undefined);

  const steps = [
    stripComments,
    replaceHtmlElement,
    replaceBaselineHeadElement,
    simplifyBanner,
    simplifyLineSeparators,
    stripSpans,
    stripWordFormatting,
    replaceSpacerElements,
    trimParagraphTextNodes,
    reclassifyHyperlinkSpans,
    stripLangAttribute,
    unwrapAttributelessSpans,
    removeEmptySpans,
    convertOrderPhylogeny,
    convertFamilySpeciesLists,
    convertSaccPageLinks,
    convertSaccAuxLinks,

    unwrapWhitespaceOnlyFormattingTags,    // post clean-up steps
    unwrapPunctuationOnlyUnderlineTags,
    trimFormattingTagWhitespace,
    combineAbbreviatedItalicNames,

    convertPartHeaders,
    convertSaccFooter,
    removeDivWrapper,
    addTaxonomyLevels,

    ...(stem === "SACCCountryLists" ? [convertSpeciesListTable, classifySpeciesListColumns, convertStatusCodes] : []),
    ...(stem === "SACC1" ? [convertMembershipSection] : []),
    ...(/^SACC\d+$/i.test(stem) ? [convertFootnotes] : [])
  ];

  const { results } = await createCleanHtml({ sourceFile, outputFile, cleanupSteps: steps });
  for (const result of results) {
    if (result?.message) console.log(result.message);
  }
  console.log(`Wrote ${ outputFile }.`);
}
