// @ts-check
// node src/index.js            — processes all files in dirty/baseline/ (in parallel)
// node src/index.js SACC6 SACC7 — processes named files in sequence
// node src/index.js SACCCountryLists — anything that lives directly in dirty/*.htm
//
// SACC_SERIAL=1 node src/index.js — force a single process (profiling)
//
// TEST_FILE=SACC2 npx playwright test
// TEST_FILE=SACC3,SACC4 npx playwright test

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
  shortenSaccPropLinks,
  simplifyBanner,
  simplifyLineSeparators,
  stripLangAttribute,
  stripWordFormatting,
  stripComments,
  stripSpans,
  trimParagraphTextNodes,       // removes empty lines and lines with whitespace only
  unwrapAttributelessSpans,
  unwrapGramESpans,
  unwrapSpeciesnameSpans,
} from "./cleanup/wordCleanup.js";

const SOURCE_DIR = "dirty/baseline";
// SACC_OUTPUT_DIR lets a caller (scripts/diffSpeciesList.js) regenerate into a
// scratch directory without overwriting clean/.
const OUTPUT_DIR = process.env.SACC_OUTPUT_DIR ?? "clean/baseline";

// The live site (and our local copies) name part 1 "SACCBaseline.htm" (no number)
// and parts 2-11 "SACCBaselineNN.htm" (zero-padded). The CLI/test-facing name for
// all of them stays "SACCn" for convenience.
const baselineFileName = (n) => n === 1 ? "SACCBaseline.htm" : `SACCBaseline${ String(n).padStart(2, "0") }.htm`;

const parseBaselineFileName = (fileName) => {
  if (/^SACCBaseline\.htm$/i.test(fileName)) return 1;
  const match = fileName.match(/^SACCBaseline(\d+)\.htm$/i);
  return match ? Number(match[1]) : null;
};

// Every stem is canonicalized here so the per-file step selection below can use
// plain equality: "sacc1", "SACC01" and "SACC1" all become { stem: "SACC1", part: 1 }.
// SACCCountryLists (and anything else that isn't a "SACCn" baseline part)
// deliberately lives outside dirty/baseline/, so it's excluded from the default
// no-args run but still works when named explicitly.
const resolveStem = (rawStem) => {
  const match = rawStem.match(/^SACC(\d+)$/i);
  if (match) {
    const part = Number(match[1]);
    const fileName = baselineFileName(part);
    return { stem: `SACC${ part }`, part, sourceFile: `${ SOURCE_DIR }/${ fileName }`, outputFile: `${ OUTPUT_DIR }/${ fileName }` };
  }

  const stem = rawStem.toLowerCase() === "sacccountrylists" ? "SACCCountryLists" : rawStem;
  return { stem, part: null, sourceFile: `dirty/${ stem }.htm`, outputFile: `clean/${ stem }.htm` };
};

const argStems = process.argv.slice(2);
const files = argStems.length
  ? argStems.map(resolveStem)
  : (await fs.readdir(SOURCE_DIR))
    .map(parseBaselineFileName)
    .filter((n) => n !== null)
    .sort((a, b) => a - b)
    .map((n) => resolveStem(`SACC${ n }`));

// A batch run fans out to one child process per file (see runParallel.js); each
// child comes back through this same script with a single stem.
if (files.length > 1 && !process.env.SACC_SERIAL) {
  const failures = await runStemsInParallel(fileURLToPath(import.meta.url), files.map((f) => f.stem));
  if (failures) process.exitCode = 1;
} else {
  for (const file of files) await cleanBaselineFile(file);
}

// Writes the taxonomy rows convertFamilySpeciesLists parsed (the records the
// familySpeciesList markup was built from) as <outputFile>.json next to the
// HTML. Tracked in git alongside the HTML so a live-site update shows up as a
// readable data diff ("species X moved to family Y") rather than a diff of
// thousands of lines of markup. Pages with no taxonomy list get no sidecar.
async function writeSpeciesListSidecar(results, outputFile) {
  const rows = results.find((r) => r.name === "convertFamilySpeciesLists")?.value?.rows;
  if (!rows?.length) return;

  const sidecarFile = outputFile.replace(/\.htm$/i, ".json");
  await fs.writeFile(sidecarFile, JSON.stringify(rows, null, 2) + "\n", "utf8");
  console.log(`Wrote ${ sidecarFile } (${ rows.length } rows).`);
}

async function cleanBaselineFile({ stem, part, sourceFile, outputFile }) {
  // The dirty source titles are inconsistent (some correct, some missing the part
  // number, part 1's is a completely different string) — rebuild it from the part
  // number we already know instead of trying to patch the original text.
  const title = part ? `A classification of the bird species of South America. Part ${ part }` : undefined;

  // "SACCn" stems land two directories deep (clean/baseline/); SACCCountryLists
  // has its own stylesheet; everything else lands directly under clean/ and
  // uses replaceHeadElement's default cssHref (../css/styles.css).
  const cssHref = part
    ? "../../css/styles.css"
    : stem === "SACCCountryLists"
      ? "../css/countryLists.css"
      : undefined;
  const replaceBaselineHeadElement = (document) =>
    replaceHeadElement(document, { ...(cssHref ? { cssHref } : {}), ...(title ? { title } : {}) });

  const steps = [
    stripComments,
    replaceHtmlElement,
    replaceBaselineHeadElement,
    simplifyBanner,
    simplifyLineSeparators,
    stripSpans,
    unwrapGramESpans,
    unwrapSpeciesnameSpans,
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
    trimFormattingTagWhitespace,
    unwrapPunctuationOnlyFormattingTags,
    combineAbbreviatedItalicNames,
    normalizeSpanNestingOrder,

    convertPartHeaders,
    convertSaccFooter,
    removeDivWrapper,
    addTaxonomyLevels,

    // add these steps if true
    ...(stem === "SACCCountryLists" ? [convertSpeciesListTable, classifySpeciesListColumns, convertStatusCodes] : []),
    ...(part === 1 ? [convertMembershipSection] : []),
    ...(part ? [convertFootnotes, shortenSaccPropLinks] : [])
  ];

  try {
    const { results } = await createCleanHtml({ sourceFile, outputFile, cleanupSteps: steps });
    logResults(results);
    console.log(`Wrote ${ outputFile }.`);
    await writeSpeciesListSidecar(results, outputFile);
  } catch (err) {
    console.error(`Failed ${ stem } (${ sourceFile }): ${ err instanceof Error ? err.message : err }`);
    process.exitCode = 1;
  }
}
