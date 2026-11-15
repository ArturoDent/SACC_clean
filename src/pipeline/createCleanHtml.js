// @ts-check
import { readFile } from "node:fs/promises";
import * as jsdom from "jsdom";
import { serializeAndWriteClean } from "./writeClean.js";

const { JSDOM } = jsdom;

const createDom = (html) => {
  const virtualConsole = new jsdom.VirtualConsole();
  // Word's embedded stylesheets are full of mso-* rules jsdom cannot parse;
  // everything else jsdom complains about is worth seeing.
  virtualConsole.on("jsdomError", (/** @type {any} */ error) => {
    if (error.type !== "css-parsing") console.warn(error.message);
  });

  return new JSDOM(html, { virtualConsole, contentType: "text/html" });
};

export const createCleanHtml = async ({ sourceFile, outputFile, cleanupSteps }) => {
  const html = await readFile(sourceFile, "utf8");
  const dom = createDom(html);
  const { document } = dom.window;

  const results = [];

  for (const cleanupStep of cleanupSteps) {
    const name = cleanupStep.name || "anonymous";
    try {
      const value = await cleanupStep(document);
      results.push({ name, status: "fulfilled", value, message: `Step ${ name } succeeded: ${ value.message }` });
    }
    catch (err) {
      const reason = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
      results.push({ name, status: "rejected", reason, error: err, message: `Step ${ name } failed: ${ reason }` });
    }
  }

  const { nestingResult } = await serializeAndWriteClean(dom, outputFile);
  results.push({
    name: "normalizeSpanNestingOrder",
    status: "fulfilled",
    value: nestingResult,
    message: `Step normalizeSpanNestingOrder (post-merge) succeeded: ${ nestingResult.message }`
  });

  return { outputFile, results };
};

// Shared by both pipelines: prints each step's summary, routes failures to
// stderr, and marks the process as failed so a long batch cannot end green
// with a broken step buried in the middle of the log.
export const logResults = (results) => {
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(result.message);
      process.exitCode = 1;
      continue;
    }
    if (result.message) console.log(result.message);
    for (const item of result.value?.skipped ?? []) {
      console.log(`  - needs manual review: <${ item.tag }> ${ item.outerHTML }`);
    }
  }
};
